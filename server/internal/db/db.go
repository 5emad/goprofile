// Package db routes writes to the primary and balances reads across replicas.
package db

import (
	"context"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type replica struct {
	name    string
	pool    *pgxpool.Pool
	healthy atomic.Bool
}

type Cluster struct {
	primary  *pgxpool.Pool
	replicas []*replica
	next     atomic.Uint64
}

func Open(ctx context.Context, primaryURL string, replicaURLs []string) (*Cluster, error) {
	primary, err := newPool(ctx, primaryURL, 20)
	if err != nil {
		return nil, err
	}
	c := &Cluster{primary: primary}
	for i, u := range replicaURLs {
		p, err := newPool(ctx, u, 20)
		if err != nil {
			slog.Warn("replica disabled", "index", i, "err", err)
			continue
		}
		c.replicas = append(c.replicas, &replica{name: p.Config().ConnConfig.Host, pool: p})
	}
	c.check(ctx)
	return c, nil
}

func newPool(ctx context.Context, url string, max int32) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = max
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.HealthCheckPeriod = 30 * time.Second
	cfg.ConnConfig.ConnectTimeout = 5 * time.Second
	return pgxpool.NewWithConfig(ctx, cfg)
}

// W returns the primary pool; use it for writes and read-after-write paths.
func (c *Cluster) W() *pgxpool.Pool { return c.primary }

// R returns a healthy replica in round-robin order, falling back to the primary.
func (c *Cluster) R() *pgxpool.Pool {
	n := len(c.replicas)
	start := c.next.Add(1)
	for i := 0; i < n; i++ {
		r := c.replicas[(start+uint64(i))%uint64(n)]
		if r.healthy.Load() {
			return r.pool
		}
	}
	return c.primary
}

// Watch probes replicas until ctx ends and takes lagging or dead ones out of rotation.
func (c *Cluster) Watch(ctx context.Context) {
	t := time.NewTicker(5 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			c.check(ctx)
		}
	}
}

func (c *Cluster) check(ctx context.Context) {
	for _, r := range c.replicas {
		ok := probe(ctx, r.pool)
		if r.healthy.Swap(ok) != ok {
			slog.Info("replica state changed", "host", r.name, "healthy", ok)
		}
	}
}

func probe(ctx context.Context, p *pgxpool.Pool) bool {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	// A replica counts as healthy while it is in recovery and less than 30s behind.
	var ok bool
	err := p.QueryRow(ctx, `SELECT pg_is_in_recovery() AND
		COALESCE(now() - pg_last_xact_replay_timestamp() < interval '30 seconds'
			OR pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn(), false)`).Scan(&ok)
	return err == nil && ok
}

func (c *Cluster) Close() {
	for _, r := range c.replicas {
		r.pool.Close()
	}
	c.primary.Close()
}
