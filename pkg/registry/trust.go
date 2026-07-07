package registry

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"

	"github.com/luiscruzcwb/timoneiro/pkg/registry/helpers"
	cliconfig "github.com/docker/cli/cli/config"
	"github.com/docker/cli/cli/config/configfile"
	"github.com/docker/cli/cli/config/credentials"
	"github.com/docker/cli/cli/config/types"
	log "github.com/sirupsen/logrus"
)

// DBCredentialsLookup is registered by the engine to resolve credentials from the database.
// Returns username, password, and whether a match was found.
var DBCredentialsLookup func(host string) (username, password string, ok bool)

// EncodedAuth returns an encoded auth config for the given registry
func EncodedAuth(ref string) (string, error) {
	auth, err := EncodedEnvAuth()
	if err == nil {
		return auth, nil
	}
	if DBCredentialsLookup != nil {
		host, herr := helpers.GetRegistryAddress(ref)
		if herr == nil {
			if user, pass, ok := DBCredentialsLookup(host); ok {
				return EncodeAuth(types.AuthConfig{Username: user, Password: pass})
			}
		}
	}
	return EncodedConfigAuth(ref)
}

// EncodedEnvAuth returns an encoded auth config loaded from environment variables
func EncodedEnvAuth() (string, error) {
	username := os.Getenv("REPO_USER")
	password := os.Getenv("REPO_PASS")
	if username != "" && password != "" {
		auth := types.AuthConfig{
			Username: username,
			Password: password,
		}
		log.Debugf("Loaded auth credentials for registry user %s from environment", auth.Username)
		return EncodeAuth(auth)
	}
	return "", errors.New("registry auth environment variables (REPO_USER, REPO_PASS) not set")
}

// EncodedConfigAuth returns an encoded auth config for the given registry loaded from the docker config
func EncodedConfigAuth(imageRef string) (string, error) {
	server, err := helpers.GetRegistryAddress(imageRef)
	if err != nil {
		return "", err
	}

	configDir := os.Getenv("DOCKER_CONFIG")
	if configDir == "" {
		configDir = "/"
	}
	configFile, err := cliconfig.Load(configDir)
	if err != nil {
		return "", err
	}
	credStore := CredentialsStore(*configFile)
	auth, _ := credStore.Get(server)
	if auth == (types.AuthConfig{}) {
		log.WithField("config_file", configFile.Filename).Debugf("No credentials for %s found", server)
		return "", nil
	}
	log.Debugf("Loaded auth credentials for user %s, on registry %s, from file %s", auth.Username, server, configFile.Filename)
	return EncodeAuth(auth)
}

// CredentialsStore returns a new credentials store based on the configuration file
func CredentialsStore(configFile configfile.ConfigFile) credentials.Store {
	if configFile.CredentialsStore != "" {
		return credentials.NewNativeStore(&configFile, configFile.CredentialsStore)
	}
	return credentials.NewFileStore(&configFile)
}

// EncodeAuth Base64 encodes an AuthConfig struct
func EncodeAuth(authConfig types.AuthConfig) (string, error) {
	buf, err := json.Marshal(authConfig)
	if err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(buf), nil
}
