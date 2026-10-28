import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';
import '../crypto/envelope.dart';

class TransportException implements Exception {
  TransportException(this.message);
  final String message;
  @override
  String toString() => message;
}

class SecureResponse {
  SecureResponse(this.status, this.body);
  final int status;
  final dynamic body;
}

/// Sends every API call through the encrypted gateway.
class SecureClient {
  SecureClient({http.Client? client, String? baseUrl})
      : _http = client ?? http.Client(),
        _base = baseUrl ?? AppConfig.apiUrl;

  final http.Client _http;
  final String _base;
  Future<(ServerKey, int)>? _key;

  Future<(ServerKey, int)> _fetchKey() async {
    final res = await _http.get(Uri.parse('$_base/api/key')).timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) throw TransportException('سرور در دسترس نیست');
    final j = jsonDecode(res.body) as Map<String, dynamic>;
    final pub = j['pub'] as String;
    if (AppConfig.pinnedKey.isNotEmpty && pub != AppConfig.pinnedKey) {
      throw TransportException('کلید سرور معتبر نیست');
    }
    final skew = (j['now'] as num).toInt() - DateTime.now().millisecondsSinceEpoch;
    return (ServerKey(j['kid'] as String, unb64u(pub)), skew);
  }

  Future<(ServerKey, int)> _getKey() {
    return _key ??= _fetchKey().catchError((Object e) {
      _key = null;
      throw e;
    });
  }

  Future<SecureResponse> call(String method, String path, String? token, [Object? body, bool retry = true]) async {
    final (sk, skew) = await _getKey();
    final plain = utf8.encode(jsonEncode({
      'm': method,
      'p': path,
      't': token ?? '',
      'ts': DateTime.now().millisecondsSinceEpoch + skew,
      'id': b64u(randomBytes(16)),
      'b': body,
    }));
    final sealed = seal(sk, plain);
    http.Response res;
    try {
      res = await _http
          .post(Uri.parse('$_base/api/x'), headers: {'Content-Type': 'application/json'}, body: jsonEncode(sealed.body))
          .timeout(const Duration(seconds: 30));
    } catch (_) {
      throw TransportException('اتصال به سرور برقرار نشد');
    }
    if (res.statusCode == 409 && retry) {
      _key = null;
      return call(method, path, token, body, false);
    }
    if (res.statusCode == 429) throw TransportException('درخواست‌ها زیاد است؛ کمی صبر کنید');
    if (res.statusCode != 200) throw TransportException('پاسخ نامعتبر از سرور');
    final env = jsonDecode(res.body) as Map<String, dynamic>;
    final inner = jsonDecode(utf8.decode(sealed.open(env['n'] as String, env['c'] as String))) as Map<String, dynamic>;
    return SecureResponse((inner['s'] as num).toInt(), inner['b']);
  }
}
