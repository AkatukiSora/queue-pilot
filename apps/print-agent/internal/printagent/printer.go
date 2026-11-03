package printagent

import (
	"context"
	"errors"
	"fmt"
	"net"
	"syscall"

	tmt88v "github.com/AkatukiSora/tm-t88v"
)

type Device struct {
	printer   *tmt88v.Printer
	transport *countingTransport
}

func OpenDevice(path string) (*Device, error) {
	transport, err := tmt88v.OpenFile(path, tmt88v.WithFileWriteOnly())
	if err != nil {
		return nil, err
	}
	device, err := newDevice(transport)
	if err != nil {
		if closeErr := transport.Close(); closeErr != nil {
			return nil, errors.Join(err, closeErr)
		}
		return nil, err
	}
	return device, nil
}

func newDevice(transport tmt88v.Transport) (*Device, error) {
	counted := &countingTransport{Transport: transport}
	printer, err := tmt88v.New(counted)
	if err != nil {
		return nil, fmt.Errorf("create printer: %w", err)
	}
	return &Device{printer: printer, transport: counted}, nil
}

func (d *Device) Print(data []byte) (Outcome, string) {
	if err := d.printer.Raw(data); err != nil {
		return classifyWrite(d.transport.written, err), err.Error()
	}
	if err := d.printer.Flush(); err != nil {
		return classifyWrite(d.transport.written, err), err.Error()
	}
	return OutcomePrinted, ""
}

func (d *Device) Close() error {
	return d.printer.Close()
}

func classifyWrite(written int64, err error) Outcome {
	if err == nil {
		return OutcomePrinted
	}
	var timeoutError net.Error
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, syscall.ETIMEDOUT) || (errors.As(err, &timeoutError) && timeoutError.Timeout()) {
		return OutcomeUnknown
	}
	if written == 0 {
		return OutcomeFailed
	}
	return OutcomeUnknown
}

type countingTransport struct {
	tmt88v.Transport
	written int64
}

func (t *countingTransport) Write(data []byte) (int, error) {
	count, err := t.Transport.Write(data)
	if count > 0 {
		t.written += int64(count)
	}
	return count, err
}
