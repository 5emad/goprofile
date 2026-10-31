import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/network/secure_client.dart';
import '../../core/update.dart';
import '../../domain/entities.dart';
import '../../domain/repositories.dart';

/// App-wide state: the signed-in user, the running timer and connectivity.
class SessionViewModel extends ChangeNotifier {
  SessionViewModel(this._auth, this._logs, [this._updates]);
  final AuthRepository _auth;
  final WorklogRepository _logs;
  final UpdateChecker? _updates;

  User? user;
  Worklog? timer;
  bool booting = true;

  /// False after a request could not reach the server; true again on the next success.
  bool online = true;

  /// Set when the app started with a saved session but could not reach the server.
  bool offlineBoot = false;

  /// A newer build published on the server, if any.
  AppUpdate? update;

  /// Bumped after any change to tasks or logs so screens can reload.
  int version = 0;
  Timer? _poll;

  bool get jira => user?.settings.jiraMode ?? false;

  Future<void> boot() async {
    booting = true;
    offlineBoot = false;
    notifyListeners();
    try {
      if (await _auth.hasSession()) {
        user = await _auth.me();
        await refreshTimer();
      }
    } on TransportException {
      // Keep the saved session: the user is only offline.
      offlineBoot = true;
    } catch (_) {
      user = null;
    }
    booting = false;
    _startPolling();
    notifyListeners();
    _checkUpdate();
  }

  Future<void> _checkUpdate() async {
    update = await _updates?.check();
    if (update != null) notifyListeners();
  }

  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(minutes: 1), (_) {
      if (offlineBoot) {
        boot();
      } else if (user != null) {
        refreshTimer().catchError((_) {});
      }
    });
  }

  /// Called by the API layer after every request.
  void reachable(bool ok) {
    if (online == ok) return;
    online = ok;
    notifyListeners();
  }

  void signedOut() {
    user = null;
    timer = null;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    user = await _auth.login(email, password);
    await refreshTimer();
    notifyListeners();
  }

  Future<void> register(String name, String email, String password) async {
    user = await _auth.register(name, email, password);
    notifyListeners();
  }

  Future<void> logout() async {
    await _auth.logout().catchError((_) {});
    signedOut();
  }

  Future<void> updateSettings(Settings s) async {
    user = await _auth.updateSettings(s);
    bump();
  }

  Future<void> updateName(String name) async {
    user = await _auth.updateName(name);
    notifyListeners();
  }

  Future<void> refreshTimer() async {
    timer = await _logs.running();
    notifyListeners();
  }

  Future<void> startTimer(int taskId) async {
    timer = await _logs.start(taskId);
    bump();
  }

  /// Stops the timer and saves the log; with [complete] the task also moves to done.
  Future<void> stopTimer({String note = '', bool complete = false}) async {
    await _logs.stop(note: note, complete: complete);
    timer = null;
    bump();
  }

  void bump() {
    version++;
    notifyListeners();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }
}
