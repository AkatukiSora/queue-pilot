package printagent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
)

var errDriverTimedOut = errors.New("printer driver timed out")

type Driver interface {
	Output(context.Context, ReceiptDocumentV1) (Outcome, error)
}

type TMT88VUSBDriver struct {
	device *Device
}

func (d TMT88VUSBDriver) Output(ctx context.Context, document ReceiptDocumentV1) (Outcome, error) {
	if err := ctx.Err(); err != nil {
		return OutcomeUnknown, err
	}
	data, err := EncodeReceipt(document)
	if err != nil {
		return OutcomeFailed, err
	}
	outcome, detail := d.device.Print(data)
	if detail != "" {
		return outcome, errors.New(detail)
	}
	return outcome, nil
}

type EscposTCPDriver struct {
	Address string
}

func (d EscposTCPDriver) Output(ctx context.Context, document ReceiptDocumentV1) (Outcome, error) {
	if err := ctx.Err(); err != nil {
		return OutcomeUnknown, err
	}
	data, err := EncodeReceipt(document)
	if err != nil {
		return OutcomeFailed, err
	}
	connection, err := (&net.Dialer{}).DialContext(ctx, "tcp", d.Address)
	if err != nil {
		if ctx.Err() != nil {
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				return OutcomeUnknown, fmt.Errorf("%w: %v", errDriverTimedOut, ctx.Err())
			}
			return OutcomeUnknown, ctx.Err()
		}
		return OutcomeFailed, fmt.Errorf("connect ESC/POS printer: %w", err)
	}
	defer connection.Close()
	if deadline, ok := ctx.Deadline(); ok {
		if err := connection.SetWriteDeadline(deadline); err != nil {
			return OutcomeFailed, fmt.Errorf("set ESC/POS write deadline: %w", err)
		}
	}
	written := 0
	for written < len(data) {
		count, writeErr := connection.Write(data[written:])
		written += count
		if writeErr != nil {
			outcome := classifyWrite(int64(written), writeErr)
			if ctx.Err() != nil {
				if errors.Is(ctx.Err(), context.DeadlineExceeded) {
					return OutcomeUnknown, fmt.Errorf("%w: %v", errDriverTimedOut, ctx.Err())
				}
				return OutcomeUnknown, ctx.Err()
			}
			return outcome, fmt.Errorf("write ESC/POS receipt: %w", writeErr)
		}
		if count == 0 {
			shortWrite := fmt.Errorf("short TCP write")
			return classifyWrite(int64(written), shortWrite), shortWrite
		}
	}
	return OutcomePrinted, nil
}

type CommandDriver struct {
	Argv []string
}

func (d CommandDriver) Output(ctx context.Context, document ReceiptDocumentV1) (Outcome, error) {
	if err := ctx.Err(); err != nil {
		return OutcomeUnknown, err
	}
	input, err := json.Marshal(document)
	if err != nil {
		return OutcomeFailed, fmt.Errorf("encode command receipt: %w", err)
	}
	if len(input) > 64<<10 {
		return OutcomeFailed, fmt.Errorf("command receipt exceeds 65536 bytes")
	}
	if len(d.Argv) == 0 {
		return OutcomeFailed, fmt.Errorf("command argv is empty")
	}
	command := exec.CommandContext(ctx, d.Argv[0], d.Argv[1:]...)
	path := os.Getenv("PATH")
	if path == "" {
		path = "/usr/bin:/bin"
	}
	command.Env = []string{"PATH=" + path}
	command.Stdin = bytes.NewReader(input)
	stdout := &limitedCommandOutput{limit: 4096}
	command.Stdout = stdout
	command.Stderr = io.Discard
	if err := command.Run(); err != nil {
		if ctx.Err() != nil {
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				return OutcomeUnknown, fmt.Errorf("%w: %v", errDriverTimedOut, ctx.Err())
			}
			return OutcomeUnknown, ctx.Err()
		}
		var startError *exec.Error
		var pathError *os.PathError
		if errors.As(err, &startError) || errors.As(err, &pathError) {
			return OutcomeFailed, fmt.Errorf("start command driver: %w", err)
		}
		return OutcomeUnknown, fmt.Errorf("command driver exited abnormally")
	}
	if stdout.exceeded {
		return OutcomeUnknown, fmt.Errorf("command stdout exceeds 4096 bytes")
	}
	var result struct {
		Outcome Outcome `json:"outcome"`
	}
	if err := decodeStrictJSON(stdout.Bytes(), &result); err != nil {
		return OutcomeUnknown, fmt.Errorf("command stdout is not one valid result object: %w", err)
	}
	if result.Outcome != OutcomePrinted && result.Outcome != OutcomeFailed && result.Outcome != OutcomeUnknown {
		return OutcomeUnknown, fmt.Errorf("command stdout contains an unsupported outcome")
	}
	return result.Outcome, nil
}

type limitedCommandOutput struct {
	bytes.Buffer
	limit    int
	exceeded bool
}

func (output *limitedCommandOutput) Write(data []byte) (int, error) {
	remaining := output.limit - output.Len()
	if len(data) > remaining {
		if remaining > 0 {
			_, _ = output.Buffer.Write(data[:remaining])
		}
		output.exceeded = true
		return remaining, fmt.Errorf("command stdout limit exceeded")
	}
	return output.Buffer.Write(data)
}

type JSONFileDriver struct {
	OutputDir string
}

func (d JSONFileDriver) Output(ctx context.Context, document ReceiptDocumentV1) (Outcome, error) {
	if err := ctx.Err(); err != nil {
		return OutcomeUnknown, err
	}
	if !uuidPattern.MatchString(document.jobID) {
		return OutcomeFailed, fmt.Errorf("receipt job ID is invalid")
	}
	content, err := json.Marshal(struct {
		JobID   string            `json:"jobId"`
		Preview bool              `json:"preview"`
		Receipt ReceiptDocumentV1 `json:"receipt"`
	}{JobID: document.jobID, Preview: true, Receipt: document})
	if err != nil {
		return OutcomeFailed, fmt.Errorf("encode JSON preview: %w", err)
	}
	if err := os.MkdirAll(d.OutputDir, 0o750); err != nil {
		return OutcomeFailed, fmt.Errorf("create JSON preview directory: %w", err)
	}
	temporary, err := os.CreateTemp(d.OutputDir, ".preview-*.tmp")
	if err != nil {
		return OutcomeFailed, fmt.Errorf("create temporary JSON preview: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if _, err := temporary.Write(content); err != nil {
		_ = temporary.Close()
		return OutcomeFailed, fmt.Errorf("write JSON preview: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return OutcomeFailed, fmt.Errorf("sync JSON preview: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return OutcomeFailed, fmt.Errorf("close JSON preview: %w", err)
	}

	previewPath := filepath.Join(d.OutputDir, document.jobID+".json")
	if err := os.Link(temporaryPath, previewPath); err != nil {
		if !errors.Is(err, os.ErrExist) {
			return OutcomeFailed, fmt.Errorf("publish JSON preview atomically: %w", err)
		}
		info, statErr := os.Lstat(previewPath)
		if statErr != nil || !info.Mode().IsRegular() {
			return OutcomeFailed, fmt.Errorf("existing JSON preview is not a regular file")
		}
		existing, readErr := os.ReadFile(previewPath)
		if readErr != nil {
			return OutcomeFailed, fmt.Errorf("read existing JSON preview: %w", readErr)
		}
		if !bytes.Equal(existing, content) {
			return OutcomeFailed, fmt.Errorf("job ID already has different JSON preview content")
		}
	}
	return OutcomePrinted, nil
}

var _ Driver = TMT88VUSBDriver{}
var _ Driver = EscposTCPDriver{}
var _ Driver = CommandDriver{}
var _ Driver = JSONFileDriver{}
