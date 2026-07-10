package container

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	wt "github.com/luiscruzcwb/timoneiro/pkg/types"
	"github.com/luiscruzcwb/timoneiro/internal/util"
	"github.com/sirupsen/logrus"

	dockercontainer "github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/go-connections/nat"
)

// NewContainer returns a new Container instance instantiated with the specified info structs.
func NewContainer(containerInfo *dockercontainer.InspectResponse, imageInfo *image.InspectResponse) *Container {
	return &Container{
		containerInfo: containerInfo,
		imageInfo:     imageInfo,
	}
}

// Container represents a running Docker container.
type Container struct {
	LinkedToRestarting bool
	Stale              bool

	containerInfo *dockercontainer.InspectResponse
	imageInfo     *image.InspectResponse
}

func (c *Container) IsLinkedToRestarting() bool { return c.LinkedToRestarting }
func (c *Container) IsStale() bool              { return c.Stale }
func (c *Container) SetLinkedToRestarting(value bool) { c.LinkedToRestarting = value }
func (c *Container) SetStale(value bool)              { c.Stale = value }

func (c Container) ContainerInfo() *dockercontainer.InspectResponse { return c.containerInfo }

func (c Container) ID() wt.ContainerID {
	return wt.ContainerID(c.containerInfo.ID)
}

func (c Container) IsRunning() bool    { return c.containerInfo.State.Running }
func (c Container) IsRestarting() bool { return c.containerInfo.State.Restarting }
func (c Container) Name() string       { return c.containerInfo.Name }

func (c Container) ImageID() wt.ImageID {
	return wt.ImageID(c.imageInfo.ID)
}

func (c Container) SafeImageID() wt.ImageID {
	if c.imageInfo == nil {
		return ""
	}
	return wt.ImageID(c.imageInfo.ID)
}

func (c Container) ImageName() string {
	imageName, ok := c.getLabelValue(zodiacLabel)
	if !ok {
		imageName = c.containerInfo.Config.Image
	}
	if !strings.Contains(imageName, ":") {
		imageName = fmt.Sprintf("%s:latest", imageName)
	}
	return imageName
}

func (c Container) Enabled() (bool, bool) {
	rawBool, ok := c.getLabelValue(enableLabel)
	if !ok {
		return false, false
	}
	parsedBool, err := strconv.ParseBool(rawBool)
	if err != nil {
		return false, false
	}
	return parsedBool, true
}

func (c Container) IsMonitorOnly(params wt.UpdateParams) bool {
	return c.getContainerOrGlobalBool(params.MonitorOnly, monitorOnlyLabel, params.LabelPrecedence)
}

func (c Container) IsNoPull(params wt.UpdateParams) bool {
	return c.getContainerOrGlobalBool(params.NoPull, noPullLabel, params.LabelPrecedence)
}

func (c Container) getContainerOrGlobalBool(globalVal bool, label string, contPrecedence bool) bool {
	if contVal, err := c.getBoolLabelValue(label); err != nil {
		if !errors.Is(err, errorLabelNotFound) {
			logrus.WithField("error", err).WithField("label", label).Warn("Failed to parse label value")
		}
		return globalVal
	} else {
		if contPrecedence {
			return contVal
		}
		return contVal || globalVal
	}
}

func (c Container) Scope() (string, bool) {
	rawString, ok := c.getLabelValue(scope)
	if !ok {
		return "", false
	}
	return rawString, true
}

func (c Container) Links() []string {
	var links []string

	dependsOnLabelValue := c.getLabelValueOrEmpty(dependsOnLabel)
	if dependsOnLabelValue != "" {
		for _, link := range strings.Split(dependsOnLabelValue, ",") {
			if !strings.HasPrefix(link, "/") {
				link = "/" + link
			}
			links = append(links, link)
		}
		return links
	}

	if c.containerInfo != nil && c.containerInfo.HostConfig != nil {
		for _, link := range c.containerInfo.HostConfig.Links {
			name := strings.Split(link, ":")[0]
			links = append(links, name)
		}
		networkMode := c.containerInfo.HostConfig.NetworkMode
		if networkMode.IsContainer() {
			links = append(links, networkMode.ConnectedContainer())
		}
	}

	return links
}

func (c Container) ToRestart() bool { return c.Stale || c.LinkedToRestarting }

func (c Container) IsTimoneiro() bool {
	return ContainsTimoneiroLabel(c.containerInfo.Config.Labels)
}

func (c Container) PreUpdateTimeout() int {
	val := c.getLabelValueOrEmpty(preUpdateTimeoutLabel)
	minutes, err := strconv.Atoi(val)
	if err != nil || val == "" {
		return 1
	}
	return minutes
}

func (c Container) PostUpdateTimeout() int {
	val := c.getLabelValueOrEmpty(postUpdateTimeoutLabel)
	minutes, err := strconv.Atoi(val)
	if err != nil || val == "" {
		return 1
	}
	return minutes
}

func (c Container) StopSignal() string { return c.getLabelValueOrEmpty(signalLabel) }

func (c Container) GetCreateConfig() *dockercontainer.Config {
	config := c.containerInfo.Config
	hostConfig := c.containerInfo.HostConfig
	imageConfig := c.imageInfo.Config

	if config.WorkingDir == imageConfig.WorkingDir {
		config.WorkingDir = ""
	}
	if config.User == imageConfig.User {
		config.User = ""
	}
	if hostConfig.NetworkMode.IsContainer() {
		config.Hostname = ""
	}
	if util.SliceEqual(config.Entrypoint, imageConfig.Entrypoint) {
		config.Entrypoint = nil
		if util.SliceEqual(config.Cmd, imageConfig.Cmd) {
			config.Cmd = nil
		}
	}
	if config.Healthcheck != nil && imageConfig.Healthcheck != nil {
		if util.SliceEqual(config.Healthcheck.Test, imageConfig.Healthcheck.Test) {
			config.Healthcheck.Test = nil
		}
		if config.Healthcheck.Retries == imageConfig.Healthcheck.Retries {
			config.Healthcheck.Retries = 0
		}
		if config.Healthcheck.Interval == imageConfig.Healthcheck.Interval {
			config.Healthcheck.Interval = 0
		}
		if config.Healthcheck.Timeout == imageConfig.Healthcheck.Timeout {
			config.Healthcheck.Timeout = 0
		}
		if config.Healthcheck.StartPeriod == imageConfig.Healthcheck.StartPeriod {
			config.Healthcheck.StartPeriod = 0
		}
	}

	config.Env = util.SliceSubtract(config.Env, imageConfig.Env)
	config.Labels = util.StringMapSubtract(config.Labels, imageConfig.Labels)
	config.Volumes = util.StructMapSubtract(config.Volumes, imageConfig.Volumes)

	for k := range config.ExposedPorts {
		if _, ok := imageConfig.ExposedPorts[string(k)]; ok {
			delete(config.ExposedPorts, k)
		}
	}
	for p := range c.containerInfo.HostConfig.PortBindings {
		config.ExposedPorts[p] = struct{}{}
	}

	config.Image = c.ImageName()
	return config
}

func (c Container) GetCreateHostConfig() *dockercontainer.HostConfig {
	hostConfig := c.containerInfo.HostConfig
	for i, link := range hostConfig.Links {
		name := link[0:strings.Index(link, ":")]
		alias := link[strings.LastIndex(link, "/"):]
		hostConfig.Links[i] = fmt.Sprintf("%s:%s", name, alias)
	}
	return hostConfig
}

func (c Container) HasImageInfo() bool { return c.imageInfo != nil }
func (c Container) ImageInfo() *image.InspectResponse { return c.imageInfo }

func (c Container) VerifyConfiguration() error {
	if c.imageInfo == nil {
		return errorNoImageInfo
	}
	containerInfo := c.ContainerInfo()
	if containerInfo == nil {
		return errorNoContainerInfo
	}
	containerConfig := containerInfo.Config
	if containerConfig == nil {
		return errorInvalidConfig
	}
	hostConfig := containerInfo.HostConfig
	if hostConfig == nil {
		return errorInvalidConfig
	}
	if len(hostConfig.PortBindings) > 0 && containerConfig.ExposedPorts == nil {
		containerConfig.ExposedPorts = make(map[nat.Port]struct{})
	}
	return nil
}
