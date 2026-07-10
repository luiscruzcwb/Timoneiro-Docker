package registry

import (
	"context"

	"github.com/luiscruzcwb/timoneiro/pkg/registry/helpers"
	timoneiroTypes "github.com/luiscruzcwb/timoneiro/pkg/types"
	ref "github.com/distribution/reference"
	"github.com/docker/docker/api/types/image"
	log "github.com/sirupsen/logrus"
)

// GetPullOptions creates a struct with all options needed for pulling images from a registry
func GetPullOptions(imageName string) (image.PullOptions, error) {
	auth, err := EncodedAuth(imageName)
	log.Debugf("Got image name: %s", imageName)
	if err != nil {
		return image.PullOptions{}, err
	}

	if auth == "" {
		return image.PullOptions{}, nil
	}

	return image.PullOptions{
		RegistryAuth:  auth,
		PrivilegeFunc: DefaultAuthHandler,
	}, nil
}

// DefaultAuthHandler will be invoked if an AuthConfig is rejected
func DefaultAuthHandler(context.Context) (string, error) {
	log.Debug("Authentication request was rejected. Trying again without authentication")
	return "", nil
}

// WarnOnAPIConsumption returns true if the registry is known to respond well to HTTP HEAD requests
func WarnOnAPIConsumption(container timoneiroTypes.Container) bool {
	normalizedRef, err := ref.ParseNormalizedNamed(container.ImageName())
	if err != nil {
		return true
	}

	containerHost, err := helpers.GetRegistryAddress(normalizedRef.Name())
	if err != nil {
		return true
	}

	if containerHost == helpers.DefaultRegistryHost || containerHost == "ghcr.io" {
		return true
	}

	return false
}
