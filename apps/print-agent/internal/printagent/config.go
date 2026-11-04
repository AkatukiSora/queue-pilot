package printagent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"
)

const maxAgentConfigBytes = 1 << 20

type Config struct {
	APIBaseURL  *url.URL
	AgentToken  string
	WireVersion int
	PrinterID   string
	DriverKind  string
	DevicePath  string
	Address     string
	OutputDir   string
	CommandArgv []string
}

type agentConfigFile struct {
	SchemaVersion int             `json:"schemaVersion"`
	PrinterID     string          `json:"printerId"`
	Driver        json.RawMessage `json:"driver"`
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

	configPath, configured := lookup("PRINT_AGENT_CONFIG_PATH")
	if configured {
		if strings.TrimSpace(configPath) == "" || !filepath.IsAbs(configPath) {
			return Config{}, fmt.Errorf("PRINT_AGENT_CONFIG_PATH must be an absolute path")
		}
		configFile, err := os.Open(configPath)
		if err != nil {
			return Config{}, fmt.Errorf("open print-agent config: %w", err)
		}
		defer configFile.Close()
		data, err := io.ReadAll(io.LimitReader(configFile, maxAgentConfigBytes+1))
		if err != nil {
			return Config{}, fmt.Errorf("read print-agent config: %w", err)
		}
		if len(data) > maxAgentConfigBytes {
			return Config{}, fmt.Errorf("print-agent config exceeds %d bytes", maxAgentConfigBytes)
		}
		driverConfig, printerID, err := parseAgentConfig(data)
		if err != nil {
			return Config{}, err
		}
		return Config{
			APIBaseURL:  parsedURL,
			AgentToken:  agentToken,
			WireVersion: 2,
			PrinterID:   printerID,
			DriverKind:  driverConfig.kind,
			DevicePath:  driverConfig.devicePath,
			Address:     driverConfig.address,
			OutputDir:   driverConfig.outputDir,
			CommandArgv: driverConfig.commandArgv,
		}, nil
	}

	devicePath, ok := lookup("DEVICE_PATH")
	if !ok || !filepath.IsAbs(devicePath) {
		return Config{}, fmt.Errorf("DEVICE_PATH must be an absolute path")
	}
	return Config{APIBaseURL: parsedURL, AgentToken: agentToken, WireVersion: 1, DriverKind: "tm-t88v-usb", DevicePath: devicePath}, nil
}

type parsedDriverConfig struct {
	kind        string
	devicePath  string
	address     string
	outputDir   string
	commandArgv []string
}

func parseAgentConfig(data []byte) (parsedDriverConfig, string, error) {
	var file agentConfigFile
	if err := decodeStrictJSON(data, &file); err != nil {
		return parsedDriverConfig{}, "", fmt.Errorf("decode print-agent config: %w", err)
	}
	if file.SchemaVersion != 1 || !uuidPattern.MatchString(file.PrinterID) || len(file.Driver) == 0 {
		return parsedDriverConfig{}, "", fmt.Errorf("print-agent config requires schemaVersion 1, a UUID printerId, and one driver")
	}
	var driverHeader struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(file.Driver, &driverHeader); err != nil {
		return parsedDriverConfig{}, "", fmt.Errorf("decode print-agent driver type: %w", err)
	}

	switch driverHeader.Type {
	case "tm-t88v-usb":
		var driver struct {
			Type       string `json:"type"`
			DevicePath string `json:"devicePath"`
		}
		if err := decodeStrictJSON(file.Driver, &driver); err != nil || driver.Type != "tm-t88v-usb" || !filepath.IsAbs(driver.DevicePath) {
			return parsedDriverConfig{}, "", fmt.Errorf("tm-t88v-usb driver requires only an absolute devicePath")
		}
		return parsedDriverConfig{kind: driver.Type, devicePath: driver.DevicePath}, file.PrinterID, nil
	case "escpos-tcp":
		var driver struct {
			Type    string `json:"type"`
			Address string `json:"address"`
		}
		if err := decodeStrictJSON(file.Driver, &driver); err != nil || driver.Type != "escpos-tcp" {
			return parsedDriverConfig{}, "", fmt.Errorf("escpos-tcp driver requires only an address")
		}
		host, port, err := net.SplitHostPort(driver.Address)
		portNumber, portErr := strconv.Atoi(port)
		if err != nil || host == "" || portErr != nil || portNumber < 1 || portNumber > 65535 {
			return parsedDriverConfig{}, "", fmt.Errorf("escpos-tcp address must be host:port")
		}
		return parsedDriverConfig{kind: driver.Type, address: driver.Address}, file.PrinterID, nil
	case "json-file":
		var driver struct {
			Type      string `json:"type"`
			OutputDir string `json:"outputDir"`
		}
		if err := decodeStrictJSON(file.Driver, &driver); err != nil || driver.Type != "json-file" || !filepath.IsAbs(driver.OutputDir) {
			return parsedDriverConfig{}, "", fmt.Errorf("json-file driver requires only an absolute outputDir")
		}
		return parsedDriverConfig{kind: driver.Type, outputDir: driver.OutputDir}, file.PrinterID, nil
	case "command":
		var driver struct {
			Type string   `json:"type"`
			Argv []string `json:"argv"`
		}
		if err := decodeStrictJSON(file.Driver, &driver); err != nil || driver.Type != "command" || len(driver.Argv) == 0 || !filepath.IsAbs(driver.Argv[0]) {
			return parsedDriverConfig{}, "", fmt.Errorf("command driver requires only argv with an absolute executable path")
		}
		for _, argument := range driver.Argv {
			if strings.IndexFunc(argument, unicode.IsControl) >= 0 {
				return parsedDriverConfig{}, "", fmt.Errorf("command argv must not contain control characters")
			}
		}
		return parsedDriverConfig{kind: driver.Type, commandArgv: driver.Argv}, file.PrinterID, nil
	default:
		return parsedDriverConfig{}, "", fmt.Errorf("unsupported print-agent driver type %q", driverHeader.Type)
	}
}

func decodeStrictJSON(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		if err == nil {
			return fmt.Errorf("multiple JSON values")
		}
		return err
	}
	return nil
}
