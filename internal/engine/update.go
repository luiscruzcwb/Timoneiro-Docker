package engine

import (
	"context"
	"fmt"
	"time"

	"github.com/luiscruzcwb/timoneiro/pkg/container"
	t "github.com/luiscruzcwb/timoneiro/pkg/types"
	log "github.com/sirupsen/logrus"
)

// performUpdate stops the old container and starts a new one with the latest image.
// Returns the new container ID or an error.
func performUpdate(cli container.Client, c t.Container, params t.UpdateParams) (t.ContainerID, error) {
	if !c.ToRestart() {
		c.SetStale(true)
	}

	if err := cli.StopContainer(c, params.Timeout); err != nil {
		return "", fmt.Errorf("failed to stop container %s: %w", c.Name(), err)
	}

	newID, err := cli.StartContainer(c)
	if err != nil {
		return "", fmt.Errorf("failed to start container %s: %w", c.Name(), err)
	}

	if params.Cleanup {
		if imageID := c.SafeImageID(); imageID != "" {
			if err := cli.RemoveImageByID(imageID); err != nil {
				log.Warnf("Failed to remove old image %s: %v", imageID, err)
			}
		}
	}

	return newID, nil
}

// performRollback pulls the previousImage and restarts the container using it.
func performRollback(cli container.Client, c t.Container, previousImage string, params t.UpdateParams) error {
	log.Infof("Rolling back %s to %s", c.Name(), previousImage)

	if err := cli.PullImageByName(context.Background(), previousImage); err != nil {
		log.Warnf("Could not pull previous image %s: %v — will try with cached image", previousImage, err)
	}

	// Redirect the container config so StartContainer uses the old image
	c.ContainerInfo().Config.Image = previousImage

	if err := cli.StopContainer(c, params.Timeout); err != nil {
		return fmt.Errorf("failed to stop container %s during rollback: %w", c.Name(), err)
	}

	_, err := cli.StartContainer(c)
	if err != nil {
		return fmt.Errorf("failed to restart container %s during rollback: %w", c.Name(), err)
	}

	return nil
}

// waitForHealthy polls container health status until healthy or timeout
func waitForHealthy(cli container.Client, containerID t.ContainerID, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		c, err := cli.GetContainer(containerID)
		if err != nil {
			return err
		}
		info := c.ContainerInfo()
		if info == nil || info.State == nil {
			return fmt.Errorf("could not get container state")
		}
		health := info.State.Health
		if health == nil {
			return nil
		}
		switch health.Status {
		case "healthy":
			return nil
		case "unhealthy":
			return fmt.Errorf("container became unhealthy after update")
		}
		time.Sleep(2 * time.Second)
	}
	return fmt.Errorf("timed out waiting for container to become healthy")
}
