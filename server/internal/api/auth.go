package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/5emad/goprofile/server/internal/auth"
)

type Settings struct {
	JiraMode  bool   `json:"jira_mode"`
	Timezone  string `json:"timezone"`
	DailyGoal int    `json:"daily_goal_minutes"`
	Theme     string `json:"theme"`
}

func defaultSettings() Settings {
	return Settings{Timezone: "Asia/Tehran", DailyGoal: 360, Theme: "system"}
}

func (st *Settings) valid() bool {
	if _, err := time.LoadLocation(st.Timezone); err != nil || st.Timezone == "" || st.Timezone == "Local" {
		return false
	}
	switch st.Theme {
	case "system", "light", "dark":
	default:
		return false
	}
	return st.DailyGoal >= 0 && st.DailyGoal <= 1440
}

type User struct {
	ID        int64     `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Settings  Settings  `json:"settings"`
	CreatedAt time.Time `json:"created_at"`
}

type ctxKey struct{}

func currentUser(r *http.Request) *User { return r.Context().Value(ctxKey{}).(*User) }

// authed wraps a handler that requires a valid session.
func (s *Server) authed(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || tok == "" {
			fail(w, http.StatusUnauthorized, "ابتدا وارد شوید")
			return
		}
		u, err := s.loadUser(r.Context(), `JOIN sessions s ON s.user_id = u.id
			WHERE s.token_hash = $1 AND s.expires_at > now()`, auth.HashToken(tok))
		if errors.Is(err, pgx.ErrNoRows) {
			fail(w, http.StatusUnauthorized, "نشست منقضی شده است")
			return
		}
		if err != nil {
			internal(w, r, err)
			return
		}
		h(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, u)))
	}
}

func (s *Server) loadUser(ctx context.Context, where string, arg any) (*User, error) {
	u := &User{}
	var raw []byte
	err := s.db.W().QueryRow(ctx, `SELECT u.id, u.email, u.name, u.settings, u.created_at FROM users u `+where, arg).
		Scan(&u.ID, &u.Email, &u.Name, &raw, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	u.Settings = defaultSettings()
	json.Unmarshal(raw, &u.Settings)
	return u, nil
}

func (s *Server) newSession(ctx context.Context, uid int64, client string) (string, error) {
	tok, hash, err := auth.NewToken()
	if err != nil {
		return "", err
	}
	if len(client) > 200 {
		client = client[:200]
	}
	_, err = s.db.W().Exec(ctx, `INSERT INTO sessions (token_hash, user_id, client, expires_at) VALUES ($1, $2, $3, $4)`,
		hash, uid, client, time.Now().Add(s.cfg.SessionTTL))
	return tok, err
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.AllowSignup {
		fail(w, http.StatusForbidden, "ثبت‌نام غیرفعال است")
		return
	}
	var in struct{ Name, Email, Password string }
	if !readJSON(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if a, err := mail.ParseAddress(in.Email); err != nil || a.Address != in.Email || len(in.Email) > 254 {
		fail(w, http.StatusBadRequest, "ایمیل معتبر نیست")
		return
	}
	if in.Name == "" || len([]rune(in.Name)) > 80 {
		fail(w, http.StatusBadRequest, "نام را وارد کنید")
		return
	}
	if err := auth.ValidatePassword(in.Password); err != nil {
		fail(w, http.StatusBadRequest, "رمز عبور باید بین ۱۰ تا ۱۲۸ کاراکتر باشد")
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		internal(w, r, err)
		return
	}
	st, _ := json.Marshal(defaultSettings())
	var uid int64
	err = s.db.W().QueryRow(r.Context(), `INSERT INTO users (email, name, password_hash, settings) VALUES ($1, $2, $3, $4) RETURNING id`,
		in.Email, in.Name, hash, st).Scan(&uid)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		fail(w, http.StatusConflict, "این ایمیل قبلاً ثبت شده است")
		return
	}
	if err != nil {
		internal(w, r, err)
		return
	}
	if err := s.seedBoard(r.Context(), uid); err != nil {
		internal(w, r, err)
		return
	}
	s.issue(w, r, uid)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Password string }
	if !readJSON(w, r, &in) {
		return
	}
	var uid int64
	var hash string
	err := s.db.W().QueryRow(r.Context(), `SELECT id, password_hash FROM users WHERE lower(email) = lower($1)`,
		strings.TrimSpace(in.Email)).Scan(&uid, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		auth.Dummy(in.Password)
		fail(w, http.StatusUnauthorized, "ایمیل یا رمز عبور اشتباه است")
		return
	}
	if err != nil {
		internal(w, r, err)
		return
	}
	if !auth.CheckPassword(hash, in.Password) {
		fail(w, http.StatusUnauthorized, "ایمیل یا رمز عبور اشتباه است")
		return
	}
	s.issue(w, r, uid)
}

func (s *Server) issue(w http.ResponseWriter, r *http.Request, uid int64) {
	tok, err := s.newSession(r.Context(), uid, r.UserAgent())
	if err != nil {
		internal(w, r, err)
		return
	}
	u, err := s.loadUser(r.Context(), `WHERE u.id = $1`, uid)
	if err != nil {
		internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": tok, "user": u})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	tok, _ := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if _, err := s.db.W().Exec(r.Context(), `DELETE FROM sessions WHERE token_hash = $1`, auth.HashToken(tok)); err != nil {
		internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, currentUser(r))
}

func (s *Server) updateMe(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var in struct {
		Name     *string   `json:"name"`
		Settings *Settings `json:"settings"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if in.Name != nil {
		n := strings.TrimSpace(*in.Name)
		if n == "" || len([]rune(n)) > 80 {
			fail(w, http.StatusBadRequest, "نام معتبر نیست")
			return
		}
		u.Name = n
	}
	if in.Settings != nil {
		if !in.Settings.valid() {
			fail(w, http.StatusBadRequest, "تنظیمات معتبر نیست")
			return
		}
		u.Settings = *in.Settings
	}
	st, _ := json.Marshal(u.Settings)
	if _, err := s.db.W().Exec(r.Context(), `UPDATE users SET name = $1, settings = $2 WHERE id = $3`, u.Name, st, u.ID); err != nil {
		internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var in struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	var hash string
	if err := s.db.W().QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id = $1`, u.ID).Scan(&hash); err != nil {
		internal(w, r, err)
		return
	}
	if !auth.CheckPassword(hash, in.Current) {
		fail(w, http.StatusBadRequest, "رمز فعلی اشتباه است")
		return
	}
	if err := auth.ValidatePassword(in.New); err != nil {
		fail(w, http.StatusBadRequest, "رمز عبور باید بین ۱۰ تا ۱۲۸ کاراکتر باشد")
		return
	}
	nh, err := auth.HashPassword(in.New)
	if err != nil {
		internal(w, r, err)
		return
	}
	tok, _ := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	err = pgx.BeginFunc(r.Context(), s.db.W(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `UPDATE users SET password_hash = $1 WHERE id = $2`, nh, u.ID); err != nil {
			return err
		}
		// Sign out every other device.
		_, err := tx.Exec(r.Context(), `DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2`, u.ID, auth.HashToken(tok))
		return err
	})
	if err != nil {
		internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) logoutOthers(w http.ResponseWriter, r *http.Request) {
	tok, _ := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	tag, err := s.db.W().Exec(r.Context(), `DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2`, currentUser(r).ID, auth.HashToken(tok))
	if err != nil {
		internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"removed": tag.RowsAffected()})
}
