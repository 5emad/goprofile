package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Worklog struct {
	ID        int64      `json:"id"`
	TaskID    int64      `json:"task_id"`
	TaskKey   string     `json:"task_key"`
	JiraKey   string     `json:"jira_key"`
	TaskTitle string     `json:"task_title"`
	BoardID   int64      `json:"board_id"`
	BoardName string     `json:"board_name"`
	StartedAt time.Time  `json:"started_at"`
	EndedAt   *time.Time `json:"ended_at"`
	Seconds   int64      `json:"seconds"`
	Note      string     `json:"note"`
	Source    string     `json:"source"`
}

func (s *Server) queryWorklogs(ctx context.Context, p *pgxpool.Pool, where string, args ...any) ([]Worklog, error) {
	rows, err := p.Query(ctx, `SELECT w.id, w.task_id, b.key || '-' || t.number, t.jira_key, t.title, b.id, b.name,
		w.started_at, w.ended_at, extract(epoch FROM COALESCE(w.ended_at, now()) - w.started_at)::bigint, w.note, w.source
		FROM worklogs w JOIN tasks t ON t.id = w.task_id JOIN boards b ON b.id = t.board_id
		WHERE `+where+` ORDER BY w.started_at`, args...)
	if err != nil {
		return nil, err
	}
	logs, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Worklog, error) {
		var l Worklog
		return l, row.Scan(&l.ID, &l.TaskID, &l.TaskKey, &l.JiraKey, &l.TaskTitle, &l.BoardID, &l.BoardName,
			&l.StartedAt, &l.EndedAt, &l.Seconds, &l.Note, &l.Source)
	})
	if logs == nil {
		logs = []Worklog{}
	}
	return logs, err
}

func userLoc(u *User) *time.Location {
	loc, err := time.LoadLocation(u.Settings.Timezone)
	if err != nil {
		return time.UTC
	}
	return loc
}

// listWorklogs returns logs that start between the from and to dates (inclusive) in the user's timezone.
func (s *Server) listWorklogs(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	loc := userLoc(u)
	from, err1 := time.ParseInLocation(time.DateOnly, r.URL.Query().Get("from"), loc)
	to, err2 := time.ParseInLocation(time.DateOnly, r.URL.Query().Get("to"), loc)
	if err1 != nil || err2 != nil || to.Before(from) || to.Sub(from) > 93*24*time.Hour {
		fail(w, http.StatusBadRequest, "بازه تاریخ معتبر نیست")
		return
	}
	logs, err := s.queryWorklogs(r.Context(), s.db.R(), "w.user_id = $1 AND w.started_at >= $2 AND w.started_at < $3",
		u.ID, from, to.AddDate(0, 0, 1))
	if err != nil {
		internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, logs)
}

type worklogInput struct {
	StartedAt *time.Time `json:"started_at"`
	Minutes   *int       `json:"minutes"`
	Note      *string    `json:"note"`
}

func (in *worklogInput) check() string {
	if in.Minutes != nil && (*in.Minutes < 1 || *in.Minutes > 24*60) {
		return "مدت زمان باید بین ۱ دقیقه تا ۲۴ ساعت باشد"
	}
	if in.StartedAt != nil && in.StartedAt.After(time.Now().Add(24*time.Hour)) {
		return "زمان شروع نمی‌تواند در آینده باشد"
	}
	if in.Note != nil {
		*in.Note = strings.TrimSpace(*in.Note)
		if len([]rune(*in.Note)) > 1000 {
			return "توضیح لاگ خیلی طولانی است"
		}
	}
	return ""
}

func (s *Server) oneWorklog(ctx context.Context, uid, id int64) (*Worklog, error) {
	logs, err := s.queryWorklogs(ctx, s.db.W(), "w.id = $1 AND w.user_id = $2", id, uid)
	if err != nil {
		return nil, err
	}
	if len(logs) == 0 {
		return nil, pgx.ErrNoRows
	}
	return &logs[0], nil
}

func (s *Server) createWorklog(w http.ResponseWriter, r *http.Request) {
	tid, _ := pathID(r, "id")
	uid := currentUser(r).ID
	var in worklogInput
	if !readJSON(w, r, &in) {
		return
	}
	if in.StartedAt == nil || in.Minutes == nil {
		fail(w, http.StatusBadRequest, "زمان شروع و مدت لازم است")
		return
	}
	if msg := in.check(); msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	start := in.StartedAt.Truncate(time.Second)
	var id int64
	err := s.db.W().QueryRow(r.Context(), `INSERT INTO worklogs (task_id, user_id, started_at, ended_at, note, source)
		SELECT id, user_id, $3, $4, $5, 'manual' FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id`,
		tid, uid, start, start.Add(time.Duration(*in.Minutes)*time.Minute), deref(in.Note)).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusNotFound, "تسک پیدا نشد")
		return
	}
	s.respondWorklog(w, r, uid, id, err, http.StatusCreated)
}

func (s *Server) updateWorklog(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	uid := currentUser(r).ID
	var in worklogInput
	if !readJSON(w, r, &in) {
		return
	}
	if msg := in.check(); msg != "" {
		fail(w, http.StatusBadRequest, msg)
		return
	}
	cur, err := s.oneWorklog(r.Context(), uid, id)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusNotFound, "لاگ پیدا نشد")
		return
	}
	if err != nil {
		internal(w, r, err)
		return
	}
	if cur.EndedAt == nil && (in.StartedAt != nil || in.Minutes != nil) {
		fail(w, http.StatusBadRequest, "ابتدا تایمر را متوقف کنید")
		return
	}
	start := cur.StartedAt
	if in.StartedAt != nil {
		start = in.StartedAt.Truncate(time.Second)
	}
	end := cur.EndedAt
	if cur.EndedAt != nil {
		mins := time.Duration(cur.Seconds) * time.Second
		if in.Minutes != nil {
			mins = time.Duration(*in.Minutes) * time.Minute
		}
		e := start.Add(mins)
		end = &e
	}
	note := cur.Note
	if in.Note != nil {
		note = *in.Note
	}
	_, err = s.db.W().Exec(r.Context(), `UPDATE worklogs SET started_at = $1, ended_at = $2, note = $3 WHERE id = $4 AND user_id = $5`,
		start, end, note, id, uid)
	s.respondWorklog(w, r, uid, id, err, http.StatusOK)
}

func (s *Server) respondWorklog(w http.ResponseWriter, r *http.Request, uid, id int64, err error, status int) {
	if err != nil {
		internal(w, r, err)
		return
	}
	l, err := s.oneWorklog(r.Context(), uid, id)
	if err != nil {
		internal(w, r, err)
		return
	}
	writeJSON(w, status, l)
}

func (s *Server) deleteWorklog(w http.ResponseWriter, r *http.Request) {
	id, _ := pathID(r, "id")
	tag, err := s.db.W().Exec(r.Context(), `DELETE FROM worklogs WHERE id = $1 AND user_id = $2`, id, currentUser(r).ID)
	if err != nil {
		internal(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, http.StatusNotFound, "لاگ پیدا نشد")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) getTimer(w http.ResponseWriter, r *http.Request) {
	logs, err := s.queryWorklogs(r.Context(), s.db.W(), "w.user_id = $1 AND w.ended_at IS NULL", currentUser(r).ID)
	if err != nil {
		internal(w, r, err)
		return
	}
	if len(logs) == 0 {
		writeJSON(w, http.StatusOK, nil)
		return
	}
	writeJSON(w, http.StatusOK, logs[0])
}

// startTimer stops any running timer and opens a new timer worklog on the task.
func (s *Server) startTimer(w http.ResponseWriter, r *http.Request) {
	tid, _ := pathID(r, "id")
	uid := currentUser(r).ID
	var id int64
	err := pgx.BeginFunc(r.Context(), s.db.W(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `UPDATE worklogs SET ended_at = now() WHERE user_id = $1 AND ended_at IS NULL`, uid); err != nil {
			return err
		}
		return tx.QueryRow(r.Context(), `INSERT INTO worklogs (task_id, user_id, started_at, source)
			SELECT id, user_id, date_trunc('second', now()), 'timer' FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id`,
			tid, uid).Scan(&id)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusNotFound, "تسک پیدا نشد")
		return
	}
	s.respondWorklog(w, r, uid, id, err, http.StatusCreated)
}

func (s *Server) stopTimer(w http.ResponseWriter, r *http.Request) {
	uid := currentUser(r).ID
	var in struct {
		Note *string `json:"note"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if in.Note != nil && len([]rune(*in.Note)) > 1000 {
		fail(w, http.StatusBadRequest, "توضیح لاگ خیلی طولانی است")
		return
	}
	var id int64
	err := s.db.W().QueryRow(r.Context(), `UPDATE worklogs SET ended_at = GREATEST(now(), started_at),
		note = COALESCE(NULLIF($2, ''), note) WHERE user_id = $1 AND ended_at IS NULL RETURNING id`,
		uid, strings.TrimSpace(deref(in.Note))).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusNotFound, "تایمری در حال اجرا نیست")
		return
	}
	s.respondWorklog(w, r, uid, id, err, http.StatusOK)
}

type DayStat struct {
	Date    string `json:"d"`
	Created int    `json:"created"`
	Done    int    `json:"done"`
	Logs    int    `json:"logs"`
	Seconds int64  `json:"seconds"`
}

// dailyStats returns per-day activity in the user's timezone; reads go to a replica.
func (s *Server) dailyStats(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	days, err := strconv.Atoi(r.URL.Query().Get("days"))
	if err != nil || days < 1 || days > 800 {
		days = 371
	}
	loc := userLoc(u)
	now := time.Now().In(loc)
	since := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, -days)
	rows, err := s.db.R().Query(r.Context(), `SELECT d::text, sum(c)::int, sum(dn)::int, sum(l)::int, sum(sec)::bigint FROM (
		SELECT (created_at AT TIME ZONE $2)::date d, 1 c, 0 dn, 0 l, 0::bigint sec FROM tasks WHERE user_id = $1 AND created_at >= $3
		UNION ALL
		SELECT (done_at AT TIME ZONE $2)::date, 0, 1, 0, 0 FROM tasks WHERE user_id = $1 AND done_at >= $3
		UNION ALL
		SELECT (started_at AT TIME ZONE $2)::date, 0, 0, 1, extract(epoch FROM ended_at - started_at)::bigint
			FROM worklogs WHERE user_id = $1 AND ended_at IS NOT NULL AND started_at >= $3
	) x GROUP BY d ORDER BY d`, u.ID, loc.String(), since)
	if err != nil {
		internal(w, r, err)
		return
	}
	stats, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (DayStat, error) {
		var d DayStat
		return d, row.Scan(&d.Date, &d.Created, &d.Done, &d.Logs, &d.Seconds)
	})
	if err != nil {
		internal(w, r, err)
		return
	}
	if stats == nil {
		stats = []DayStat{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"from": since.Format(time.DateOnly), "today": now.Format(time.DateOnly), "days": stats})
}
