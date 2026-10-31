import 'package:flutter/foundation.dart' show ChangeNotifier;

import '../../domain/activity.dart';
import '../../domain/dates.dart';
import '../../domain/entities.dart';
import '../../domain/report.dart';
import '../../domain/repositories.dart';

/// Base for screens that load data and expose loading/error state.
abstract class LoadableViewModel extends ChangeNotifier {
  bool loading = true;
  String? error;
  bool _disposed = false;

  Future<void> load();

  Future<void> guard(Future<void> Function() f) async {
    loading = true;
    error = null;
    _notify();
    try {
      await f();
    } catch (e) {
      error = e.toString();
    }
    loading = false;
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

class DashboardViewModel extends LoadableViewModel {
  DashboardViewModel(this._stats, this._tasks, this._boards);
  final StatsRepository _stats;
  final TaskRepository _tasks;
  final BoardRepository _boards;

  DailyStats? stats;
  List<Task> tasks = [];
  List<Board> boards = [];

  /// Open tasks, earliest due date first.
  List<Task> open = [];
  List<Task> overdue = [];
  List<Task> soon = [];
  late ActivityGrid grid;
  late Summary summary;
  late List<MonthBucket> months;
  late List<DayStat> last14;
  late DayStat today;
  late DayStat yesterday;

  @override
  Future<void> load() => guard(() async {
        final r = await Future.wait([_stats.daily(), _tasks.list(), _boards.list()]);
        stats = r[0] as DailyStats;
        tasks = r[1] as List<Task>;
        boards = r[2] as List<Board>;
        final g = groupTasks(tasks, rangeOf(Period.week, dayKey(DateTime.now())), dayKey(DateTime.now()));
        open = g.open;
        overdue = g.overdue;
        soon = g.soon;
        final s = stats!;
        grid = buildGrid(s.days, s.today);
        summary = summarize(s.days, s.today);
        months = monthly(s.days, s.today);
        last14 = List.generate(14, (i) => dayOf(s.days, addDays(s.today, i - 13)));
        today = dayOf(s.days, s.today);
        yesterday = dayOf(s.days, addDays(s.today, -1));
      });
}

class BoardsViewModel extends LoadableViewModel {
  BoardsViewModel(this._boards);
  final BoardRepository _boards;
  List<Board> boards = [];

  @override
  Future<void> load() => guard(() async => boards = await _boards.list());

  Future<Board> create(String name, String key, String color) async {
    final b = await _boards.create(name, key, color);
    await load();
    return b;
  }
}

class BoardViewModel extends LoadableViewModel {
  BoardViewModel(this.boardId, this._boards, this._tasks);
  final int boardId;
  final BoardRepository _boards;
  final TaskRepository _tasks;

  Board? board;
  List<Task> tasks = [];
  String query = '';
  int? epic;
  int? phase;
  int? category;

  @override
  Future<void> load() => guard(() async {
        final r = await Future.wait([_boards.get(boardId), _tasks.list(boardId: boardId)]);
        board = r[0] as Board;
        tasks = r[1] as List<Task>;
      });

  void setFilter({String? q, int? epic, int? phase, int? category, bool clear = false}) {
    if (q != null) query = q;
    if (clear) {
      this.epic = epic;
      this.phase = phase;
      this.category = category;
    }
    notifyListeners();
  }

  List<Task> column(int statusId) {
    final q = query.trim().toLowerCase();
    return tasks
        .where((t) =>
            t.statusId == statusId &&
            (q.isEmpty || t.title.toLowerCase().contains(q) || t.key.toLowerCase().contains(q) || t.jiraKey.toLowerCase().contains(q)) &&
            (epic == null || t.epicId == epic) &&
            (phase == null || t.phaseId == phase) &&
            (category == null || t.categoryId == category))
        .toList()
      ..sort((a, b) => a.position.compareTo(b.position));
  }

  /// Moves a task to the end of a column, or before `beforeId`.
  Future<void> move(Task t, int statusId, int? beforeId) async {
    final col = tasks.where((x) => x.statusId == statusId && x.id != t.id).toList()..sort((a, b) => a.position.compareTo(b.position));
    final idx = beforeId == null ? col.length : col.indexWhere((x) => x.id == beforeId);
    final prev = idx > 0 ? col[idx - 1].position : null;
    final next = idx >= 0 && idx < col.length ? col[idx].position : null;
    final pos = prev == null && next == null ? 1.0 : prev == null ? next! - 1 : next == null ? prev + 1 : (prev + next) / 2;
    final updated = await _tasks.move(t.id, statusId, pos);
    tasks = [for (final x in tasks) x.id == t.id ? updated : x];
    notifyListeners();
  }

  Future<void> setBoard(Future<Board> f) async {
    board = await f;
    notifyListeners();
  }
}

/// Day, week, month or year report with the previous period for comparison.
class ReportViewModel extends LoadableViewModel {
  ReportViewModel(this._logs, this._tasks, this._boards, this.goalSeconds) : range = rangeOf(Period.week, dayKey(DateTime.now()));
  final WorklogRepository _logs;
  final TaskRepository _tasks;
  final BoardRepository _boards;
  final int goalSeconds;

  Range range;
  PeriodReport? report;
  PeriodReport? prev;
  TaskGroups? groups;
  List<String> notes = [];
  Map<int, Meta> statuses = {};
  String prevName = '';

  String get today => dayKey(DateTime.now());
  bool get isCurrent => range.contains(today);

  void setPeriod(Period p) {
    range = rangeOf(p, range.contains(today) ? today : range.from);
    load();
  }

  void shift(int n) {
    range = n == 0 ? rangeOf(range.period, today) : shiftRange(range, n);
    load();
  }

  void openDay(String key) {
    range = rangeOf(Period.day, key);
    load();
  }

  @override
  Future<void> load() => guard(() async {
        final r = range;
        final prevRange = shiftRange(r, -1);
        // A running period is compared with the same number of days at the start of the previous one.
        final partial = r.contains(today) && today != r.to;
        var cmp = prevRange;
        if (partial) {
          final to = addDays(prevRange.from, diffDays(today, r.from));
          if (to.compareTo(prevRange.to) < 0) cmp = prevRange.withTo(to);
        }
        final res = await Future.wait([_logs.range(r.from, r.to), _logs.range(prevRange.from, prevRange.to), _tasks.list(), _boards.list()]);
        if (r != range) return;
        report = buildReport(r, res[0] as List<Worklog>, goalSeconds, today: today);
        prev = buildReport(cmp, res[1] as List<Worklog>, goalSeconds);
        groups = groupTasks(res[2] as List<Task>, r, today);
        statuses = {for (final b in res[3] as List<Board>) for (final s in b.statuses) s.id: s};
        prevName = partial ? 'مدت مشابه ${previousNames[r.period]}' : previousNames[r.period]!;
        notes = insights(report!, prev, groups!, goalSeconds, prevName);
      });
}

class TaskEditorViewModel extends LoadableViewModel {
  TaskEditorViewModel(this.taskId, this._tasks, this._logs);
  final int taskId;
  final TaskRepository _tasks;
  final WorklogRepository _logs;
  Task? task;

  @override
  Future<void> load() => guard(() async => task = await _tasks.get(taskId));

  Future<void> save(TaskDraft d) async {
    await _tasks.update(taskId, d);
    await load();
  }

  Future<void> remove() => _tasks.remove(taskId);

  Future<void> addLog(DateTime start, int minutes, String note) async {
    await _logs.create(taskId, start, minutes, note);
    await load();
  }

  Future<void> removeLog(int id) async {
    await _logs.remove(id);
    await load();
  }
}
