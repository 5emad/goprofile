package secure

import (
	"sync"
	"time"
)

// ReplayGuard rejects request ids seen within the freshness window.
type ReplayGuard struct {
	mu     sync.Mutex
	seen   map[string]time.Time
	window time.Duration
}

func NewReplayGuard(window time.Duration) *ReplayGuard {
	return &ReplayGuard{seen: make(map[string]time.Time), window: window}
}

// Accept reports whether a request with this id and timestamp is fresh and unseen.
func (g *ReplayGuard) Accept(id string, ts time.Time) bool {
	now := time.Now()
	if id == "" || len(id) > 64 || ts.Before(now.Add(-g.window)) || ts.After(now.Add(g.window)) {
		return false
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if _, ok := g.seen[id]; ok {
		return false
	}
	if len(g.seen) > 50000 {
		for k, t := range g.seen {
			if now.Sub(t) > 2*g.window {
				delete(g.seen, k)
			}
		}
	}
	g.seen[id] = now
	return true
}
