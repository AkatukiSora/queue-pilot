package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/AkatukiSora/queue-pilot/apps/print-agent/internal/printagent"
)

func main() {
	config, err := printagent.LoadConfig(os.LookupEnv)
	if err != nil {
		slog.Error("invalid print-agent configuration", "error", err)
		os.Exit(2)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := printagent.Run(ctx, config, printagent.NewAPIClient(config), slog.Default()); err != nil {
		slog.Error("print-agent stopped", "error", err)
		os.Exit(1)
	}
}
