package printagent

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"
)

const (
	pollInterval        = 2 * time.Second
	defaultPrintTimeout = 30 * time.Second
)

var (
	errDeviceUnavailable           = errors.New("printer device is unavailable")
	errPrintTimedOut               = errors.New("printer write timed out")
	errStopAfterUnsafeDriverResult = errors.New("unsafe driver result; stopping print agent")
)

func Run(ctx context.Context, config Config, client *APIClient, logger *slog.Logger) error {
	return run(ctx, logger, func() error {
		return ProcessOnce(ctx, config, client, logger)
	})
}

func run(ctx context.Context, logger *slog.Logger, process func() error) error {
	deviceUnavailable := false
	for {
		if err := ctx.Err(); err != nil {
			return nil
		}
		err := process()
		if errors.Is(err, errStopAfterUnsafeDriverResult) {
			return err
		}
		if errors.Is(err, errDeviceUnavailable) {
			if !deviceUnavailable {
				logger.Warn("printer device unavailable", "error", err)
				deviceUnavailable = true
			}
		} else {
			if errors.Is(err, ErrIncompatibleAgent) {
				return err
			}
			if deviceUnavailable {
				logger.Info("printer device recovered")
				deviceUnavailable = false
			}
			if errors.Is(err, errPrintTimedOut) {
				return err
			}
			if err != nil {
				logger.Error("print-agent cycle failed", "error", err)
			}
		}
		if err := wait(ctx, pollInterval); errors.Is(err, context.Canceled) {
			return nil
		} else if err != nil {
			return err
		}
	}
}

func ProcessOnce(ctx context.Context, config Config, client *APIClient, logger *slog.Logger) error {
	return processOnce(ctx, config, client, logger, OpenDevice, defaultPrintTimeout)
}

func processOnce(ctx context.Context, config Config, client *APIClient, logger *slog.Logger, openDevice func(string) (*Device, error), printTimeout time.Duration) error {
	driver, closeDriver, err := prepareDriver(config, openDevice)
	if err != nil {
		return fmt.Errorf("%w: %v", errDeviceUnavailable, err)
	}

	job, err := client.Claim(ctx)
	if err != nil {
		return errors.Join(fmt.Errorf("claim print job: %w", err), closeDriver())
	}
	if job == nil {
		return closeDriver()
	}

	document, buildErr := BuildReceipt(*job, config.APIBaseURL)
	outcome := OutcomeFailed
	detail := ""
	timedOut := false
	var stopAfterUnsafeDriverResult error
	if buildErr != nil {
		detail = "build receipt: " + buildErr.Error()
		detail = closeDriverDetail(closeDriver, detail)
	} else {
		outputCtx, cancelOutput := context.WithTimeout(ctx, printTimeout)
		defer cancelOutput()
		outputResult := make(chan struct {
			outcome Outcome
			err     error
		}, 1)
		go func() {
			output, outputErr := driver.Output(outputCtx, document)
			outputResult <- struct {
				outcome Outcome
				err     error
			}{outcome: output, err: outputErr}
		}()

		select {
		case result := <-outputResult:
			outcome = result.outcome
			if result.err != nil {
				detail = result.err.Error()
			}
			timedOut = errors.Is(result.err, errDriverTimedOut) || errors.Is(outputCtx.Err(), context.DeadlineExceeded)
			if !timedOut && config.DriverKind == "command" && outcome == OutcomeUnknown {
				stopAfterUnsafeDriverResult = fmt.Errorf("%w: command driver reported unknown", errStopAfterUnsafeDriverResult)
			}
			if errors.Is(result.err, errJSONPreviewConflict) {
				stopAfterUnsafeDriverResult = fmt.Errorf("%w: %w", errStopAfterUnsafeDriverResult, result.err)
			}
		case <-outputCtx.Done():
			outcome = OutcomeUnknown
			timedOut = errors.Is(outputCtx.Err(), context.DeadlineExceeded)
			if timedOut {
				detail = fmt.Sprintf("write timed out after %s", printTimeout)
			} else {
				detail = "write canceled; output status is unknown"
			}
		}
		if timedOut {
			outcome = OutcomeUnknown
			if detail == "" {
				detail = fmt.Sprintf("write timed out after %s", printTimeout)
			}
		} else {
			detail = closeDriverDetail(closeDriver, detail)
		}
	}
	detail = truncateDetail(detail, 500)
	outputKind := OutputKindPhysical
	if config.DriverKind == "json-file" {
		outputKind = OutputKindPreview
	}
	if err := client.ReportResult(ctx, *job, outcome, detail, outputKind); err != nil {
		reportErr := fmt.Errorf("report print result for job %s: %w", job.ID, err)
		if stopAfterUnsafeDriverResult != nil {
			return errors.Join(stopAfterUnsafeDriverResult, reportErr)
		}
		if timedOut {
			return errors.Join(errPrintTimedOut, reportErr)
		}
		return reportErr
	}
	logger.Info(
		"driver output result reported",
		"job_id", job.ID,
		"printer_id", config.PrinterID,
		"outcome", outcome,
		"driver", config.DriverKind,
		"output_kind", outputKind,
	)
	if timedOut {
		return fmt.Errorf("%w: %s", errPrintTimedOut, detail)
	}
	return stopAfterUnsafeDriverResult
}

func prepareDriver(config Config, openDevice func(string) (*Device, error)) (Driver, func() error, error) {
	switch config.DriverKind {
	case "tm-t88v-usb":
		device, err := openDevice(config.DevicePath)
		if err != nil {
			return nil, nil, err
		}
		return TMT88VUSBDriver{device: device}, device.Close, nil
	case "escpos-tcp":
		return EscposTCPDriver{Address: config.Address}, func() error { return nil }, nil
	case "json-file":
		return JSONFileDriver{OutputDir: config.OutputDir}, func() error { return nil }, nil
	case "command":
		return CommandDriver{Argv: config.CommandArgv}, func() error { return nil }, nil
	default:
		return nil, nil, fmt.Errorf("unsupported printer driver %q", config.DriverKind)
	}
}

func closeDriverDetail(closeDriver func() error, detail string) string {
	if err := closeDriver(); err != nil {
		if detail == "" {
			detail = "close printer: " + err.Error()
		} else {
			detail += "; close printer: " + err.Error()
		}
	}
	return detail
}

func wait(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
