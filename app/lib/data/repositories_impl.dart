import '../domain/entities.dart';
import '../domain/repositories.dart';
import 'api.dart';
import 'models.dart';

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl(this._api);
  final Api _api;

  Future<User> _session(dynamic r) async {
    await _api.tokens.write(r['token'] as String);
    return userFromJson(r['user'] as J);
  }

  @override
  Future<bool> hasSession() async => await _api.tokens.read() != null;
  @override
  Future<User> me() async => userFromJson(await _api.get('/me') as J);
  @override
  Future<User> login(String email, String password) async => _session(await _api.post('/auth/login', {'email': email, 'password': password}));
  @override
  Future<User> register(String name, String email, String password) async =>
      _session(await _api.post('/auth/register', {'name': name, 'email': email, 'password': password}));
  @override
  Future<void> logout() async {
    try {
      await _api.post('/auth/logout');
    } finally {
      await _api.tokens.write(null);
    }
  }

  @override
  Future<User> updateName(String name) async => userFromJson(await _api.patch('/me', {'name': name}) as J);
  @override
  Future<User> updateSettings(Settings s) async => userFromJson(await _api.patch('/me', {'settings': settingsToJson(s)}) as J);
  @override
  Future<void> changePassword(String current, String next) => _api.post('/me/password', {'current': current, 'new': next});
  @override
  Future<int> logoutOthers() async => ((await _api.post('/me/logout-others'))['removed'] as num).toInt();
}

class BoardRepositoryImpl implements BoardRepository {
  BoardRepositoryImpl(this._api);
  final Api _api;

  @override
  Future<List<Board>> list() async => (await _api.get('/boards') as List).map((e) => boardFromJson(e as J)).toList();
  @override
  Future<Board> get(int id) async => boardFromJson(await _api.get('/boards/$id') as J);
  @override
  Future<Board> create(String name, String key, String color) async =>
      boardFromJson(await _api.post('/boards', {'name': name, 'key': key, 'color': color}) as J);
  @override
  Future<void> remove(int id) => _api.delete('/boards/$id');
  @override
  Future<Board> addMeta(int boardId, MetaKind kind, String name) async =>
      boardFromJson(await _api.post('/boards/$boardId/${kind.name}', {'name': name}) as J);
  @override
  Future<Board> updateMeta(int boardId, MetaKind kind, int id, {String? name, String? color, bool? isDone}) async =>
      boardFromJson(await _api.patch('/boards/$boardId/${kind.name}/$id', {
        'name': ?name,
        'color': ?color,
        'is_done': ?isDone,
      }) as J);
  @override
  Future<Board> removeMeta(int boardId, MetaKind kind, int id) async => boardFromJson(await _api.delete('/boards/$boardId/${kind.name}/$id') as J);
}

class TaskRepositoryImpl implements TaskRepository {
  TaskRepositoryImpl(this._api);
  final Api _api;

  @override
  Future<List<Task>> list({int? boardId, bool openOnly = false}) async {
    final q = [if (boardId != null) 'board_id=$boardId', if (openOnly) 'open=1'].join('&');
    return (await _api.get('/tasks${q.isEmpty ? '' : '?$q'}') as List).map((e) => taskFromJson(e as J)).toList();
  }

  @override
  Future<Task> get(int id) async => taskFromJson(await _api.get('/tasks/$id') as J);
  @override
  Future<Task> create(TaskDraft d) async => taskFromJson(await _api.post('/tasks', draftToJson(d)) as J);
  @override
  Future<Task> update(int id, TaskDraft d) async => taskFromJson(await _api.patch('/tasks/$id', draftToJson(d)..remove('board_id')) as J);
  @override
  Future<Task> move(int id, int statusId, double position) async =>
      taskFromJson(await _api.patch('/tasks/$id', {'status_id': statusId, 'position': position}) as J);
  @override
  Future<void> remove(int id) => _api.delete('/tasks/$id');
}

class WorklogRepositoryImpl implements WorklogRepository {
  WorklogRepositoryImpl(this._api);
  final Api _api;

  @override
  Future<List<Worklog>> range(String from, String to) async =>
      (await _api.get('/worklogs?from=$from&to=$to') as List).map((e) => worklogFromJson(e as J)).toList();
  @override
  Future<Worklog> create(int taskId, DateTime start, int minutes, String note) async => worklogFromJson(
      await _api.post('/tasks/$taskId/worklogs', {'started_at': start.toUtc().toIso8601String(), 'minutes': minutes, 'note': note}) as J);
  @override
  Future<void> remove(int id) => _api.delete('/worklogs/$id');
  @override
  Future<Worklog?> running() async {
    final r = await _api.get('/timer');
    return r == null ? null : worklogFromJson(r as J);
  }

  @override
  Future<Worklog> start(int taskId) async => worklogFromJson(await _api.post('/tasks/$taskId/timer') as J);
  @override
  Future<Worklog> stop([String note = '']) async => worklogFromJson(await _api.post('/timer/stop', {'note': note}) as J);
}

class StatsRepositoryImpl implements StatsRepository {
  StatsRepositoryImpl(this._api);
  final Api _api;

  @override
  Future<DailyStats> daily([int days = 371]) async => statsFromJson(await _api.get('/stats/daily?days=$days') as J);
}
