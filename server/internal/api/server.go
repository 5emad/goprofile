// Package api serves the encrypted gateway and the inner REST handlers.
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"time"

	"github.com/5emad/goprofile/server/internal/config"
	"github.com/5emad/goprofile/server/internal/db"
	"github.com/5emad/goprofile/server/internal/secure"
)

type Server struct {
	cfg    config.Config
	db     *db.Cluster
	keys   *secure.Keys
	replay *secure.ReplayGuard
	inner  *http.ServeMux
	authRL *limiter
	apiRL  *limiter
}

func New(cfg config.Config, c *db.Cluster, k *secure.Keys) *Server {
	s := &Server{
		cfg:    cfg,
		db:     c,
		keys:   k,
		replay: secure.NewReplayGuard(2 * time.Minute),
		inner:  http.NewServeMux(),
		authRL: newLimiter(10, time.Minute),
		apiRL:  newLimiter(600, time.Minute),
	}
	s.routes()
	return s
}

// Handler returns the outer HTTP handler. Only the key endpoint and the
// encrypted gateway are reachable from the network.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := s.db.W().Ping(ctx); err != nil {
			http.Error(w, "db down", http.StatusServiceUnavailable)
			return
		}
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /api/key", s.handleKey)
	mux.HandleFunc("POST /api/x", s.handleGateway)
	mux.HandleFunc("OPTIONS /api/", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	return s.cors(securityHeaders(mux))
}

func (s *Server) handleKey(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{
		"kid": s.keys.KID,
		"pub": s.keys.Public(),
		"alg": secure.Alg,
		"now": time.Now().UnixMilli(),
	})
}

type innerRequest struct {
	M  string          `json:"m"`
	P  string          `json:"p"`
	T  string          `json:"t"`
	TS int64           `json:"ts"`
	ID string          `json:"id"`
	B  json.RawMessage `json:"b"`
}

type innerResponse struct {
	S int             `json:"s"`
	B json.RawMessage `json:"b"`
}

func (s *Server) handleGateway(w http.ResponseWriter, r *http.Request) {
	ip := s.clientIP(r)
	if !s.apiRL.allow(ip) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate"})
		return
	}
	var env secure.Envelope
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20)).Decode(&env); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "envelope"})
		return
	}
	if env.KID != s.keys.KID {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "rekey"})
		return
	}
	pt, sess, err := s.keys.Open(env)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "envelope"})
		return
	}
	var in innerRequest
	if err := json.Unmarshal(pt, &in); err != nil || !strings.HasPrefix(in.P, "/") || strings.HasPrefix(in.P, "//") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "envelope"})
		return
	}
	if !s.replay.Accept(in.ID, time.UnixMilli(in.TS)) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "stale"})
		return
	}
	if strings.HasPrefix(in.P, "/auth/") && !s.authRL.allow(ip) {
		s.reply(w, sess, http.StatusTooManyRequests, []byte(`{"error":"تعداد تلاش‌ها زیاد است، کمی بعد دوباره امتحان کنید"}`))
		return
	}

	body := in.B
	if len(body) == 0 {
		body = []byte("null")
	}
	req, err := http.NewRequestWithContext(r.Context(), in.M, in.P, bytes.NewReader(body))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "envelope"})
		return
	}
	req.RemoteAddr = ip
	req.Header.Set("User-Agent", r.UserAgent())
	if in.T != "" {
		req.Header.Set("Authorization", "Bearer "+in.T)
	}
	rec := httptest.NewRecorder()
	s.inner.ServeHTTP(rec, req)

	out := rec.Body.Bytes()
	if !json.Valid(out) {
		out, _ = json.Marshal(map[string]string{"error": strings.TrimSpace(string(out))})
	}
	s.reply(w, sess, rec.Code, out)
}

func (s *Server) reply(w http.ResponseWriter, sess *secure.Session, status int, body []byte) {
	pt, _ := json.Marshal(innerResponse{S: status, B: body})
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, sess.Seal(pt))
}

func (s *Server) clientIP(r *http.Request) string {
	if s.cfg.TrustProxy {
		if v := r.Header.Get("X-Real-IP"); v != "" {
			return v
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if o := r.Header.Get("Origin"); o != "" && slices.Contains(s.cfg.AllowedOrigins, o) {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", o)
			h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Content-Type")
			h.Set("Access-Control-Max-Age", "600")
			h.Add("Vary", "Origin")
		}
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// internal logs the cause and returns a generic message to the client.
func internal(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, context.Canceled) {
		return
	}
	slog.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
	fail(w, http.StatusInternalServerError, "خطای داخلی سرور")
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		fail(w, http.StatusBadRequest, "داده نامعتبر است")
		return false
	}
	return true
}
