import 'package:flutter/foundation.dart' show ChangeNotifier;

import '../../domain/activity.dart';
import '../../domain/dates.dart';
import '../../domain/entities.dart';
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
  DashboardViewModel(this._stats, this._tasks);
  final StatsRepository _stats;
  final TaskRepository _tasks;

  DailyStats? stats;
  List<Task> open = [];
  late ActivityGrid grid;
  late Summary summary;
  late List<MonthBucket> months;
  late List<DayStat> last14;
  late DayStat today;
  late DayStat yesterday;

  @override
  Future<void> load() => guard(() async {
        final r = await Future.wait([_stats.daily(), _tasks.list(openOnly: true)]);
        stats = r[0] as DailyStats;
        open = r[1] as List<Task>;
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

class DayReport {
  DayReport(this.key);
  final String key;
  final List<Worklog> logs = [];
  int seconds = 0;
}

class ReportRow {
  ReportRow(this.log);
  final Worklog log;
  final perDay = List.filled(7, 0);
  int total = 0;
}

class ReportViewModel extends LoadableViewModel {
  ReportViewModel(this._logs) : week = startOfWeek(dayKey(DateTime.now()));
  final WorklogRepository _logs;
  String week;
  List<DayReport> days = [];
  List<ReportRow> rows = [];
  int total = 0;

  String get end => addDays(week, 6);
  bool get isCurrent => week == startOfWeek(dayKey(DateTime.now()));

  void shift(int weeks) {
    week = weeks == 0 ? startOfWeek(dayKey(DateTime.now())) : addDays(week, weeks * 7);
    load();
  }

  @override
  Future<void> load() => guard(() async {
        final list = await _logs.range(week, end);
        days = List.generate(7, (i) => DayReport(addDays(week, i)));
        final byTask = <int, ReportRow>{};
        for (final l in list) {
          final i = days.indexWhere((d) => d.key == dayKey(l.startedAt));
          if (i < 0) continue;
          days[i].logs.add(l);
          days[i].seconds += l.seconds;
          final row = byTask.putIfAbsent(l.taskId, () => ReportRow(l));
          row.perDay[i] += l.seconds;
          row.total += l.seconds;
        }
        rows = byTask.values.toList()..sort((a, b) => b.total.compareTo(a.total));
        total = days.fold(0, (s, d) => s + d.seconds);
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
