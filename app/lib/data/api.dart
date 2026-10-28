import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../core/network/secure_client.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;
  @override
  String toString() => message;
}

/// Holds the session token in the OS keystore (DPAPI on Windows, Keystore on Android).
class TokenStore {
  TokenStore([FlutterSecureStorage? s]) : _s = s ?? const FlutterSecureStorage();
  final FlutterSecureStorage _s;
  static const _k = 'gp.token';
  String? _cache;

  Future<String?> read() async => _cache ??= await _s.read(key: _k);
  Future<void> write(String? t) async {
    _cache = t;
    t == null ? await _s.delete(key: _k) : await _s.write(key: _k, value: t);
  }
}

class Api {
  Api(this._client, this.tokens);
  final SecureClient _client;
  final TokenStore tokens;
  void Function()? onUnauthorized;

  Future<dynamic> send(String method, String path, [Object? body]) async {
    final token = await tokens.read();
    final res = await _client.call(method, path, token, body);
    if (res.status == 401 && token != null) {
      await tokens.write(null);
      onUnauthorized?.call();
    }
    if (res.status >= 400) {
      final msg = res.body is Map ? (res.body['error'] ?? 'خطای ناشناخته') : 'خطای ناشناخته';
      throw ApiException(res.status, msg.toString());
    }
    return res.body;
  }

  Future<dynamic> get(String p) => send('GET', p);
  Future<dynamic> post(String p, [Object? b]) => send('POST', p, b ?? {});
  Future<dynamic> patch(String p, Object b) => send('PATCH', p, b);
  Future<dynamic> delete(String p) => send('DELETE', p);
}
