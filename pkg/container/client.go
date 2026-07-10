package container

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	sdkClient "github.com/docker/docker/client"
	log "github.com/sirupsen/logrus"
	"golang.org/x/net/context"

	"github.com/luiscruzcwb/timoneiro/pkg/registry"
	"github.com/luiscruzcwb/timoneiro/pkg/registry/digest"
	t "github.com/luiscruzcwb/timoneiro/pkg/types"
)

const defaultStopSignal = "SIGTERM"

// Client is the interface through which timoneiro interacts with the Docker API.
type Client interface {
	ListContainers(t.Filter) ([]t.Container, error)
	GetContainer(containerID t.ContainerID) (t.Container, error)
	StopContainer(t.Container, time.Duration) error
	StartContainer(t.Container) (t.ContainerID, error)
	RenameContainer(t.Container, string) error
	IsContainerStale(t.Container, t.UpdateParams) (stale bool, latestImage t.ImageID, err error)
	ExecuteCommand(containerID t.ContainerID, command string, timeout int) (SkipUpdate bool, err error)
	RemoveImageByID(t.ImageID) error
	WarnOnHeadPullFailed(container t.Container) bool
	PullImageByName(ctx context.Context, imageName string) error
}

// NewClient returns a new Client instance which can be used to interact with the Docker API.
func NewClient(opts ClientOptions) Client {
	cli, err := sdkClient.NewClientWithOpts(sdkClient.FromEnv)
	if err != nil {
		log.Fatalf("Error instantiating Docker client: %s", err)
	}
	return dockerClient{
		api:           cli,
		ClientOptions: opts,
	}
}

// NewClientWithHost returns a Docker client connecting to a specific host
func NewClientWithHost(host string, opts ClientOptions) (Client, error) {
	cli, err := sdkClient.NewClientWithOpts(
		sdkClient.WithHost(host),
		sdkClient.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, err
	}
	return dockerClient{
		api:           cli,
		ClientOptions: opts,
	}, nil
}

// ClientOptions contains the options for how the docker client wrapper should behave
type ClientOptions struct {
	RemoveVolumes     bool
	IncludeStopped    bool
	ReviveStopped     bool
	IncludeRestarting bool
	WarnOnHeadFailed  WarningStrategy
}

// WarningStrategy is a value determining when to show warnings
type WarningStrategy string

const (
	WarnAlways WarningStrategy = "always"
	WarnNever  WarningStrategy = "never"
	WarnAuto   WarningStrategy = "auto"
)

type dockerClient struct {
	api sdkClient.CommonAPIClient
	ClientOptions
}

func (client dockerClient) WarnOnHeadPullFailed(container t.Container) bool {
	if client.WarnOnHeadFailed == WarnAlways {
		return true
	}
	if client.WarnOnHeadFailed == WarnNever {
		return false
	}
	return registry.WarnOnAPIConsumption(container)
}

func (client dockerClient) ListContainers(fn t.Filter) ([]t.Container, error) {
	cs := []t.Container{}
	bg := context.Background()

	filter := client.createListFilter()
	containers, err := client.api.ContainerList(bg, container.ListOptions{Filters: filter})
	if err != nil {
		return nil, err
	}

	for _, runningContainer := range containers {
		c, err := client.GetContainer(t.ContainerID(runningContainer.ID))
		if err != nil {
			return nil, err
		}
		if fn(c) {
			cs = append(cs, c)
		}
	}
	return cs, nil
}

func (client dockerClient) createListFilter() filters.Args {
	filterArgs := filters.NewArgs()
	filterArgs.Add("status", "running")
	if client.IncludeStopped {
		filterArgs.Add("status", "created")
		filterArgs.Add("status", "exited")
	}
	if client.IncludeRestarting {
		filterArgs.Add("status", "restarting")
	}
	return filterArgs
}

func (client dockerClient) GetContainer(containerID t.ContainerID) (t.Container, error) {
	bg := context.Background()

	containerInfo, err := client.api.ContainerInspect(bg, string(containerID))
	if err != nil {
		return &Container{}, err
	}

	netType, netContainerID, found := strings.Cut(string(containerInfo.HostConfig.NetworkMode), ":")
	if found && netType == "container" {
		parentContainer, err := client.api.ContainerInspect(bg, netContainerID)
		if err != nil {
			log.Warnf("Unable to resolve network container: %v", err)
		} else {
			containerInfo.HostConfig.NetworkMode = container.NetworkMode(fmt.Sprintf("container:%s", parentContainer.Name))
		}
	}

	imageInfo, _, err := client.api.ImageInspectWithRaw(bg, containerInfo.Image)
	if err != nil {
		log.Warnf("Failed to retrieve container image info: %v", err)
		return &Container{containerInfo: &containerInfo, imageInfo: nil}, nil
	}

	return &Container{containerInfo: &containerInfo, imageInfo: &imageInfo}, nil
}

func (client dockerClient) StopContainer(c t.Container, timeout time.Duration) error {
	bg := context.Background()
	signal := c.StopSignal()
	if signal == "" {
		signal = defaultStopSignal
	}

	idStr := string(c.ID())
	shortID := c.ID().ShortID()

	if c.IsRunning() {
		log.Infof("Stopping %s (%s) with %s", c.Name(), shortID, signal)
		if err := client.api.ContainerKill(bg, idStr, signal); err != nil {
			return err
		}
	}

	_ = client.waitForStopOrTimeout(c, timeout)

	if c.ContainerInfo().HostConfig.AutoRemove {
		log.Debugf("AutoRemove container %s, skipping ContainerRemove call.", shortID)
	} else {
		log.Debugf("Removing container %s", shortID)
		if err := client.api.ContainerRemove(bg, idStr, container.RemoveOptions{Force: true, RemoveVolumes: client.RemoveVolumes}); err != nil {
			if sdkClient.IsErrNotFound(err) {
				return nil
			}
			return err
		}
	}

	if err := client.waitForStopOrTimeout(c, timeout); err == nil {
		return fmt.Errorf("container %s (%s) could not be removed", c.Name(), shortID)
	}
	return nil
}

func (client dockerClient) GetNetworkConfig(c t.Container) *network.NetworkingConfig {
	config := &network.NetworkingConfig{
		EndpointsConfig: c.ContainerInfo().NetworkSettings.Networks,
	}
	for _, ep := range config.EndpointsConfig {
		aliases := make([]string, 0, len(ep.Aliases))
		cidAlias := c.ID().ShortID()
		for _, alias := range ep.Aliases {
			if alias == cidAlias {
				continue
			}
			aliases = append(aliases, alias)
		}
		ep.Aliases = aliases
	}
	return config
}

func (client dockerClient) StartContainer(c t.Container) (t.ContainerID, error) {
	bg := context.Background()
	config := c.GetCreateConfig()
	hostConfig := c.GetCreateHostConfig()
	networkConfig := client.GetNetworkConfig(c)

	simpleNetworkConfig := func() *network.NetworkingConfig {
		oneEndpoint := make(map[string]*network.EndpointSettings)
		for k, v := range networkConfig.EndpointsConfig {
			oneEndpoint[k] = v
			break
		}
		return &network.NetworkingConfig{EndpointsConfig: oneEndpoint}
	}()

	name := c.Name()
	log.Infof("Creating %s", name)

	createdContainer, err := client.api.ContainerCreate(bg, config, hostConfig, simpleNetworkConfig, nil, name)
	if err != nil {
		return "", err
	}

	if !(hostConfig.NetworkMode.IsHost()) {
		for k := range simpleNetworkConfig.EndpointsConfig {
			if err = client.api.NetworkDisconnect(bg, k, createdContainer.ID, true); err != nil {
				return "", err
			}
		}
		for k, v := range networkConfig.EndpointsConfig {
			if err = client.api.NetworkConnect(bg, k, createdContainer.ID, v); err != nil {
				return "", err
			}
		}
	}

	createdContainerID := t.ContainerID(createdContainer.ID)
	if !c.IsRunning() && !client.ReviveStopped {
		return createdContainerID, nil
	}
	return createdContainerID, client.doStartContainer(bg, c, createdContainer)
}

func (client dockerClient) doStartContainer(bg context.Context, c t.Container, creation container.CreateResponse) error {
	log.Debugf("Starting container %s (%s)", c.Name(), t.ContainerID(creation.ID).ShortID())
	return client.api.ContainerStart(bg, creation.ID, container.StartOptions{})
}

func (client dockerClient) RenameContainer(c t.Container, newName string) error {
	bg := context.Background()
	log.Debugf("Renaming container %s (%s) to %s", c.Name(), c.ID().ShortID(), newName)
	return client.api.ContainerRename(bg, string(c.ID()), newName)
}

func (client dockerClient) IsContainerStale(container t.Container, params t.UpdateParams) (stale bool, latestImage t.ImageID, err error) {
	ctx := context.Background()
	if container.IsNoPull(params) {
		log.Debugf("Skipping image pull.")
	} else if err := client.PullImage(ctx, container); err != nil {
		return false, container.SafeImageID(), err
	}
	return client.HasNewImage(ctx, container)
}

func (client dockerClient) HasNewImage(ctx context.Context, container t.Container) (hasNew bool, latestImage t.ImageID, err error) {
	currentImageID := t.ImageID(container.ContainerInfo().ContainerJSONBase.Image)
	imageName := container.ImageName()

	newImageInfo, _, err := client.api.ImageInspectWithRaw(ctx, imageName)
	if err != nil {
		return false, currentImageID, err
	}

	newImageID := t.ImageID(newImageInfo.ID)
	if newImageID == currentImageID {
		log.Debugf("No new images found for %s", container.Name())
		return false, currentImageID, nil
	}

	log.Infof("Found new %s image (%s)", imageName, newImageID.ShortID())
	return true, newImageID, nil
}

func (client dockerClient) PullImage(ctx context.Context, container t.Container) error {
	imageName := container.ImageName()

	if strings.HasPrefix(imageName, "sha256:") {
		return fmt.Errorf("container uses a pinned image, cannot be updated by timoneiro")
	}

	opts, err := registry.GetPullOptions(imageName)
	if err != nil {
		return err
	}

	if match, err := digest.CompareDigest(container, opts.RegistryAuth); errors.Is(err, digest.ErrLocalImage) {
		log.WithField("image", imageName).Debug("Image has no RepoDigests — treating as a local build, skipping registry check")
		return err
	} else if err != nil {
		headLevel := log.DebugLevel
		if client.WarnOnHeadPullFailed(container) {
			headLevel = log.WarnLevel
		}
		log.WithField("image", imageName).Logf(headLevel, "Could not do a head request for %q, falling back to regular pull.", imageName)
		log.WithField("image", imageName).Log(headLevel, "Reason: ", err)
	} else if match {
		log.Debug("No pull needed. Skipping image.")
		return nil
	}

	response, err := client.api.ImagePull(ctx, imageName, opts)
	if err != nil {
		return err
	}
	defer response.Close()
	if _, err = io.ReadAll(response); err != nil {
		return err
	}
	return nil
}

func (client dockerClient) PullImageByName(ctx context.Context, imageName string) error {
	opts, err := registry.GetPullOptions(imageName)
	if err != nil {
		return err
	}
	response, err := client.api.ImagePull(ctx, imageName, opts)
	if err != nil {
		return err
	}
	defer response.Close()
	_, err = io.ReadAll(response)
	return err
}

func (client dockerClient) RemoveImageByID(id t.ImageID) error {
	log.Infof("Removing image %s", id.ShortID())
	_, err := client.api.ImageRemove(context.Background(), string(id), image.RemoveOptions{Force: true})
	return err
}

func (client dockerClient) ExecuteCommand(containerID t.ContainerID, command string, timeout int) (SkipUpdate bool, err error) {
	bg := context.Background()

	execConfig := container.ExecOptions{
		Tty:    true,
		Detach: false,
		Cmd:    []string{"sh", "-c", command},
	}
	exec, err := client.api.ContainerExecCreate(bg, string(containerID), execConfig)
	if err != nil {
		return false, err
	}

	response, attachErr := client.api.ContainerExecAttach(bg, exec.ID, container.ExecAttachOptions{Tty: true, Detach: false})
	if attachErr != nil {
		log.Errorf("Failed to extract command exec logs: %v", attachErr)
	}

	if err = client.api.ContainerExecStart(bg, exec.ID, container.ExecStartOptions{Detach: false, Tty: true}); err != nil {
		return false, err
	}

	var output string
	if attachErr == nil {
		defer response.Close()
		var writer bytes.Buffer
		if written, err := writer.ReadFrom(response.Reader); err != nil {
			log.Error(err)
		} else if written > 0 {
			output = writer.String()
		}
	}

	return client.waitForExecOrTimeout(bg, exec.ID, output, timeout)
}

func (client dockerClient) waitForExecOrTimeout(bg context.Context, ID string, execOutput string, timeout int) (SkipUpdate bool, err error) {
	const ExTempFail = 75
	var ctx context.Context
	var cancel context.CancelFunc

	if timeout > 0 {
		ctx, cancel = context.WithTimeout(bg, time.Duration(timeout)*time.Minute)
		defer cancel()
	} else {
		ctx = bg
	}

	for {
		execInspect, err := client.api.ContainerExecInspect(ctx, ID)
		if err != nil {
			return false, err
		}
		if execInspect.Running {
			time.Sleep(1 * time.Second)
			continue
		}
		if len(execOutput) > 0 {
			log.Infof("Command output:\n%v", execOutput)
		}
		if execInspect.ExitCode == ExTempFail {
			return true, nil
		}
		if execInspect.ExitCode > 0 {
			return false, fmt.Errorf("command exited with code %v  %s", execInspect.ExitCode, execOutput)
		}
		break
	}
	return false, nil
}

func (client dockerClient) waitForStopOrTimeout(c t.Container, waitTime time.Duration) error {
	bg := context.Background()
	timeout := time.After(waitTime)
	for {
		select {
		case <-timeout:
			return nil
		default:
			if ci, err := client.api.ContainerInspect(bg, string(c.ID())); err != nil {
				return err
			} else if !ci.State.Running {
				return nil
			}
		}
		time.Sleep(1 * time.Second)
	}
}
