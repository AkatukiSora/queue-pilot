package printagent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadConfigSelectsVersion2JSONFileDriver(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "print-agent.json")
	configJSON := `{"schemaVersion":1,"printerId":"11111111-1111-4111-8111-111111111111","driver":{"type":"json-file","outputDir":"/var/lib/print-agent/previews"}}`
	if err := os.WriteFile(configPath, []byte(configJSON), 0o600); err != nil {
		t.Fatal(err)
	}
	environment := map[string]string{
		"API_BASE_URL":            "https://tickets.example.test",
		"AGENT_TOKEN":             strings.Repeat("a", 32),
		"PRINT_AGENT_CONFIG_PATH": configPath,
	}
	config, err := LoadConfig(func(key string) (string, bool) {
		value, ok := environment[key]
		return value, ok
	})
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}
	if config.WireVersion != 2 || config.DriverKind != "json-file" || config.OutputDir != "/var/lib/print-agent/previews" {
		t.Errorf("loaded config = %#v", config)
	}
	if config.PrinterID != "11111111-1111-4111-8111-111111111111" {
		t.Errorf("printer ID = %q", config.PrinterID)
	}
}

func TestParseAgentConfigAcceptsEveryDriverVariant(t *testing.T) {
	for _, testCase := range []struct {
		name string
		raw  string
		kind string
	}{
		{
			name: "tm-t88v-usb",
			raw:  `{"schemaVersion":1,"printerId":"11111111-1111-4111-8111-111111111111","driver":{"type":"tm-t88v-usb","devicePath":"/dev/usb/lp0"}}`,
			kind: "tm-t88v-usb",
		},
		{
			name: "escpos-tcp",
			raw:  `{"schemaVersion":1,"printerId":"11111111-1111-4111-8111-111111111111","driver":{"type":"escpos-tcp","address":"127.0.0.1:9100"}}`,
			kind: "escpos-tcp",
		},
		{
			name: "json-file",
			raw:  `{"schemaVersion":1,"printerId":"11111111-1111-4111-8111-111111111111","driver":{"type":"json-file","outputDir":"/var/lib/print-agent/previews"}}`,
			kind: "json-file",
		},
		{
			name: "command",
			raw:  `{"schemaVersion":1,"printerId":"11111111-1111-4111-8111-111111111111","driver":{"type":"command","argv":["/usr/local/libexec/receipt-output","--mode","ticket"]}}`,
			kind: "command",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			driver, printerID, err := parseAgentConfig([]byte(testCase.raw))
			if err != nil {
				t.Fatal(err)
			}
			if driver.kind != testCase.kind || printerID != "11111111-1111-4111-8111-111111111111" {
				t.Errorf("parseAgentConfig() = (%#v, %q)", driver, printerID)
			}
		})
	}
}

func TestParseAgentConfigAcceptsTemplateFixtures(t *testing.T) {
	for _, driverType := range []string{"tm-t88v-usb", "escpos-tcp", "json-file"} {
		t.Run(driverType, func(t *testing.T) {
			raw, err := os.ReadFile(filepath.Join("testdata", "config-templates", driverType+".json"))
			if err != nil {
				t.Fatal(err)
			}
			driver, printerID, err := parseAgentConfig(raw)
			if err != nil {
				t.Fatalf("parseAgentConfig() error = %v", err)
			}
			if driver.kind != driverType || printerID != "front-desk" {
				t.Errorf("parseAgentConfig() = (%#v, %q)", driver, printerID)
			}
		})
	}
}

func TestParseAgentConfigRejectsInvalidEscposAddresses(t *testing.T) {
	for _, address := range []string{
		"bad host:9100",
		"[not-ip]:9100",
		"[127.0.0.1]:9100",
		"printer:+9100",
		"printer:65536",
	} {
		t.Run(address, func(t *testing.T) {
			raw := `{"schemaVersion":1,"printerId":"front-desk","driver":{"type":"escpos-tcp","address":"` + address + `"}}`
			if _, _, err := parseAgentConfig([]byte(raw)); err == nil {
				t.Fatalf("parseAgentConfig() accepted invalid ESC/POS address %q", address)
			}
		})
	}
}

func TestParseAgentConfigAcceptsValidEscposAddresses(t *testing.T) {
	for _, address := range []string{"printer.local:9100", "127.0.0.1:9100", "[::1]:9100"} {
		t.Run(address, func(t *testing.T) {
			raw := `{"schemaVersion":1,"printerId":"front-desk","driver":{"type":"escpos-tcp","address":"` + address + `"}}`
			if _, _, err := parseAgentConfig([]byte(raw)); err != nil {
				t.Fatalf("parseAgentConfig() error = %v", err)
			}
		})
	}
}

func TestLoadConfigRejectsInvalidDriverOneOf(t *testing.T) {
	for _, raw := range []string{
		`{"schemaVersion":1,"printerId":"11111111-1111-4111-8111-111111111111","driver":{"type":"json-file","outputDir":"/tmp/previews","address":"127.0.0.1:9100"}}`,
		`{"schemaVersion":1,"printerId":"11111111-1111-4111-8111-111111111111","driver":{"type":"unknown"}}`,
		`{"schemaVersion":1,"printerId":"Invalid","driver":{"type":"command","argv":["/usr/local/bin/receipt-hook"]}}`,
	} {
		t.Run(raw, func(t *testing.T) {
			configPath := filepath.Join(t.TempDir(), "print-agent.json")
			if err := os.WriteFile(configPath, []byte(raw), 0o600); err != nil {
				t.Fatal(err)
			}
			environment := map[string]string{
				"API_BASE_URL":            "https://tickets.example.test",
				"AGENT_TOKEN":             strings.Repeat("a", 32),
				"PRINT_AGENT_CONFIG_PATH": configPath,
			}
			if _, err := LoadConfig(func(key string) (string, bool) {
				value, ok := environment[key]
				return value, ok
			}); err == nil {
				t.Fatal("LoadConfig() accepted invalid driver config")
			}
		})
	}
}

func TestLoadConfigKeepsLegacyEnvironmentMode(t *testing.T) {
	environment := map[string]string{
		"API_BASE_URL": "https://tickets.example.test",
		"AGENT_TOKEN":  strings.Repeat("a", 32),
		"DEVICE_PATH":  "/dev/usb/lp0",
	}
	config, err := LoadConfig(func(key string) (string, bool) {
		value, ok := environment[key]
		return value, ok
	})
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}
	if config.WireVersion != 1 || config.DriverKind != "tm-t88v-usb" || config.DevicePath != "/dev/usb/lp0" {
		t.Errorf("loaded legacy config = %#v", config)
	}
}
