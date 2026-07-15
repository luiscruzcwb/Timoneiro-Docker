package container

import (
	"context"
	"fmt"

	t "github.com/luiscruzcwb/timoneiro/pkg/types"
	log "github.com/sirupsen/logrus"
)

// PerformUpdate stops the old container and starts a new one with the latest image.
// Returns the new container ID or an error. Exported so both the main engine
// (local/direct Docker hosts) and the agent binary (remote hosts reachable only
// through its HTTP API) can share the same recreate logic.
func PerformUpdate(cli Client, c t.Container, params t.UpdateParams) (t.ContainerID, error) {
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

// PerformRollback pulls the previousImage and restarts the container using it.
func PerformRollback(cli Client, c t.Container, previousImage string, params t.UpdateParams) error {
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
