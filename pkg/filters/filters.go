package filters

import (
	"regexp"
	"strings"

	t "github.com/luiscruzcwb/timoneiro/pkg/types"
)

// NoFilter will not filter out any containers
func NoFilter(t.FilterableContainer) bool { return true }

// FilterByNames returns all containers that match one of the specified names
func FilterByNames(names []string, baseFilter t.Filter) t.Filter {
	if len(names) == 0 {
		return baseFilter
	}
	return func(c t.FilterableContainer) bool {
		for _, name := range names {
			if name == c.Name() || name == c.Name()[1:] {
				return baseFilter(c)
			}
			if re, err := regexp.Compile(name); err == nil {
				indices := re.FindStringIndex(c.Name())
				if indices == nil {
					continue
				}
				if indices[0] <= 1 && indices[1] >= len(c.Name())-1 {
					return baseFilter(c)
				}
			}
		}
		return false
	}
}

// FilterByDisableNames returns all containers that don't match any of the specified names
func FilterByDisableNames(disableNames []string, baseFilter t.Filter) t.Filter {
	if len(disableNames) == 0 {
		return baseFilter
	}
	return func(c t.FilterableContainer) bool {
		for _, name := range disableNames {
			if name == c.Name() || name == c.Name()[1:] {
				return false
			}
		}
		return baseFilter(c)
	}
}

// FilterByEnableLabel returns all containers that have the enabled label set
func FilterByEnableLabel(baseFilter t.Filter) t.Filter {
	return func(c t.FilterableContainer) bool {
		_, ok := c.Enabled()
		if !ok {
			return false
		}
		return baseFilter(c)
	}
}

// FilterByDisabledLabel filters out containers that have the enabled label set to false
func FilterByDisabledLabel(baseFilter t.Filter) t.Filter {
	return func(c t.FilterableContainer) bool {
		enabledLabel, ok := c.Enabled()
		if ok && !enabledLabel {
			return false
		}
		return baseFilter(c)
	}
}

// FilterByScope returns all containers that belong to a specific scope
func FilterByScope(scope string, baseFilter t.Filter) t.Filter {
	return func(c t.FilterableContainer) bool {
		containerScope, containerHasScope := c.Scope()
		if !containerHasScope || containerScope == "" {
			containerScope = "none"
		}
		if containerScope == scope {
			return baseFilter(c)
		}
		return false
	}
}

// FilterByImage returns all containers that have a specific image
func FilterByImage(images []string, baseFilter t.Filter) t.Filter {
	if images == nil {
		return baseFilter
	}
	return func(c t.FilterableContainer) bool {
		image := strings.Split(c.ImageName(), ":")[0]
		for _, targetImage := range images {
			if image == targetImage {
				return baseFilter(c)
			}
		}
		return false
	}
}

// BuildFilter creates the needed filter of containers
func BuildFilter(names []string, disableNames []string, enableLabel bool, scope string) (t.Filter, string) {
	sb := strings.Builder{}
	filter := NoFilter
	filter = FilterByNames(names, filter)
	filter = FilterByDisableNames(disableNames, filter)

	if len(names) > 0 {
		sb.WriteString("which name matches \"")
		for i, n := range names {
			sb.WriteString(n)
			if i < len(names)-1 {
				sb.WriteString(`" or "`)
			}
		}
		sb.WriteString(`", `)
	}

	if enableLabel {
		filter = FilterByEnableLabel(filter)
		sb.WriteString("using enable label, ")
	}

	if scope != "" {
		filter = FilterByScope(scope, filter)
		sb.WriteString(`in scope "`)
		sb.WriteString(scope)
		sb.WriteString(`", `)
	}
	filter = FilterByDisabledLabel(filter)

	filterDesc := "Checking all containers (except explicitly disabled with label)"
	if sb.Len() > 0 {
		filterDesc = "Only checking containers " + sb.String()
		filterDesc = filterDesc[:len(filterDesc)-2]
	}

	return filter, filterDesc
}
