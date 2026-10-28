CREATE TABLE users (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         text        NOT NULL,
    name          text        NOT NULL,
    password_hash text        NOT NULL,
    settings      jsonb       NOT NULL DEFAULT '{}',
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE sessions (
    token_hash   bytea PRIMARY KEY,
    user_id      bigint      NOT NULL REFERENCES users ON DELETE CASCADE,
    client       text        NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE boards (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     bigint      NOT NULL REFERENCES users ON DELETE CASCADE,
    name        text        NOT NULL,
    key         text        NOT NULL,
    color       text        NOT NULL DEFAULT '#5b7a3a',
    next_number int         NOT NULL DEFAULT 1,
    position    int         NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX boards_user_idx ON boards (user_id);

CREATE TABLE statuses (
    id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    board_id bigint  NOT NULL REFERENCES boards ON DELETE CASCADE,
    name     text    NOT NULL,
    position int     NOT NULL DEFAULT 0,
    is_done  boolean NOT NULL DEFAULT false
);
CREATE INDEX statuses_board_idx ON statuses (board_id);

CREATE TABLE phases (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    board_id  bigint NOT NULL REFERENCES boards ON DELETE CASCADE,
    name      text   NOT NULL,
    position  int    NOT NULL DEFAULT 0,
    starts_on date,
    ends_on   date
);
CREATE INDEX phases_board_idx ON phases (board_id);

CREATE TABLE epics (
    id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    board_id bigint NOT NULL REFERENCES boards ON DELETE CASCADE,
    name     text   NOT NULL,
    color    text   NOT NULL DEFAULT '#8aa665',
    position int    NOT NULL DEFAULT 0
);
CREATE INDEX epics_board_idx ON epics (board_id);

CREATE TABLE categories (
    id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    board_id bigint NOT NULL REFERENCES boards ON DELETE CASCADE,
    name     text   NOT NULL,
    color    text   NOT NULL DEFAULT '#b5c99a',
    position int    NOT NULL DEFAULT 0
);
CREATE INDEX categories_board_idx ON categories (board_id);

CREATE TABLE tasks (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    board_id         bigint      NOT NULL REFERENCES boards ON DELETE CASCADE,
    user_id          bigint      NOT NULL REFERENCES users ON DELETE CASCADE,
    number           int         NOT NULL,
    jira_key         text        NOT NULL DEFAULT '',
    title            text        NOT NULL,
    description      text        NOT NULL DEFAULT '',
    status_id        bigint      REFERENCES statuses ON DELETE SET NULL,
    phase_id         bigint      REFERENCES phases ON DELETE SET NULL,
    epic_id          bigint      REFERENCES epics ON DELETE SET NULL,
    category_id      bigint      REFERENCES categories ON DELETE SET NULL,
    priority         smallint    NOT NULL DEFAULT 2 CHECK (priority BETWEEN 0 AND 4),
    estimate_minutes int         NOT NULL DEFAULT 0 CHECK (estimate_minutes >= 0),
    due_on           date,
    position         double precision NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    done_at          timestamptz,
    UNIQUE (board_id, number)
);
CREATE INDEX tasks_board_idx ON tasks (board_id, status_id, position);
CREATE INDEX tasks_user_created_idx ON tasks (user_id, created_at);
CREATE INDEX tasks_user_done_idx ON tasks (user_id, done_at) WHERE done_at IS NOT NULL;

CREATE TABLE worklogs (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id    bigint      NOT NULL REFERENCES tasks ON DELETE CASCADE,
    user_id    bigint      NOT NULL REFERENCES users ON DELETE CASCADE,
    started_at timestamptz NOT NULL,
    ended_at   timestamptz,
    note       text        NOT NULL DEFAULT '',
    source     text        NOT NULL CHECK (source IN ('manual', 'timer')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);
-- Only one running timer per user.
CREATE UNIQUE INDEX worklogs_running_idx ON worklogs (user_id) WHERE ended_at IS NULL;
CREATE INDEX worklogs_user_started_idx ON worklogs (user_id, started_at);
CREATE INDEX worklogs_task_idx ON worklogs (task_id);
