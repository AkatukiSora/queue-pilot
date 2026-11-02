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
	errDeviceUnavailable = errors.New("printer device is unavailable")
	errPrintTimedOut     = errors.New("printer write timed out")
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
		if err := process(); errors.Is(err, errDeviceUnavailable) {
			if !deviceUnavailable {
				logger.Warn("printer device unavailable", "error", err)
				deviceUnavailable = true
			}
		} else {
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
	device, err := openDevice(config.DevicePath)
	if err != nil {
		return fmt.Errorf("%w: %v", errDeviceUnavailable, err)
	}

	job, err := client.Claim(ctx)
	if err != nil {
		return errors.Join(fmt.Errorf("claim print job: %w", err), device.Close())
	}
	if job == nil {
		return device.Close()
	}

	data, renderErr := RenderReceipt(*job, config.APIBaseURL)
	outcome := OutcomeFailed
	detail := ""
	timedOut := false
	closeDevice := func(detail string) string {
		if closeErr := device.Close(); closeErr != nil {
			closeDetail := "close printer: " + closeErr.Error()
			if detail == "" {
				detail = closeDetail
			} else {
				detail += "; " + closeDetail
			}
		}
		return truncateDetail(detail, 500)
	}
	if renderErr != nil {
		detail = closeDevice("render receipt: " + renderErr.Error())
	} else {
		printResult := make(chan struct {
			outcome Outcome
			detail  string
		}, 1)
		go func() {
			outcome, detail := device.Print(data)
			printResult <- struct {
				outcome Outcome
				detail  string
			}{outcome: outcome, detail: detail}
		}()
		timer := time.NewTimer(printTimeout)
		defer timer.Stop()
		select {
		case result := <-printResult:
			outcome, detail = result.outcome, result.detail
			detail = closeDevice(detail)
		case <-timer.C:
			outcome = OutcomeUnknown
			detail = fmt.Sprintf("write timed out after %s", printTimeout)
			timedOut = true
		}
		if timedOut {
			if err := client.ReportResult(ctx, *job, outcome, detail); err != nil {
				return errors.Join(errPrintTimedOut, fmt.Errorf("report print result for job %s: %w", job.ID, err))
			}
			logger.Info("print result reported", "job_id", job.ID, "outcome", outcome)
			return fmt.Errorf("%w: %s", errPrintTimedOut, detail)
		}
	}

	if err := client.ReportResult(ctx, *job, outcome, detail); err != nil {
		return fmt.Errorf("report print result for job %s: %w", job.ID, err)
	}
	logger.Info("print result reported", "job_id", job.ID, "outcome", outcome)
	return nil
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
