package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr           string
	DatabaseURL    string
	ReplicaURLs    []string
	KeyFile        string
	AllowedOrigins []string
	AllowSignup    bool
	TrustProxy     bool
	SessionTTL     time.Duration
}

func Load() Config {
	return Config{
		Addr:           env("ADDR", ":8080"),
		DatabaseURL:    env("DATABASE_URL", "postgres://goprofile:goprofile@localhost:5432/goprofile?sslmode=disable"),
		ReplicaURLs:    list(env("DATABASE_REPLICA_URLS", "")),
		KeyFile:        env("KEY_FILE", "data/server.key"),
		AllowedOrigins: list(env("ALLOWED_ORIGINS", "https://goprofile.ir,app://goprofile,https://localhost,http://localhost:5173")),
		AllowSignup:    flag("ALLOW_SIGNUP", true),
		TrustProxy:     flag("TRUST_PROXY", false),
		SessionTTL:     time.Duration(num("SESSION_TTL_HOURS", 720)) * time.Hour,
	}
}

func env(k, def string) string {
	if v, ok := os.LookupEnv(k); ok && v != "" {
		return v
	}
	return def
}

func flag(k string, def bool) bool {
	v, err := strconv.ParseBool(env(k, strconv.FormatBool(def)))
	if err != nil {
		return def
	}
	return v
}

func num(k string, def int) int {
	v, err := strconv.Atoi(env(k, strconv.Itoa(def)))
	if err != nil || v <= 0 {
		return def
	}
	return v
}

func list(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
