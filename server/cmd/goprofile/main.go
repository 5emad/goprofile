package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata"

	"github.com/5emad/goprofile/server/internal/api"
	"github.com/5emad/goprofile/server/internal/config"
	"github.com/5emad/goprofile/server/internal/db"
	"github.com/5emad/goprofile/server/internal/secure"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cluster, err := connect(ctx, cfg)
	if err != nil {
		return err
	}
	defer cluster.Close()
	if err := db.Migrate(ctx, cluster.W()); err != nil {
		return err
	}
	go cluster.Watch(ctx)

	keys, err := secure.LoadOrCreate(cfg.KeyFile)
	if err != nil {
		return err
	}
	slog.Info("server key loaded", "kid", keys.KID, "pub", keys.Public())

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.New(cfg, cluster, keys).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
	errc := make(chan error, 1)
	go func() { errc <- srv.ListenAndServe() }()
	slog.Info("listening", "addr", cfg.Addr)

	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdown)
}

// connect retries until the primary database accepts connections.
func connect(ctx context.Context, cfg config.Config) (*db.Cluster, error) {
	var last error
	for i := 0; i < 30; i++ {
		c, err := db.Open(ctx, cfg.DatabaseURL, cfg.ReplicaURLs)
		if err == nil {
			if err = c.W().Ping(ctx); err == nil {
				return c, nil
			}
			c.Close()
		}
		last = err
		slog.Warn("waiting for database", "err", err)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	return nil, last
}
