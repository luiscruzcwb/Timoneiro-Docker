package digest

import (
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/luiscruzcwb/timoneiro/pkg/registry/auth"
	"github.com/luiscruzcwb/timoneiro/pkg/registry/manifest"
	"github.com/luiscruzcwb/timoneiro/pkg/types"
	"github.com/sirupsen/logrus"
)

const ContentDigestHeader = "Docker-Content-Digest"

// CompareDigest checks if local image digest matches registry digest
func CompareDigest(container types.Container, registryAuth string) (bool, error) {
	if !container.HasImageInfo() {
		return false, errors.New("container image info missing")
	}

	registryAuth = TransformAuth(registryAuth)
	token, err := auth.GetToken(container, registryAuth)
	if err != nil {
		return false, err
	}

	digestURL, err := manifest.BuildManifestURL(container)
	if err != nil {
		return false, err
	}

	digest, err := GetDigest(digestURL, token)
	if err != nil {
		return false, err
	}

	logrus.WithField("remote", digest).Debug("Found a remote digest to compare with")

	for _, dig := range container.ImageInfo().RepoDigests {
		localDigest := strings.Split(dig, "@")[1]
		if localDigest == digest {
			logrus.Debug("Found a match")
			return true, nil
		}
	}
	return false, nil
}

// TransformAuth from a base64 encoded json object to base64 encoded string
func TransformAuth(registryAuth string) string {
	b, _ := base64.StdEncoding.DecodeString(registryAuth)
	credentials := &types.RegistryCredentials{}
	_ = json.Unmarshal(b, credentials)
	if credentials.Username != "" && credentials.Password != "" {
		ba := []byte(fmt.Sprintf("%s:%s", credentials.Username, credentials.Password))
		registryAuth = base64.StdEncoding.EncodeToString(ba)
	}
	return registryAuth
}

// GetDigest from registry using a HEAD request
func GetDigest(url string, token string) (string, error) {
	tr := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		TLSClientConfig:       &tls.Config{InsecureSkipVerify: true},
	}
	client := &http.Client{Transport: tr}

	req, _ := http.NewRequest("HEAD", url, nil)
	req.Header.Set("User-Agent", "Timoneiro/1.0")

	if token == "" {
		return "", errors.New("could not fetch token")
	}

	req.Header.Add("Authorization", token)
	req.Header.Add("Accept", "application/vnd.docker.distribution.manifest.v2+json")
	req.Header.Add("Accept", "application/vnd.docker.distribution.manifest.list.v2+json")
	req.Header.Add("Accept", "application/vnd.oci.image.index.v1+json")

	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		wwwAuthHeader := res.Header.Get("www-authenticate")
		if wwwAuthHeader == "" {
			wwwAuthHeader = "not present"
		}
		return "", fmt.Errorf("registry responded to head request with %q, auth: %q", res.Status, wwwAuthHeader)
	}
	return res.Header.Get(ContentDigestHeader), nil
}
