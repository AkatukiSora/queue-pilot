package printagent

import (
	"fmt"
	"net/url"
	"path/filepath"
	"strings"
	"unicode"
)

type Config struct {
	APIBaseURL *url.URL
	AgentToken string
	DevicePath string
}

func LoadConfig(lookup func(string) (string, bool)) (Config, error) {
	apiBaseURL, ok := lookup("API_BASE_URL")
	if !ok || strings.TrimSpace(apiBaseURL) == "" {
		return Config{}, fmt.Errorf("API_BASE_URL is required")
	}
	parsedURL, err := url.Parse(apiBaseURL)
	if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") || parsedURL.Host == "" || parsedURL.User != nil || parsedURL.RawQuery != "" || parsedURL.Fragment != "" || (parsedURL.Path != "" && parsedURL.Path != "/") {
		return Config{}, fmt.Errorf("API_BASE_URL must be an http(s) origin without credentials, path, query, or fragment")
	}
	parsedURL.Path = ""

	agentToken, ok := lookup("AGENT_TOKEN")
	if !ok || len([]rune(agentToken)) < 32 || strings.IndexFunc(agentToken, unicode.IsSpace) >= 0 {
		return Config{}, fmt.Errorf("AGENT_TOKEN must contain at least 32 non-whitespace characters")
	}

	devicePath, ok := lookup("DEVICE_PATH")
	if !ok || !filepath.IsAbs(devicePath) {
		return Config{}, fmt.Errorf("DEVICE_PATH must be an absolute path")
	}

	return Config{APIBaseURL: parsedURL, AgentToken: agentToken, DevicePath: devicePath}, nil
}
