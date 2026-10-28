// Contracts the data layer implements. View models depend only on these.
import 'entities.dart';

abstract interface class AuthRepository {
  Future<bool> hasSession();
  Future<User> me();
  Future<User> login(String email, String password);
  Future<User> register(String name, String email, String password);
  Future<void> logout();
  Future<User> updateName(String name);
  Future<User> updateSettings(Settings s);
  Future<void> changePassword(String current, String next);
  Future<int> logoutOthers();
}

abstract interface class BoardRepository {
  Future<List<Board>> list();
  Future<Board> get(int id);
  Future<Board> create(String name, String key, String color);
  Future<void> remove(int id);
  Future<Board> addMeta(int boardId, MetaKind kind, String name);
  Future<Board> updateMeta(int boardId, MetaKind kind, int id, {String? name, String? color, bool? isDone});
  Future<Board> removeMeta(int boardId, MetaKind kind, int id);
}

abstract interface class TaskRepository {
  Future<List<Task>> list({int? boardId, bool openOnly = false});
  Future<Task> get(int id);
  Future<Task> create(TaskDraft d);
  Future<Task> update(int id, TaskDraft d);
  Future<Task> move(int id, int statusId, double position);
  Future<void> remove(int id);
}

abstract interface class WorklogRepository {
  Future<List<Worklog>> range(String from, String to);
  Future<Worklog> create(int taskId, DateTime start, int minutes, String note);
  Future<void> remove(int id);
  Future<Worklog?> running();
  Future<Worklog> start(int taskId);
  Future<Worklog> stop([String note = '']);
}

abstract interface class StatsRepository {
  Future<DailyStats> daily([int days = 371]);
}
