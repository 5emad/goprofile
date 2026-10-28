// JSON <-> entity mapping.
import '../domain/entities.dart';

typedef J = Map<String, dynamic>;

int? _id(dynamic v) => v == null ? null : (v as num).toInt();
DateTime? _dt(dynamic v) => v == null ? null : DateTime.parse(v as String);

Settings settingsFromJson(J j) => Settings(
      jiraMode: j['jira_mode'] as bool? ?? false,
      timezone: j['timezone'] as String? ?? 'Asia/Tehran',
      dailyGoalMinutes: (j['daily_goal_minutes'] as num?)?.toInt() ?? 360,
      theme: j['theme'] as String? ?? 'system',
    );

J settingsToJson(Settings s) => {
      'jira_mode': s.jiraMode,
      'timezone': s.timezone,
      'daily_goal_minutes': s.dailyGoalMinutes,
      'theme': s.theme,
    };

User userFromJson(J j) => User(
      id: (j['id'] as num).toInt(),
      email: j['email'] as String,
      name: j['name'] as String,
      settings: settingsFromJson(j['settings'] as J),
      createdAt: DateTime.parse(j['created_at'] as String),
    );

Meta metaFromJson(J j) => Meta(
      id: (j['id'] as num).toInt(),
      name: j['name'] as String,
      position: (j['position'] as num).toInt(),
      color: j['color'] as String?,
      isDone: j['is_done'] as bool? ?? false,
    );

List<Meta> _metas(dynamic v) => ((v as List?) ?? []).map((e) => metaFromJson(e as J)).toList();

Board boardFromJson(J j) => Board(
      id: (j['id'] as num).toInt(),
      name: j['name'] as String,
      key: j['key'] as String,
      color: j['color'] as String,
      taskCount: (j['task_count'] as num?)?.toInt() ?? 0,
      openCount: (j['open_count'] as num?)?.toInt() ?? 0,
      statuses: _metas(j['statuses']),
      phases: _metas(j['phases']),
      epics: _metas(j['epics']),
      categories: _metas(j['categories']),
    );

Worklog worklogFromJson(J j) => Worklog(
      id: (j['id'] as num).toInt(),
      taskId: (j['task_id'] as num).toInt(),
      taskKey: j['task_key'] as String,
      jiraKey: j['jira_key'] as String? ?? '',
      taskTitle: j['task_title'] as String,
      boardName: j['board_name'] as String,
      startedAt: DateTime.parse(j['started_at'] as String),
      endedAt: _dt(j['ended_at']),
      seconds: (j['seconds'] as num).toInt(),
      note: j['note'] as String? ?? '',
      source: j['source'] as String,
    );

Task taskFromJson(J j) => Task(
      id: (j['id'] as num).toInt(),
      boardId: (j['board_id'] as num).toInt(),
      boardName: j['board_name'] as String,
      key: j['key'] as String,
      jiraKey: j['jira_key'] as String? ?? '',
      title: j['title'] as String,
      description: j['description'] as String? ?? '',
      statusId: _id(j['status_id']),
      phaseId: _id(j['phase_id']),
      epicId: _id(j['epic_id']),
      categoryId: _id(j['category_id']),
      priority: (j['priority'] as num).toInt(),
      estimateMinutes: (j['estimate_minutes'] as num).toInt(),
      dueOn: j['due_on'] as String?,
      position: (j['position'] as num).toDouble(),
      doneAt: _dt(j['done_at']),
      loggedSeconds: (j['logged_seconds'] as num).toInt(),
      running: j['running'] as bool? ?? false,
      worklogs: ((j['worklogs'] as List?) ?? []).map((e) => worklogFromJson(e as J)).toList(),
    );

J draftToJson(TaskDraft d) => {
      'board_id': d.boardId,
      'jira_key': d.jiraKey,
      'title': d.title,
      'description': d.description,
      'status_id': d.statusId,
      'phase_id': d.phaseId,
      'epic_id': d.epicId,
      'category_id': d.categoryId,
      'priority': d.priority,
      'estimate_minutes': d.estimateMinutes,
      'due_on': d.dueOn,
    };

DailyStats statsFromJson(J j) => DailyStats(
      j['from'] as String,
      j['today'] as String,
      (j['days'] as List)
          .map((e) => DayStat(e['d'] as String, (e['created'] as num).toInt(), (e['done'] as num).toInt(), (e['logs'] as num).toInt(),
              (e['seconds'] as num).toInt()))
          .toList(),
    );
