import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';

import 'config.dart';

class AppUpdate {
  const AppUpdate(this.version, this.url, this.notes);
  final String version;
  final Uri url;
  final String notes;
}

/// Reads /app/version.json, which deploy.sh publishes next to the APK and the Windows build.
class UpdateChecker {
  UpdateChecker([http.Client? client]) : _http = client ?? http.Client();
  final http.Client _http;

  Future<AppUpdate?> check() async {
    if (kIsWeb) return null;
    try {
      final res = await _http.get(Uri.parse('${AppConfig.apiUrl}/app/version.json')).timeout(const Duration(seconds: 10));
      if (res.statusCode != 200) return null;
      final j = jsonDecode(res.body) as Map<String, dynamic>;
      final build = (j['build'] as num?)?.toInt() ?? 0;
      final info = await PackageInfo.fromPlatform();
      if (build <= (int.tryParse(info.buildNumber) ?? 0)) return null;
      final file = Platform.isAndroid ? j['android'] : Platform.isWindows ? j['windows'] : null;
      if (file is! String || file.isEmpty) return null;
      final url = Uri.parse(AppConfig.apiUrl).resolve(file);
      // Only offer downloads from our own HTTPS origin.
      if (url.scheme != 'https' || url.host != Uri.parse(AppConfig.apiUrl).host) return null;
      return AppUpdate(j['version'] as String? ?? '', url, j['notes'] as String? ?? '');
    } catch (_) {
      return null;
    }
  }
}
