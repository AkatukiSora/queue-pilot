package printagent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const testAgentToken = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

const testJobJSON = `{"job":{"id":"11111111-1111-4111-8111-111111111111","ticketId":"22222222-2222-4222-8222-222222222222","status":"printing","attempt":1,"leaseToken":"lease-test-token","payload":{"ticketNumber":42,"partySize":3,"publicToken":"0123456789abcdefghijkl","issuedAt":"2026-11-02T12:34:56.000Z"}}}`

func testConfig(t *testing.T, baseURL, devicePath string) Config {
	t.Helper()
	values := map[string]string{
		"API_BASE_URL": baseURL,
		"AGENT_TOKEN":  testAgentToken,
		"DEVICE_PATH":  devicePath,
	}
	config, err := LoadConfig(func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	})
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}
	return config
}

func TestProcessOnceClaimsPrintsAndReportsPrinted(t *testing.T) {
	devicePath := filepath.Join(t.TempDir(), "printer-output")
	if err := os.WriteFile(devicePath, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	var claims atomic.Int32
	var results atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer "+testAgentToken {
			http.Error(writer, "unauthorized", http.StatusUnauthorized)
			return
		}
		switch request.URL.Path {
		case "/api/agent/print-jobs/claim":
			claims.Add(1)
			if request.Method != http.MethodPost {
				http.Error(writer, "wrong method", http.StatusMethodNotAllowed)
				return
			}
			writer.Header().Set("Content-Type", "application/json")
			writer.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(writer, testJobJSON)
		case "/api/agent/print-jobs/11111111-1111-4111-8111-111111111111/result":
			results.Add(1)
			var body struct {
				LeaseToken string  `json:"leaseToken"`
				Outcome    Outcome `json:"outcome"`
			}
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				http.Error(writer, "invalid request", http.StatusBadRequest)
				return
			}
			if request.Method != http.MethodPost || request.Header.Get("Content-Type") != "application/json" || body.LeaseToken != "lease-test-token" || body.Outcome != OutcomePrinted {
				http.Error(writer, "unexpected result", http.StatusBadRequest)
				return
			}
			writer.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprintf(writer, `{"job":{"status":%q}}`, string(body.Outcome))
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	config := testConfig(t, server.URL, devicePath)
	client := NewAPIClient(config)
	if err := ProcessOnce(context.Background(), config, client, slog.New(slog.NewTextHandler(io.Discard, nil))); err != nil {
		t.Fatalf("ProcessOnce() error = %v", err)
	}
	if claims.Load() != 1 || results.Load() != 1 {
		t.Fatalf("claim/result requests = %d/%d, want 1/1", claims.Load(), results.Load())
	}

	job := testJob()
	want, err := RenderReceipt(job, config.APIBaseURL)
	if err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(devicePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatalf("device output differs from ESC/POS receipt: got %d bytes, want %d", len(got), len(want))
	}
}

func TestProcessOnceDoesNotClaimWithoutDevice(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		http.Error(writer, "unexpected request", http.StatusInternalServerError)
	}))
	defer server.Close()

	missingPath := filepath.Join(t.TempDir(), "not-connected")
	config := testConfig(t, server.URL, missingPath)
	if err := ProcessOnce(context.Background(), config, NewAPIClient(config), slog.New(slog.NewTextHandler(io.Discard, nil))); err == nil {
		t.Fatal("ProcessOnce() unexpectedly succeeded without a device")
	}
	if requests.Load() != 0 {
		t.Fatalf("made %d API requests without an open device", requests.Load())
	}
}

func TestProcessOnceDoesNotRetryFailedResultReport(t *testing.T) {
	devicePath := filepath.Join(t.TempDir(), "printer-output")
	if err := os.WriteFile(devicePath, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	var claims atomic.Int32
	var results atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/agent/print-jobs/claim":
			claims.Add(1)
			writer.Header().Set("Content-Type", "application/json")
			writer.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(writer, testJobJSON)
		case "/api/agent/print-jobs/11111111-1111-4111-8111-111111111111/result":
			results.Add(1)
			http.Error(writer, "temporarily unavailable", http.StatusInternalServerError)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	config := testConfig(t, server.URL, devicePath)
	err := ProcessOnce(context.Background(), config, NewAPIClient(config), slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err == nil {
		t.Fatal("ProcessOnce() succeeded despite a failed result report")
	}
	if claims.Load() != 1 || results.Load() != 1 {
		t.Errorf("claim/result requests = %d/%d, want 1/1 without retry", claims.Load(), results.Load())
	}
}

func TestRunWaitsForDeviceBeforeClaimingAndResumes(t *testing.T) {
	devicePath := filepath.Join(t.TempDir(), "printer-output")
	var claims atomic.Int32
	resultReported := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer "+testAgentToken {
			http.Error(writer, "unauthorized", http.StatusUnauthorized)
			return
		}
		if request.URL.Path == "/api/agent/print-jobs/claim" {
			claims.Add(1)
			writer.Header().Set("Content-Type", "application/json")
			writer.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(writer, testJobJSON)
			return
		}
		if strings.HasSuffix(request.URL.Path, "/result") {
			writer.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(writer, `{"job":{"status":"printed"}}`)
			close(resultReported)
			return
		}
		http.NotFound(writer, request)
	}))
	defer server.Close()

	config := testConfig(t, server.URL, devicePath)
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	runResult := make(chan error, 1)
	go func() {
		runResult <- Run(ctx, config, NewAPIClient(config), logger)
	}()

	time.Sleep(2*pollInterval + 100*time.Millisecond)
	if claims.Load() != 0 {
		t.Fatalf("claimed %d job(s) while the device was absent", claims.Load())
	}
	if err := os.WriteFile(devicePath, nil, 0o600); err != nil {
		t.Fatal(err)
	}

	select {
	case <-resultReported:
	case <-time.After(5 * time.Second):
		t.Fatal("agent did not resume and report after the device appeared")
	}
	cancel()
	select {
	case err := <-runResult:
		if err != nil {
			t.Fatalf("Run() error = %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Run() did not stop after cancellation")
	}
	if claims.Load() != 1 {
		t.Errorf("claim count = %d, want 1", claims.Load())
	}
	if _, err := os.Stat(devicePath); err != nil {
		t.Fatal(err)
	}
	if got := strings.Count(logs.String(), `msg="printer device unavailable"`); got != 1 {
		t.Errorf("device-unavailable log count = %d, want 1; logs: %s", got, logs.String())
	}
	if got := strings.Count(logs.String(), `msg="printer device recovered"`); got != 1 {
		t.Errorf("device-recovered log count = %d, want 1; logs: %s", got, logs.String())
	}
}

type blockingTransport struct {
	started    chan struct{}
	release    chan struct{}
	writes     sync.WaitGroup
	startOnce  sync.Once
	closeCalls atomic.Int32
}

func (t *blockingTransport) Read([]byte) (int, error) { return 0, io.EOF }
func (t *blockingTransport) Flush() error             { return nil }
func (t *blockingTransport) Close() error {
	t.closeCalls.Add(1)
	return nil
}
func (t *blockingTransport) Write([]byte) (int, error) {
	t.writes.Add(1)
	defer t.writes.Done()
	t.startOnce.Do(func() { close(t.started) })
	<-t.release
	return -1, io.ErrClosedPipe
}

func TestProcessOnceReportsUnknownAfterPrintTimeoutWithoutClosingDevice(t *testing.T) {
	type resultReport struct {
		outcome Outcome
		detail  string
	}
	reports := make(chan resultReport, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/agent/print-jobs/claim":
			writer.Header().Set("Content-Type", "application/json")
			writer.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(writer, testJobJSON)
		case "/api/agent/print-jobs/11111111-1111-4111-8111-111111111111/result":
			var body struct {
				Outcome Outcome `json:"outcome"`
				Detail  string  `json:"detail"`
			}
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				http.Error(writer, "invalid result", http.StatusBadRequest)
				return
			}
			reports <- resultReport{outcome: body.Outcome, detail: body.Detail}
			writer.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprintf(writer, `{"job":{"status":%q}}`, string(body.Outcome))
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	transport := &blockingTransport{started: make(chan struct{}), release: make(chan struct{})}
	var releaseOnce sync.Once
	releaseWrite := func() { releaseOnce.Do(func() { close(transport.release) }) }
	t.Cleanup(releaseWrite)
	config := testConfig(t, server.URL, "/dev/fake-printer")
	processResult := make(chan error, 1)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	go func() {
		processResult <- processOnce(context.Background(), config, NewAPIClient(config), logger, func(string) (*Device, error) {
			return newDevice(transport)
		}, 100*time.Millisecond)
	}()

	select {
	case <-transport.started:
	case <-time.After(time.Second):
		t.Fatal("printer write did not start")
	}
	select {
	case err := <-processResult:
		if !errors.Is(err, errPrintTimedOut) {
			t.Fatalf("processOnce() error = %v, want print-timeout fatal error", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("processOnce() did not report the timed-out job")
	}

	releaseWrite()
	writesDone := make(chan struct{})
	go func() {
		transport.writes.Wait()
		close(writesDone)
	}()
	select {
	case <-writesDone:
	case <-time.After(time.Second):
		t.Fatal("blocked fake write did not return after release")
	}
	if got := transport.closeCalls.Load(); got != 0 {
		t.Errorf("device Close() calls = %d, want 0 after print timeout", got)
	}
	select {
	case report := <-reports:
		if report.outcome != OutcomeUnknown || !strings.Contains(report.detail, "timed out") {
			t.Errorf("reported result = (%q, %q), want unknown with timeout detail", report.outcome, report.detail)
		}
	default:
		t.Fatal("timed-out result was not reported")
	}
}

func TestRunExitsAfterPrintTimeout(t *testing.T) {
	var calls atomic.Int32
	err := run(context.Background(), slog.New(slog.NewTextHandler(io.Discard, nil)), func() error {
		calls.Add(1)
		return errPrintTimedOut
	})
	if !errors.Is(err, errPrintTimedOut) {
		t.Fatalf("run() error = %v, want print-timeout fatal error", err)
	}
	if calls.Load() != 1 {
		t.Errorf("process calls = %d, want 1 after fatal timeout", calls.Load())
	}
}

func TestRunStopsAfterCommandUnknownButContinuesFailed(t *testing.T) {
	for _, testCase := range []struct {
		name         string
		mode         string
		reportStatus int
		wantCycles   int
		wantClaims   int32
		wantResults  int32
		wantStopErr  bool
	}{
		{name: "unknown-report-fails", mode: "unknown", reportStatus: http.StatusInternalServerError, wantCycles: 1, wantClaims: 1, wantResults: 1, wantStopErr: true},
		{name: "failed-is-nonfatal", mode: "failed", reportStatus: http.StatusOK, wantCycles: 2, wantClaims: 2, wantResults: 2},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var claims atomic.Int32
			var results atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				switch request.URL.Path {
				case "/api/agent/print-jobs/claim":
					claims.Add(1)
					writer.Header().Set("Content-Type", "application/json")
					_, _ = io.WriteString(writer, testJobJSON)
				case "/api/agent/print-jobs/11111111-1111-4111-8111-111111111111/result":
					results.Add(1)
					if testCase.reportStatus != http.StatusOK {
						http.Error(writer, "temporarily unavailable", testCase.reportStatus)
						return
					}
					writer.Header().Set("Content-Type", "application/json")
					_, _ = io.WriteString(writer, `{"job":{"status":"failed"}}`)
				default:
					http.NotFound(writer, request)
				}
			}))
			defer server.Close()

			config := testConfig(t, server.URL, "/dev/unused")
			config.DriverKind = "command"
			config.CommandArgv = commandHelperArgv(t, testCase.mode)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			cycles := 0
			runErr := run(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), func() error {
				err := ProcessOnce(ctx, config, NewAPIClient(config), slog.New(slog.NewTextHandler(io.Discard, nil)))
				cycles++
				if cycles == 2 {
					cancel()
				}
				return err
			})
			if testCase.wantStopErr {
				if !errors.Is(runErr, errStopAfterUnsafeDriverResult) {
					t.Errorf("run() error = %v, want unsafe-driver stop error", runErr)
				}
			} else if runErr != nil {
				t.Errorf("run() error = %v, want nil after cancellation", runErr)
			}
			if cycles != testCase.wantCycles || claims.Load() != testCase.wantClaims || results.Load() != testCase.wantResults {
				t.Errorf("cycles/claims/results = %d/%d/%d, want %d/%d/%d", cycles, claims.Load(), results.Load(), testCase.wantCycles, testCase.wantClaims, testCase.wantResults)
			}
		})
	}
}

func testJob() PrintJob {
	issuedAt, _ := time.Parse(time.RFC3339Nano, "2026-11-02T12:34:56.000Z")
	return PrintJob{
		ID:         "11111111-1111-4111-8111-111111111111",
		TicketID:   "22222222-2222-4222-8222-222222222222",
		Status:     "printing",
		Attempt:    1,
		LeaseToken: "lease-test-token",
		Payload: JobPayload{
			TicketNumber: 42,
			PartySize:    3,
			PublicToken:  "0123456789abcdefghijkl",
			IssuedAt:     issuedAt,
		},
	}
}
