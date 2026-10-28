package api

import (
	"fmt"
	"strings"
)

// setter builds UPDATE/INSERT statements from a fixed set of column names.
// Column names always come from code, never from the client.
type setter struct {
	cols  []string
	exprs []string
	args  []any
}

func (s *setter) arg(v any) string {
	s.args = append(s.args, v)
	return fmt.Sprintf("$%d", len(s.args))
}

func (s *setter) add(col string, v any) {
	s.cols = append(s.cols, col)
	s.exprs = append(s.exprs, s.arg(v))
}

// addRaw adds a column whose value is an SQL expression with one %s placeholder.
func (s *setter) addRaw(col, expr string, v any) {
	s.cols = append(s.cols, col)
	s.exprs = append(s.exprs, fmt.Sprintf(expr, s.arg(v)))
}

// expr adds a column set to a constant SQL expression.
func (s *setter) expr(col, sql string) {
	s.cols = append(s.cols, col)
	s.exprs = append(s.exprs, sql)
}

func opt[T any](s *setter, col string, v *T) {
	if v != nil {
		s.add(col, *v)
	}
}

func (s *setter) opt(col string, v any) {
	switch p := v.(type) {
	case *string:
		opt(s, col, p)
	case *int:
		opt(s, col, p)
	case *int64:
		opt(s, col, p)
	case *bool:
		opt(s, col, p)
	default:
		panic("setter: unsupported type")
	}
}

func (s *setter) empty() bool { return len(s.cols) == 0 }

func (s *setter) sql(table string) string {
	parts := make([]string, len(s.cols))
	for i, c := range s.cols {
		parts[i] = c + " = " + s.exprs[i]
	}
	return "UPDATE " + table + " SET " + strings.Join(parts, ", ")
}

func (s *setter) insertSQL(table string) string {
	return "INSERT INTO " + table + " (" + strings.Join(s.cols, ", ") + ") VALUES (" + strings.Join(s.exprs, ", ") + ")"
}
