import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../domain/entities.dart';
import '../../domain/repositories.dart';

/// App-wide state: the signed-in user and the running timer.
class SessionViewModel extends ChangeNotifier {
  SessionViewModel(this._auth, this._logs);
  final AuthRepository _auth;
  final WorklogRepository _logs;

  User? user;
  Worklog? timer;
  bool booting = true;

  /// Bumped after any change to tasks or logs so screens can reload.
  int version = 0;
  Timer? _poll;

  bool get jira => user?.settings.jiraMode ?? false;

  Future<void> boot() async {
    try {
      if (await _auth.hasSession()) {
        user = await _auth.me();
        await refreshTimer();
      }
    } catch (_) {
      user = null;
    }
    booting = false;
    _startPolling();
    notifyListeners();
  }

  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(minutes: 1), (_) => user != null ? refreshTimer().catchError((_) {}) : null);
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

  Future<void> stopTimer([String note = '']) async {
    await _logs.stop(note);
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
