package printagent

import (
	"strings"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	valid := map[string]string{
		"API_BASE_URL": "https://tickets.example.test/",
		"AGENT_TOKEN":  strings.Repeat("a", 32),
		"DEVICE_PATH":  "/dev/usb/lp0",
	}

	config, err := LoadConfig(func(key string) (string, bool) {
		value, ok := valid[key]
		return value, ok
	})
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}
	if config.APIBaseURL.String() != "https://tickets.example.test" {
		t.Errorf("APIBaseURL = %q", config.APIBaseURL)
	}
	if config.AgentToken != valid["AGENT_TOKEN"] || config.DevicePath != valid["DEVICE_PATH"] {
		t.Errorf("LoadConfig() returned unexpected validated values")
	}
}

func TestLoadConfigRejectsInvalidEnvironment(t *testing.T) {
	valid := map[string]string{
		"API_BASE_URL": "https://tickets.example.test",
		"AGENT_TOKEN":  strings.Repeat("a", 32),
		"DEVICE_PATH":  "/dev/usb/lp0",
	}
	tests := []struct {
		name   string
		key    string
		value  string
		remove bool
	}{
		{name: "missing API_BASE_URL", key: "API_BASE_URL", remove: true},
		{name: "invalid API_BASE_URL", key: "API_BASE_URL", value: "file:///tmp/printer"},
		{name: "API_BASE_URL path", key: "API_BASE_URL", value: "https://tickets.example.test/api"},
		{name: "missing AGENT_TOKEN", key: "AGENT_TOKEN", remove: true},
		{name: "short AGENT_TOKEN", key: "AGENT_TOKEN", value: strings.Repeat("a", 31)},
		{name: "whitespace in AGENT_TOKEN", key: "AGENT_TOKEN", value: strings.Repeat("a", 31) + " "},
		{name: "missing DEVICE_PATH", key: "DEVICE_PATH", remove: true},
		{name: "relative DEVICE_PATH", key: "DEVICE_PATH", value: "printer"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			environment := make(map[string]string, len(valid))
			for key, value := range valid {
				environment[key] = value
			}
			if test.remove {
				delete(environment, test.key)
			} else {
				environment[test.key] = test.value
			}
			if _, err := LoadConfig(func(key string) (string, bool) {
				value, ok := environment[key]
				return value, ok
			}); err == nil {
				t.Fatal("LoadConfig() unexpectedly succeeded")
			}
		})
	}
}
