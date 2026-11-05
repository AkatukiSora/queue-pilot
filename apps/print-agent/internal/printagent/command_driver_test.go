package printagent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCommandDriverUsesArgvAndReceiptJSONOnStdin(t *testing.T) {
	document := testReceiptDocument(t)
	driver := CommandDriver{Argv: commandHelperArgv(t, "printed")}
	outcome, err := driver.Output(context.Background(), document)
	if err != nil || outcome != OutcomePrinted {
		t.Fatalf("Output() = (%q, %v), want printed", outcome, err)
	}
}

func TestCommandDriverDoesNotPassAgentTokenToSubprocess(t *testing.T) {
	t.Setenv("AGENT_TOKEN", "agent-secret-must-not-be-inherited")
	driver := CommandDriver{Argv: commandHelperArgv(t, "env")}
	outcome, err := driver.Output(context.Background(), testReceiptDocument(t))
	if err != nil || outcome != OutcomePrinted {
		t.Fatalf("Output() = (%q, %v), want printed without inherited token", outcome, err)
	}
}

func TestCommandDriverRejectsMalformedAndExtraStdout(t *testing.T) {
	for _, mode := range []string{"invalid", "extra"} {
		t.Run(mode, func(t *testing.T) {
			driver := CommandDriver{Argv: commandHelperArgv(t, mode)}
			outcome, err := driver.Output(context.Background(), testReceiptDocument(t))
			if err == nil || outcome != OutcomeUnknown {
				t.Fatalf("Output() = (%q, %v), want unknown", outcome, err)
			}
		})
	}
}

func TestCommandDriverTreatsStartFailureAsFailedAndAbnormalExitAsUnknown(t *testing.T) {
	document := testReceiptDocument(t)
	missing := CommandDriver{Argv: []string{"/definitely/missing/print-command"}}
	if outcome, err := missing.Output(context.Background(), document); err == nil || outcome != OutcomeFailed {
		t.Errorf("missing command Output() = (%q, %v), want failed", outcome, err)
	}

	deniedPath := filepath.Join(t.TempDir(), "not-executable")
	if err := os.WriteFile(deniedPath, []byte("not executable"), 0o600); err != nil {
		t.Fatal(err)
	}
	denied := CommandDriver{Argv: []string{deniedPath}}
	if outcome, err := denied.Output(context.Background(), document); err == nil || outcome != OutcomeFailed {
		t.Errorf("non-executable command Output() = (%q, %v), want failed", outcome, err)
	}

	driver := CommandDriver{Argv: commandHelperArgv(t, "nonzero")}
	if outcome, err := driver.Output(context.Background(), document); err == nil || outcome != OutcomeUnknown {
		t.Errorf("nonzero command Output() = (%q, %v), want unknown", outcome, err)
	}
}

func TestCommandDriverKillsTimedOutChildAndReturnsUnknown(t *testing.T) {
	driver := CommandDriver{Argv: commandHelperArgv(t, "sleep")}
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	started := time.Now()
	outcome, err := driver.Output(ctx, testReceiptDocument(t))
	if err == nil || !errors.Is(err, errDriverTimedOut) || outcome != OutcomeUnknown {
		t.Fatalf("Output() = (%q, %v), want timed-out unknown", outcome, err)
	}
	if time.Since(started) > time.Second {
		t.Fatal("timed-out child was not stopped promptly")
	}
}

func TestCommandDriverHelperProcess(t *testing.T) {
	mode := ""
	for _, argument := range os.Args {
		if strings.HasPrefix(argument, "command-helper=") {
			mode = strings.TrimPrefix(argument, "command-helper=")
		}
	}
	if mode == "" {
		return
	}
	data, err := io.ReadAll(os.Stdin)
	if err != nil {
		os.Exit(21)
	}
	var document ReceiptDocumentV1
	if err := json.Unmarshal(data, &document); err != nil || document.Version != 1 || document.Title == "" {
		os.Exit(22)
	}
	switch mode {
	case "env":
		if os.Getenv("AGENT_TOKEN") == "" {
			_, _ = fmt.Fprint(os.Stdout, `{"outcome":"printed"}`)
		} else {
			_, _ = fmt.Fprint(os.Stdout, `{"outcome":"unknown"}`)
		}
		os.Exit(0)
	case "printed":
		_, _ = fmt.Fprint(os.Stdout, `{"outcome":"printed"}`)
		os.Exit(0)
	case "unknown":
		_, _ = fmt.Fprint(os.Stdout, `{"outcome":"unknown"}`)
		os.Exit(0)
	case "failed":
		_, _ = fmt.Fprint(os.Stdout, `{"outcome":"failed"}`)
		os.Exit(0)
	case "invalid":
		_, _ = fmt.Fprint(os.Stdout, `{"outcome":"paper"}`)
		os.Exit(0)
	case "extra":
		_, _ = fmt.Fprint(os.Stdout, `{"outcome":"printed"} {"outcome":"failed"}`)
		os.Exit(0)
	case "nonzero":
		_, _ = fmt.Fprint(os.Stdout, `{"outcome":"printed"}`)
		os.Exit(23)
	case "sleep":
		time.Sleep(10 * time.Second)
		_, _ = fmt.Fprint(os.Stdout, `{"outcome":"printed"}`)
	default:
		os.Exit(24)
	}
}

func commandHelperArgv(t *testing.T, mode string) []string {
	t.Helper()
	executable, err := exec.LookPath(os.Args[0])
	if err != nil {
		t.Fatal(err)
	}
	return []string{executable, "-test.run=TestCommandDriverHelperProcess", "command-helper=" + mode}
}

func testReceiptDocument(t *testing.T) ReceiptDocumentV1 {
	t.Helper()
	job := testJob()
	document, err := BuildReceipt(job, mustParseURL(t, "https://tickets.example.test"))
	if err != nil {
		t.Fatal(err)
	}
	return document
}
