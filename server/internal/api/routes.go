package api

func (s *Server) routes() {
	m := s.inner
	m.HandleFunc("POST /auth/register", s.register)
	m.HandleFunc("POST /auth/login", s.login)
	m.HandleFunc("POST /auth/logout", s.authed(s.logout))

	m.HandleFunc("GET /me", s.authed(s.me))
	m.HandleFunc("PATCH /me", s.authed(s.updateMe))
	m.HandleFunc("POST /me/password", s.authed(s.changePassword))
	m.HandleFunc("POST /me/logout-others", s.authed(s.logoutOthers))

	m.HandleFunc("GET /boards", s.authed(s.listBoards))
	m.HandleFunc("POST /boards", s.authed(s.createBoard))
	m.HandleFunc("GET /boards/{id}", s.authed(s.getBoard))
	m.HandleFunc("PATCH /boards/{id}", s.authed(s.updateBoard))
	m.HandleFunc("DELETE /boards/{id}", s.authed(s.deleteBoard))
	m.HandleFunc("POST /boards/{id}/{kind}", s.authed(s.createMeta))
	m.HandleFunc("PATCH /boards/{id}/{kind}/{item}", s.authed(s.updateMeta))
	m.HandleFunc("DELETE /boards/{id}/{kind}/{item}", s.authed(s.deleteMeta))

	m.HandleFunc("GET /tasks", s.authed(s.listTasks))
	m.HandleFunc("POST /tasks", s.authed(s.createTask))
	m.HandleFunc("GET /tasks/{id}", s.authed(s.getTask))
	m.HandleFunc("PATCH /tasks/{id}", s.authed(s.updateTask))
	m.HandleFunc("DELETE /tasks/{id}", s.authed(s.deleteTask))

	m.HandleFunc("GET /worklogs", s.authed(s.listWorklogs))
	m.HandleFunc("POST /tasks/{id}/worklogs", s.authed(s.createWorklog))
	m.HandleFunc("PATCH /worklogs/{id}", s.authed(s.updateWorklog))
	m.HandleFunc("DELETE /worklogs/{id}", s.authed(s.deleteWorklog))

	m.HandleFunc("GET /timer", s.authed(s.getTimer))
	m.HandleFunc("POST /tasks/{id}/timer", s.authed(s.startTimer))
	m.HandleFunc("POST /timer/stop", s.authed(s.stopTimer))

	m.HandleFunc("GET /stats/daily", s.authed(s.dailyStats))
}
