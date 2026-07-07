package manifest

import (
	"errors"
	"fmt"
	url2 "net/url"

	"github.com/luiscruzcwb/timoneiro/pkg/registry/helpers"
	"github.com/luiscruzcwb/timoneiro/pkg/types"
	ref "github.com/distribution/reference"
	"github.com/sirupsen/logrus"
)

// BuildManifestURL from raw image data
func BuildManifestURL(container types.Container) (string, error) {
	normalizedRef, err := ref.ParseDockerRef(container.ImageName())
	if err != nil {
		return "", err
	}
	normalizedTaggedRef, isTagged := normalizedRef.(ref.NamedTagged)
	if !isTagged {
		return "", errors.New("Parsed container image ref has no tag: " + normalizedRef.String())
	}

	host, _ := helpers.GetRegistryAddress(normalizedTaggedRef.Name())
	img, tag := ref.Path(normalizedTaggedRef), normalizedTaggedRef.Tag()

	logrus.WithFields(logrus.Fields{
		"image": img,
		"tag":   tag,
		"host":  host,
	}).Debug("Parsing image ref")

	url := url2.URL{
		Scheme: "https",
		Host:   host,
		Path:   fmt.Sprintf("/v2/%s/manifests/%s", img, tag),
	}
	return url.String(), nil
}
