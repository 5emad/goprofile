package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type Task struct {
	ID              int64      `json:"id"`
	BoardID         int64      `json:"board_id"`
	BoardName       string     `json:"board_name"`
	Key             string     `json:"key"`
	Number          int        `json:"number"`
	JiraKey         string     `json:"jira_key"`
	Title           string     `json:"title"`
	Description     string     `json:"description"`
	StatusID        *int64     `json:"status_id"`
	PhaseID         *int64     `json:"phase_id"`
	EpicID          *int64     `json:"epic_id"`
	CategoryID      *int64     `json:"category_id"`
	Priority        int        `json:"priority"`
	EstimateMinutes int        `json:"estimate_minutes"`
	DueOn           *string    `json:"due_on"`
	Position        float64    `json:"position"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	DoneAt          *time.Time `json:"done_at"`
	LoggedSeconds   int64      `json:"logged_seconds"`
	Running         bool       `json:"running"`
	Worklogs        []Worklog  `json:"worklogs,omitempty"`
}

const taskSelect = `SELECT t.id, t.board_id, b.name, b.key || '-' || t.number, t.number, t.jira_key, t.title, t.description,
	t.status_id, t.phase_id, t.epic_id, t.category_id, t.priority, t.estimate_minutes, t.due_on::text, t.position,
	t.created_at, t.updated_at, t.done_at,
	COALESCE((SELECT sum(extract(epoch FROM COALESCE(w.ended_at, now()) - w.started_at))::bigint FROM worklogs w WHERE w.task_id = t.id), 0),
	EXISTS(SELECT 1 FROM worklogs w WHERE w.task_id = t.id AND w.ended_at IS NULL)
	FROM tasks t JOIN boards b ON b.id = t.board_id `

func scanTask(row pgx.CollectableRow) (*Task, error) {
	t := &Task{}
	return t, row.Scan(&t.ID, &t.BoardID, &t.BoardName, &t.Key, &t.Number, &t.JiraKey, &t.Title, &t.Description,
		&t.StatusID, &t.PhaseID, &t.EpicID, &t.CategoryID, &t.Priority, &t.EstimateMinutes, &t.DueOn, &t.Position,
		&t.CreatedAt, &t.UpdatedAt, &t.DoneAt, &t.LoggedSeconds, &t.Running)
}

// optional distinguishes a missing JSON field from an explicit null.
type optional[T any] struct {
	Set bool
	Val *T
}

func (o *optional[T]) UnmarshalJSON(b []byte) error {
	o.Set = true
	if bytes.Equal(b, []byte("null")) {
		o.Val = nil
		return nil
	}
	o.Val = new(T)
	return json.Unmarshal(b, o.Val)
}

type taskInput struct {
	BoardID         *int64           `json:"board_id"`
	JiraKey         *string          `json:"jira_key"`
	Title           *string          `json:"title"`
	Description     *string          `json:"description"`
	StatusID        optional[int64]  `json:"status_id"`
	PhaseID         optional[int64]  `json:"phase_id"`
	EpicID          optional[int64]  `json:"epic_id"`
	CategoryID      optional[int64]  `json:"category_id"`
	Priority        *int             `json:"priority"`
	EstimateMinutes *int             `json:"estimate_minutes"`
	DueOn           optional[string] `json:"due_on"`
	Position        *float64         `json:"position"`
}

func (in *taskInput) check() string {
	if in.Title != nil {
		*in.Title = strings.TrimSpace(*in.Title)
		if *in.Title == "" || len([]rune(*in.Title)) > 300 {
			return "عنوان تسک لازم است (حداکثر ۳۰۰ کاراکتر)"
		}
	}
	if in.Description != nil && len(*in.Description) > 50000 {
		return "توضیحات خیلی طولانی است"
	}
	if in.JiraKey != nil {
		*in.JiraKey = strings.ToUpper(strings.TrimSpace(*in.JiraKey))
		if len(*in.JiraKey) > 40 {
			return "شماره تسک خیلی طولانی است"
		}
	}
	if in.Priority != nil && (*in.Priority < 0 || *in.Priority > 4) {
		return "اولویت معتبر نیست"
	}
	if in.EstimateMinutes != nil && (*in.EstimateMinutes < 0 || *in.EstimateMinutes > 100000) {
		return "تخمین زمان معتبر نیست"
	}
	if in.DueOn.Val != nil && *in.DueOn.Val != "" && !dateRe.MatchString(*in.DueOn.Val) {
		return "تاریخ معتبر نیست"
	}
	return ""
}

// refsBelong verifies that every referenced lookup row belongs to the board.
func (s *Server) refsBelong(ctx context.Context, bid int64, in *taskInput) (bool, error) {
	var ok bool
	err := s.db.W().QueryRow(ctx, `SELECT
		($2::bigint IS NULL OR EXISTS(SELECT 1 FROM statuses WHERE id = $2 AND board_id = $1)) AND
		($3::bigint IS NULL OR EXISTS(SELECT 1 FROM phases WHERE id = $3 AND board_id = $1)) AND
		($4::bigint IS NULL OR EXISTS(SELECT 1 FROM epics WHERE id = $4 AND board_id = $1)) AND
		($5::bigint IS NULL OR EXISTS(SELECT 1 FROM categories WHERE id = $5 AND board_id = $1))`,
		bid, in.StatusID.Val, in.PhaseID.Val, in.EpicID.Val, in.CategoryID.Val).Scan(&ok)
	return ok, err
}

func (s *Server) listTasks(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := []string{"t.user_id = $1"}
	args := []any{currentUser(r).ID}
	for _, f := range []string{"board_id", "status_id", "phase_id", "epic_id", "category_id"} {
		if v := q.Get(f); v != "" {
			id, err := strconv.ParseInt(v, 10, 64)
			if err != nil {
				fail(w, http.StatusBadRequest, "فیلتر معتبر نیست")
				return
			}
			args = append(args, id)
			where = append(where, fmt.Sprintf("t.%s = $%d", f, len(args)))
		}
	}
	if v := strings.TrimSpace(q.Get("q")); v != "" {
		args = append(args, "%"+strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(v)+"%")
		n := len(args)
		where = append(where, fmt.Sprintf("(t.title ILIKE $%d OR t.jira_key ILIKE $%d OR (b.key || '-' || t.number) ILIKE $%d)", n, n, n))
	}
	if q.Get("open") == "1" {
		where = append(where, "t.done_at IS NULL")
	}
	rows, err := s.db.W().Query(r.Context(), taskSelect+"WHERE "+strings.Join(where, " AND ")+
		" ORDER BY t.position, t.id LIMIT 2000", args...)
	if err != nil {
		internal(w, r, err)
		return
	}
	tasks, err := pgx.CollectRows(rows, scanTask)
	if err != nil {
		internal(w, r, err)
		return
	}
	if tasks == nil {
		tasks = []*Task{}
	}
	writeJSON(w, http.StatusOK, tasks)
}

func (s *Server) loadTask(ctx context.Context, uid, id int64) (*Task, error) {
	rows, err := s.db.W().Query(ctx, taskSelect+"WHERE t.id = $1 AND t.user_id = $2", id, uid)
	if err != nil {
		return nil, err
	}
	return pgx.CollectExactlyOneRow(rows, scanTask)
}

func (s *Server) getTask(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	uid := currentUser(r).ID
	t, err := s.loadTask(r.Context(), uid, id)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusNotFound, "تسک پیدا نشد")
		return
	}
	if err == nil {
		t.Worklogs, err = s.queryWorklogs(r.Context(), s.db.W(), "w.task_id = $1 AND w.user_id = $2", id, uid)
	}
	if err != nil {
		internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) createTask(w http.ResponseWriter, r *http.Request) {
	uid := currentUser(r).ID
	var in taskInput
	if !readJSON(w, r, &in) {
		return
	}
	if in.BoardID == nil || in.Title == nil {
		fail(w, http.StatusBadRequest, "کارتابل و عنوان تسک لازم است")
		return
	}
	if msg := in.check(); msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	owns, err := s.ownsBoard(r.Context(), uid, *in.BoardID)
	if err == nil && owns {
		owns, err = s.refsBelong(r.Context(), *in.BoardID, &in)
	}
	if err != nil {
		internal(w, r, err)
		return
	}
	if !owns {
		fail(w, http.StatusBadRequest, "کارتابل یا دسته‌بندی معتبر نیست")
		return
	}

	var id int64
	err = pgx.BeginFunc(r.Context(), s.db.W(), func(tx pgx.Tx) error {
		var number int
		if err := tx.QueryRow(r.Context(), `UPDATE boards SET next_number = next_number + 1 WHERE id = $1 RETURNING next_number - 1`,
			*in.BoardID).Scan(&number); err != nil {
			return err
		}
		status := in.StatusID.Val
		if status == nil {
			status = new(int64)
			if err := tx.QueryRow(r.Context(), `SELECT id FROM statuses WHERE board_id = $1 ORDER BY position, id LIMIT 1`,
				*in.BoardID).Scan(status); errors.Is(err, pgx.ErrNoRows) {
				status = nil
			} else if err != nil {
				return err
			}
		}
		due := ""
		if in.DueOn.Val != nil {
			due = *in.DueOn.Val
		}
		return tx.QueryRow(r.Context(), `INSERT INTO tasks (board_id, user_id, number, jira_key, title, description, status_id,
			phase_id, epic_id, category_id, priority, estimate_minutes, due_on, position, done_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULLIF($13, '')::date,
				(SELECT COALESCE(max(position), 0) + 1 FROM tasks WHERE board_id = $1),
				CASE WHEN (SELECT is_done FROM statuses WHERE id = $7) THEN now() END)
			RETURNING id`,
			*in.BoardID, uid, number, deref(in.JiraKey), *in.Title, deref(in.Description), status,
			in.PhaseID.Val, in.EpicID.Val, in.CategoryID.Val, derefOr(in.Priority, 2), derefOr(in.EstimateMinutes, 0), due).Scan(&id)
	})
	if err != nil {
		internal(w, r, err)
		return
	}
	t, err := s.loadTask(r.Context(), uid, id)
	if err != nil {
		internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, t)
}

func (s *Server) updateTask(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	uid := currentUser(r).ID
	var in taskInput
	if !readJSON(w, r, &in) {
		return
	}
	if msg := in.check(); msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	cur, err := s.loadTask(r.Context(), uid, id)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusNotFound, "تسک پیدا نشد")
		return
	}
	if err != nil {
		internal(w, r, err)
		return
	}
	if in.BoardID != nil && *in.BoardID != cur.BoardID {
		fail(w, http.StatusBadRequest, "جابجایی تسک بین کارتابل‌ها پشتیبانی نمی‌شود")
		return
	}
	ok, err := s.refsBelong(r.Context(), cur.BoardID, &in)
	if err != nil {
		internal(w, r, err)
		return
	}
	if !ok {
		fail(w, http.StatusBadRequest, "دسته‌بندی معتبر نیست")
		return
	}

	var set setter
	set.opt("jira_key", in.JiraKey)
	set.opt("title", in.Title)
	set.opt("description", in.Description)
	set.opt("priority", in.Priority)
	set.opt("estimate_minutes", in.EstimateMinutes)
	if in.Position != nil {
		set.add("position", *in.Position)
	}
	for col, o := range map[string]optional[int64]{"phase_id": in.PhaseID, "epic_id": in.EpicID, "category_id": in.CategoryID} {
		if o.Set {
			set.add(col, o.Val)
		}
	}
	if in.DueOn.Set {
		set.addRaw("due_on", "NULLIF(%s, '')::date", deref(in.DueOn.Val))
	}
	if in.StatusID.Set {
		set.add("status_id", in.StatusID.Val)
		set.addRaw("done_at", "CASE WHEN (SELECT is_done FROM statuses WHERE id = %s) THEN COALESCE(done_at, now()) END", in.StatusID.Val)
	}
	if !set.empty() {
		set.expr("updated_at", "now()")
		sql := set.sql("tasks") + fmt.Sprintf(" WHERE id = %s AND user_id = %s", set.arg(id), set.arg(uid))
		if _, err := s.db.W().Exec(r.Context(), sql, set.args...); err != nil {
			internal(w, r, err)
			return
		}
	}
	t, err := s.loadTask(r.Context(), uid, id)
	if err != nil {
		internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) deleteTask(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	tag, err := s.db.W().Exec(r.Context(), `DELETE FROM tasks WHERE id = $1 AND user_id = $2`, id, currentUser(r).ID)
	if err != nil {
		internal(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, http.StatusNotFound, "تسک پیدا نشد")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func deref[T any](p *T) T {
	var zero T
	if p == nil {
		return zero
	}
	return *p
}

func derefOr[T any](p *T, def T) T {
	if p == nil {
		return def
	}
	return *p
}
