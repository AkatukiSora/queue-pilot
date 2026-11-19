package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/AkatukiSora/queue-pilot/apps/print-agent/internal/printagent"
)

var (
	version = "unknown"
	commit  = "unknown"
)

func printVersion(args []string, output io.Writer) (bool, error) {
	flags := flag.NewFlagSet("print-agent", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	showVersion := flags.Bool("version", false, "print version and exit")
	if err := flags.Parse(args); err != nil {
		return false, err
	}
	if !*showVersion {
		return false, nil
	}
	_, err := fmt.Fprintf(output, "print-agent %s (commit %s)\n", version, commit)
	return true, err
}

func main() {
	showVersion, err := printVersion(os.Args[1:], os.Stdout)
	if err != nil {
		slog.Error("invalid print-agent arguments", "error", err)
		os.Exit(2)
	}
	if showVersion {
		return
	}

	config, err := printagent.LoadConfig(os.LookupEnv)
	if err != nil {
		slog.Error("invalid print-agent configuration", "error", err)
		os.Exit(2)
	}
	slog.Info("starting print-agent", "version", version, "commit", commit)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := printagent.Run(ctx, config, printagent.NewAPIClient(config), slog.Default()); err != nil {
		slog.Error("print-agent stopped", "error", err)
		os.Exit(1)
	}
}
