package container

import "strconv"

const (
	timoneirLabel          = "dev.timoneiro.enable"
	signalLabel            = "dev.timoneiro.stop-signal"
	enableLabel            = "dev.timoneiro.enable"
	monitorOnlyLabel       = "dev.timoneiro.monitor-only"
	noPullLabel            = "dev.timoneiro.no-pull"
	dependsOnLabel         = "dev.timoneiro.depends-on"
	zodiacLabel            = "com.centurylinklabs.zodiac.original-image"
	scope                  = "dev.timoneiro.scope"
	preCheckLabel          = "dev.timoneiro.lifecycle.pre-check"
	postCheckLabel         = "dev.timoneiro.lifecycle.post-check"
	preUpdateLabel         = "dev.timoneiro.lifecycle.pre-update"
	postUpdateLabel        = "dev.timoneiro.lifecycle.post-update"
	preUpdateTimeoutLabel  = "dev.timoneiro.lifecycle.pre-update-timeout"
	postUpdateTimeoutLabel = "dev.timoneiro.lifecycle.post-update-timeout"
)

func (c Container) GetLifecyclePreCheckCommand() string {
	return c.getLabelValueOrEmpty(preCheckLabel)
}

func (c Container) GetLifecyclePostCheckCommand() string {
	return c.getLabelValueOrEmpty(postCheckLabel)
}

func (c Container) GetLifecyclePreUpdateCommand() string {
	return c.getLabelValueOrEmpty(preUpdateLabel)
}

func (c Container) GetLifecyclePostUpdateCommand() string {
	return c.getLabelValueOrEmpty(postUpdateLabel)
}

// ContainsTimoneiroLabel checks whether a label map contains a valid timoneiro instance label
func ContainsTimoneiroLabel(labels map[string]string) bool {
	val, ok := labels[timoneirLabel]
	return ok && val == "true"
}

func (c Container) getLabelValueOrEmpty(label string) string {
	if val, ok := c.containerInfo.Config.Labels[label]; ok {
		return val
	}
	return ""
}

func (c Container) getLabelValue(label string) (string, bool) {
	val, ok := c.containerInfo.Config.Labels[label]
	return val, ok
}

func (c Container) getBoolLabelValue(label string) (bool, error) {
	if strVal, ok := c.containerInfo.Config.Labels[label]; ok {
		value, err := strconv.ParseBool(strVal)
		return value, err
	}
	return false, errorLabelNotFound
}
