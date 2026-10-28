/// Build-time configuration, set with --dart-define.
class AppConfig {
  static const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'https://goprofile.ir');

  /// Optional pinned server public key (base64url). When set, the app refuses any other key.
  static const pinnedKey = String.fromEnvironment('SERVER_KEY');
}
