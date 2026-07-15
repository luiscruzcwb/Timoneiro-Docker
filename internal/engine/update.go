package engine

import (
	"fmt"
	"time"

	"github.com/luiscruzcwb/timoneiro/pkg/container"
	t "github.com/luiscruzcwb/timoneiro/pkg/types"
)

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
