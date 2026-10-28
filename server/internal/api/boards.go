package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var (
	colorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	keyRe   = regexp.MustCompile(`^[A-Z][A-Z0-9]{1,9}$`)
	dateRe  = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

type Meta struct {
	ID       int64   `json:"id"`
	Name     string  `json:"name"`
	Position int     `json:"position"`
	Color    string  `json:"color,omitempty"`
	IsDone   bool    `json:"is_done,omitempty"`
	StartsOn *string `json:"starts_on,omitempty"`
	EndsOn   *string `json:"ends_on,omitempty"`
}

type Board struct {
	ID         int64     `json:"id"`
	Name       string    `json:"name"`
	Key        string    `json:"key"`
	Color      string    `json:"color"`
	Position   int       `json:"position"`
	CreatedAt  time.Time `json:"created_at"`
	TaskCount  int       `json:"task_count"`
	OpenCount  int       `json:"open_count"`
	Statuses   []Meta    `json:"statuses"`
	Phases     []Meta    `json:"phases"`
	Epics      []Meta    `json:"epics"`
	Categories []Meta    `json:"categories"`
}

var defaultStatuses = []struct {
	name string
	done bool
}{{"برای انجام", false}, {"در حال انجام", false}, {"بازبینی", false}, {"انجام شد", true}}

func pathID(r *http.Request, name string) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue(name), 10, 64)
	return id, err == nil && id > 0
}

func (s *Server) seedBoard(ctx context.Context, uid int64) error {
	return pgx.BeginFunc(ctx, s.db.W(), func(tx pgx.Tx) error {
		_, err := insertBoard(ctx, tx, uid, "کارتابل من", "GP", "#4f6a32")
		return err
	})
}

func insertBoard(ctx context.Context, tx pgx.Tx, uid int64, name, key, color string) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `INSERT INTO boards (user_id, name, key, color, position)
		VALUES ($1, $2, $3, $4, (SELECT COALESCE(max(position), 0) + 1 FROM boards WHERE user_id = $1)) RETURNING id`,
		uid, name, key, color).Scan(&id)
	if err != nil {
		return 0, err
	}
	for i, st := range defaultStatuses {
		if _, err := tx.Exec(ctx, `INSERT INTO statuses (board_id, name, position, is_done) VALUES ($1, $2, $3, $4)`,
			id, st.name, i, st.done); err != nil {
			return 0, err
		}
	}
	return id, nil
}

func (s *Server) ownsBoard(ctx context.Context, uid, bid int64) (bool, error) {
	var ok bool
	err := s.db.W().QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM boards WHERE id = $1 AND user_id = $2)`, bid, uid).Scan(&ok)
	return ok, err
}

func (s *Server) listBoards(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.W().Query(r.Context(), `SELECT b.id, b.name, b.key, b.color, b.position, b.created_at,
		count(t.id), count(t.id) FILTER (WHERE t.done_at IS NULL)
		FROM boards b LEFT JOIN tasks t ON t.board_id = b.id
		WHERE b.user_id = $1 GROUP BY b.id ORDER BY b.position, b.id`, currentUser(r).ID)
	if err != nil {
		internal(w, r, err)
		return
	}
	boards, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (*Board, error) {
		b := &Board{}
		return b, row.Scan(&b.ID, &b.Name, &b.Key, &b.Color, &b.Position, &b.CreatedAt, &b.TaskCount, &b.OpenCount)
	})
	if err != nil {
		internal(w, r, err)
		return
	}
	for _, b := range boards {
		if err := s.fillMeta(r.Context(), b); err != nil {
			internal(w, r, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, boards)
}

func (s *Server) fillMeta(ctx context.Context, b *Board) error {
	q := func(sql string) ([]Meta, error) {
		rows, err := s.db.W().Query(ctx, sql, b.ID)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Meta, error) {
			var m Meta
			return m, row.Scan(&m.ID, &m.Name, &m.Position, &m.Color, &m.IsDone, &m.StartsOn, &m.EndsOn)
		})
	}
	var err error
	if b.Statuses, err = q(`SELECT id, name, position, '', is_done, NULL::text, NULL::text FROM statuses WHERE board_id = $1 ORDER BY position, id`); err != nil {
		return err
	}
	if b.Phases, err = q(`SELECT id, name, position, '', false, starts_on::text, ends_on::text FROM phases WHERE board_id = $1 ORDER BY position, id`); err != nil {
		return err
	}
	if b.Epics, err = q(`SELECT id, name, position, color, false, NULL::text, NULL::text FROM epics WHERE board_id = $1 ORDER BY position, id`); err != nil {
		return err
	}
	b.Categories, err = q(`SELECT id, name, position, color, false, NULL::text, NULL::text FROM categories WHERE board_id = $1 ORDER BY position, id`)
	return err
}

func (s *Server) getBoard(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		fail(w, http.StatusNotFound, "کارتابل پیدا نشد")
		return
	}
	b := &Board{}
	err := s.db.W().QueryRow(r.Context(), `SELECT id, name, key, color, position, created_at FROM boards WHERE id = $1 AND user_id = $2`,
		id, currentUser(r).ID).Scan(&b.ID, &b.Name, &b.Key, &b.Color, &b.Position, &b.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusNotFound, "کارتابل پیدا نشد")
		return
	}
	if err == nil {
		err = s.fillMeta(r.Context(), b)
	}
	if err != nil {
		internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, b)
}

type boardInput struct {
	Name     *string `json:"name"`
	Key      *string `json:"key"`
	Color    *string `json:"color"`
	Position *int    `json:"position"`
}

func (in *boardInput) check() string {
	if in.Name != nil {
		*in.Name = strings.TrimSpace(*in.Name)
		if *in.Name == "" || len([]rune(*in.Name)) > 60 {
			return "نام کارتابل معتبر نیست"
		}
	}
	if in.Key != nil {
		*in.Key = strings.ToUpper(strings.TrimSpace(*in.Key))
		if !keyRe.MatchString(*in.Key) {
			return "کلید باید ۲ تا ۱۰ حرف لاتین بزرگ یا عدد باشد و با حرف شروع شود"
		}
	}
	if in.Color != nil && !colorRe.MatchString(*in.Color) {
		return "رنگ معتبر نیست"
	}
	return ""
}

func (s *Server) createBoard(w http.ResponseWriter, r *http.Request) {
	var in boardInput
	if !readJSON(w, r, &in) {
		return
	}
	if in.Name == nil || in.Key == nil {
		fail(w, http.StatusBadRequest, "نام و کلید کارتابل لازم است")
		return
	}
	if in.Color == nil {
		c := "#4f6a32"
		in.Color = &c
	}
	if msg := in.check(); msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	var id int64
	err := pgx.BeginFunc(r.Context(), s.db.W(), func(tx pgx.Tx) (err error) {
		id, err = insertBoard(r.Context(), tx, currentUser(r).ID, *in.Name, *in.Key, *in.Color)
		return err
	})
	if err != nil {
		internal(w, r, err)
		return
	}
	r.SetPathValue("id", strconv.FormatInt(id, 10))
	s.getBoard(w, r)
}

func (s *Server) updateBoard(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	var in boardInput
	if !ok || !readJSON(w, r, &in) {
		return
	}
	if msg := in.check(); msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	var set setter
	set.opt("name", in.Name)
	set.opt("key", in.Key)
	set.opt("color", in.Color)
	set.opt("position", in.Position)
	if !set.empty() {
		tag, err := s.db.W().Exec(r.Context(), set.sql("boards")+fmt.Sprintf(" WHERE id = %s AND user_id = %s",
			set.arg(id), set.arg(currentUser(r).ID)), set.args...)
		if err != nil {
			internal(w, r, err)
			return
		}
		if tag.RowsAffected() == 0 {
			fail(w, http.StatusNotFound, "کارتابل پیدا نشد")
			return
		}
	}
	s.getBoard(w, r)
}

func (s *Server) deleteBoard(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	tag, err := s.db.W().Exec(r.Context(), `DELETE FROM boards WHERE id = $1 AND user_id = $2`, id, currentUser(r).ID)
	if err != nil {
		internal(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, http.StatusNotFound, "کارتابل پیدا نشد")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// metaTables lists the per-board lookup tables and the columns each accepts.
var metaTables = map[string]map[string]bool{
	"statuses":   {"name": true, "position": true, "is_done": true},
	"phases":     {"name": true, "position": true, "starts_on": true, "ends_on": true},
	"epics":      {"name": true, "position": true, "color": true},
	"categories": {"name": true, "position": true, "color": true},
}

type metaInput struct {
	Name     *string `json:"name"`
	Position *int    `json:"position"`
	Color    *string `json:"color"`
	IsDone   *bool   `json:"is_done"`
	StartsOn *string `json:"starts_on"`
	EndsOn   *string `json:"ends_on"`
}

func (in *metaInput) build(cols map[string]bool, set *setter) string {
	if in.Name != nil {
		*in.Name = strings.TrimSpace(*in.Name)
		if *in.Name == "" || len([]rune(*in.Name)) > 60 {
			return "نام معتبر نیست"
		}
	}
	if in.Color != nil && !colorRe.MatchString(*in.Color) {
		return "رنگ معتبر نیست"
	}
	for _, d := range []*string{in.StartsOn, in.EndsOn} {
		if d != nil && *d != "" && !dateRe.MatchString(*d) {
			return "تاریخ معتبر نیست"
		}
	}
	add := func(col string, v any, present bool) {
		if present && cols[col] {
			set.add(col, v)
		}
	}
	add("name", in.Name, in.Name != nil)
	add("position", in.Position, in.Position != nil)
	add("color", in.Color, in.Color != nil)
	add("is_done", in.IsDone, in.IsDone != nil)
	if in.StartsOn != nil && cols["starts_on"] {
		set.addRaw("starts_on", "NULLIF(%s, '')::date", *in.StartsOn)
	}
	if in.EndsOn != nil && cols["ends_on"] {
		set.addRaw("ends_on", "NULLIF(%s, '')::date", *in.EndsOn)
	}
	return ""
}

func (s *Server) metaRequest(w http.ResponseWriter, r *http.Request) (string, map[string]bool, int64, bool) {
	kind := r.PathValue("kind")
	cols, ok := metaTables[kind]
	bid, okID := pathID(r, "id")
	if !ok || !okID {
		fail(w, http.StatusNotFound, "پیدا نشد")
		return "", nil, 0, false
	}
	owns, err := s.ownsBoard(r.Context(), currentUser(r).ID, bid)
	if err != nil {
		internal(w, r, err)
		return "", nil, 0, false
	}
	if !owns {
		fail(w, http.StatusNotFound, "کارتابل پیدا نشد")
		return "", nil, 0, false
	}
	return kind, cols, bid, true
}

func (s *Server) createMeta(w http.ResponseWriter, r *http.Request) {
	kind, cols, bid, ok := s.metaRequest(w, r)
	if !ok {
		return
	}
	var in metaInput
	if !readJSON(w, r, &in) {
		return
	}
	if in.Name == nil {
		fail(w, http.StatusBadRequest, "نام لازم است")
		return
	}
	var set setter
	if msg := in.build(cols, &set); msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	if in.Position == nil {
		set.addRaw("position", "(SELECT COALESCE(max(position), -1) + 1 FROM "+kind+" WHERE board_id = %s)", bid)
	}
	set.add("board_id", bid)
	if _, err := s.db.W().Exec(r.Context(), set.insertSQL(kind), set.args...); err != nil {
		internal(w, r, err)
		return
	}
	s.getBoard(w, r)
}

func (s *Server) updateMeta(w http.ResponseWriter, r *http.Request) {
	kind, cols, bid, ok := s.metaRequest(w, r)
	item, okItem := pathID(r, "item")
	if !ok || !okItem {
		return
	}
	var in metaInput
	if !readJSON(w, r, &in) {
		return
	}
	var set setter
	if msg := in.build(cols, &set); msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	if !set.empty() {
		sql := set.sql(kind) + fmt.Sprintf(" WHERE id = %s AND board_id = %s", set.arg(item), set.arg(bid))
		if _, err := s.db.W().Exec(r.Context(), sql, set.args...); err != nil {
			internal(w, r, err)
			return
		}
	}
	if kind == "statuses" && in.IsDone != nil {
		// Keep done_at in step with the status' done flag.
		if _, err := s.db.W().Exec(r.Context(), `UPDATE tasks SET done_at = CASE WHEN $1 THEN COALESCE(done_at, now()) ELSE NULL END
			WHERE status_id = $2 AND board_id = $3`, *in.IsDone, item, bid); err != nil {
			internal(w, r, err)
			return
		}
	}
	s.getBoard(w, r)
}

func (s *Server) deleteMeta(w http.ResponseWriter, r *http.Request) {
	kind, _, bid, ok := s.metaRequest(w, r)
	item, okItem := pathID(r, "item")
	if !ok || !okItem {
		return
	}
	if _, err := s.db.W().Exec(r.Context(), "DELETE FROM "+kind+" WHERE id = $1 AND board_id = $2", item, bid); err != nil {
		internal(w, r, err)
		return
	}
	s.getBoard(w, r)
}
