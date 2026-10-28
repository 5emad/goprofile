class Settings {
  const Settings({this.jiraMode = false, this.timezone = 'Asia/Tehran', this.dailyGoalMinutes = 360, this.theme = 'system'});
  final bool jiraMode;
  final String timezone;
  final int dailyGoalMinutes;
  final String theme;

  Settings copyWith({bool? jiraMode, String? timezone, int? dailyGoalMinutes, String? theme}) => Settings(
        jiraMode: jiraMode ?? this.jiraMode,
        timezone: timezone ?? this.timezone,
        dailyGoalMinutes: dailyGoalMinutes ?? this.dailyGoalMinutes,
        theme: theme ?? this.theme,
      );
}

class User {
  const User({required this.id, required this.email, required this.name, required this.settings, required this.createdAt});
  final int id;
  final String email;
  final String name;
  final Settings settings;
  final DateTime createdAt;
}

enum MetaKind { statuses, phases, epics, categories }

class Meta {
  const Meta({required this.id, required this.name, required this.position, this.color, this.isDone = false});
  final int id;
  final String name;
  final int position;
  final String? color;
  final bool isDone;
}

class Board {
  const Board({
    required this.id,
    required this.name,
    required this.key,
    required this.color,
    required this.taskCount,
    required this.openCount,
    required this.statuses,
    required this.phases,
    required this.epics,
    required this.categories,
  });
  final int id;
  final String name;
  final String key;
  final String color;
  final int taskCount;
  final int openCount;
  final List<Meta> statuses;
  final List<Meta> phases;
  final List<Meta> epics;
  final List<Meta> categories;

  List<Meta> of(MetaKind k) => switch (k) {
        MetaKind.statuses => statuses,
        MetaKind.phases => phases,
        MetaKind.epics => epics,
        MetaKind.categories => categories,
      };
}

class Worklog {
  const Worklog({
    required this.id,
    required this.taskId,
    required this.taskKey,
    required this.jiraKey,
    required this.taskTitle,
    required this.boardName,
    required this.startedAt,
    required this.endedAt,
    required this.seconds,
    required this.note,
    required this.source,
  });
  final int id;
  final int taskId;
  final String taskKey;
  final String jiraKey;
  final String taskTitle;
  final String boardName;
  final DateTime startedAt;
  final DateTime? endedAt;
  final int seconds;
  final String note;
  final String source;

  bool get running => endedAt == null;
  String label(bool jira) => jira && jiraKey.isNotEmpty ? jiraKey : taskKey;
}

class Task {
  const Task({
    required this.id,
    required this.boardId,
    required this.boardName,
    required this.key,
    required this.jiraKey,
    required this.title,
    required this.description,
    required this.statusId,
    required this.phaseId,
    required this.epicId,
    required this.categoryId,
    required this.priority,
    required this.estimateMinutes,
    required this.dueOn,
    required this.position,
    required this.doneAt,
    required this.loggedSeconds,
    required this.running,
    this.worklogs = const [],
  });
  final int id;
  final int boardId;
  final String boardName;
  final String key;
  final String jiraKey;
  final String title;
  final String description;
  final int? statusId;
  final int? phaseId;
  final int? epicId;
  final int? categoryId;
  final int priority;
  final int estimateMinutes;
  final String? dueOn;
  final double position;
  final DateTime? doneAt;
  final int loggedSeconds;
  final bool running;
  final List<Worklog> worklogs;

  String label(bool jira) => jira && jiraKey.isNotEmpty ? jiraKey : key;
}

/// Fields for creating or editing a task.
class TaskDraft {
  TaskDraft({
    this.boardId,
    this.jiraKey = '',
    this.title = '',
    this.description = '',
    this.statusId,
    this.phaseId,
    this.epicId,
    this.categoryId,
    this.priority = 2,
    this.estimateMinutes = 0,
    this.dueOn,
  });

  factory TaskDraft.of(Task t) => TaskDraft(
        boardId: t.boardId,
        jiraKey: t.jiraKey,
        title: t.title,
        description: t.description,
        statusId: t.statusId,
        phaseId: t.phaseId,
        epicId: t.epicId,
        categoryId: t.categoryId,
        priority: t.priority,
        estimateMinutes: t.estimateMinutes,
        dueOn: t.dueOn,
      );

  int? boardId;
  String jiraKey;
  String title;
  String description;
  int? statusId;
  int? phaseId;
  int? epicId;
  int? categoryId;
  int priority;
  int estimateMinutes;
  String? dueOn;
}

class DayStat {
  const DayStat(this.day, this.created, this.done, this.logs, this.seconds);
  final String day;
  final int created;
  final int done;
  final int logs;
  final int seconds;

  int get contributions => created + done + logs;
}

class DailyStats {
  const DailyStats(this.from, this.today, this.days);
  final String from;
  final String today;
  final List<DayStat> days;
}

const priorities = ['خیلی کم', 'کم', 'متوسط', 'زیاد', 'فوری'];
