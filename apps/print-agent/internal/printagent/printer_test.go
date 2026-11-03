package printagent

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"

	tmt88v "github.com/AkatukiSora/tm-t88v"
)

type scriptedTransport struct {
	written   bytes.Buffer
	failAfter int
	writeErr  error
	flushErr  error
}

func (t *scriptedTransport) Read([]byte) (int, error) { return 0, io.EOF }
func (t *scriptedTransport) Close() error             { return nil }
func (t *scriptedTransport) Flush() error             { return t.flushErr }

func (t *scriptedTransport) Write(data []byte) (int, error) {
	if t.writeErr != nil {
		remaining := t.failAfter - t.written.Len()
		if remaining <= 0 {
			return -1, t.writeErr
		}
		if remaining < len(data) {
			return t.written.Write(data[:remaining])
		}
	}
	return t.written.Write(data)
}

func TestPrintClassifiesWriteAndFlushFailures(t *testing.T) {
	timeoutError := timeoutTestError{}
	tests := []struct {
		name      string
		transport *scriptedTransport
		want      Outcome
	}{
		{name: "write and flush succeed", transport: &scriptedTransport{failAfter: -1}, want: OutcomePrinted},
		{name: "zero-byte write failure", transport: &scriptedTransport{failAfter: 0, writeErr: io.ErrClosedPipe}, want: OutcomeFailed},
		{name: "partial write failure", transport: &scriptedTransport{failAfter: 2, writeErr: io.ErrClosedPipe}, want: OutcomeUnknown},
		{name: "timeout before any bytes", transport: &scriptedTransport{failAfter: 0, writeErr: timeoutError}, want: OutcomeUnknown},
		{name: "flush failure after write", transport: &scriptedTransport{failAfter: -1, flushErr: io.ErrClosedPipe}, want: OutcomeUnknown},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			device, err := newDevice(test.transport)
			if err != nil {
				t.Fatalf("newDevice() error = %v", err)
			}
			got, _ := device.Print([]byte("receipt bytes"))
			if got != test.want {
				t.Errorf("Print() outcome = %q, want %q", got, test.want)
			}
			if err := device.Close(); err != nil {
				t.Errorf("Close() error = %v", err)
			}
		})
	}
}

func TestOpenDeviceWritesReceiptBytesToRegularFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "printer-output")
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	device, err := OpenDevice(path)
	if err != nil {
		t.Fatalf("OpenDevice() error = %v", err)
	}
	want := []byte{0x1b, 0x40, 0x31, 0x32, 0x33, 0x1d, 0x56, 0x00}
	outcome, detail := device.Print(want)
	if outcome != OutcomePrinted || detail != "" {
		t.Fatalf("Print() = (%q, %q), want printed", outcome, detail)
	}
	if err := device.Close(); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("device output = %x, want %x", got, want)
	}
}

func TestClassifyWriteTimeoutAndByteCounts(t *testing.T) {
	if got := classifyWrite(0, context.DeadlineExceeded); got != OutcomeUnknown {
		t.Errorf("zero-byte timeout = %q, want unknown", got)
	}
	if got := classifyWrite(0, errors.New("open failed")); got != OutcomeFailed {
		t.Errorf("zero-byte failure = %q, want failed", got)
	}
	if got := classifyWrite(1, errors.New("write failed")); got != OutcomeUnknown {
		t.Errorf("partial write failure = %q, want unknown", got)
	}
}

type timeoutTestError struct{}

func (timeoutTestError) Error() string   { return "write timed out" }
func (timeoutTestError) Timeout() bool   { return true }
func (timeoutTestError) Temporary() bool { return true }

var _ tmt88v.Transport = (*scriptedTransport)(nil)
