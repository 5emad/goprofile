// Talks to a running API through the encrypted gateway.
// Run with: GP_API=http://localhost:8080 flutter test test/live_api_test.dart
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:goprofile/core/network/secure_client.dart';

void main() {
  final base = Platform.environment['GP_API'];

  test('register, create task and log time', () async {
    final c = SecureClient(baseUrl: base);
    final email = 'dart-${DateTime.now().millisecondsSinceEpoch}@example.com';
    final reg = await c.call('POST', '/auth/register', null, {'name': 'دارت', 'email': email, 'password': 'very-secret-pass'});
    expect(reg.status, 200);
    final token = reg.body['token'] as String;

    final boards = await c.call('GET', '/boards', token);
    final boardId = (boards.body as List).first['id'];
    final task = await c.call('POST', '/tasks', token, {'board_id': boardId, 'title': 'تسک از فلاتر'});
    expect(task.status, 201);
    expect(task.body['title'], 'تسک از فلاتر');

    final log = await c.call('POST', '/tasks/${task.body['id']}/worklogs', token,
        {'started_at': DateTime.now().toUtc().subtract(const Duration(hours: 1)).toIso8601String(), 'minutes': 45, 'note': ''});
    expect(log.status, 201);
    expect(log.body['seconds'], 2700);

    final bad = await c.call('GET', '/me', 'not-a-token');
    expect(bad.status, 401);
  }, skip: base == null ? 'set GP_API to run' : false);
}
