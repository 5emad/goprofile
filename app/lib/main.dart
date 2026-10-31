import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'core/theme.dart';
import 'core/update.dart';
import 'di.dart';
import 'presentation/viewmodels/session_vm.dart';
import 'presentation/views/login_view.dart';
import 'presentation/views/shell_view.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final deps = Deps.create();
  final session = SessionViewModel(deps.auth, deps.worklogs, UpdateChecker());
  deps.api.onUnauthorized = session.signedOut;
  deps.api.onNetwork = session.reachable;
  session.boot();
  runApp(MultiProvider(
    providers: [
      Provider.value(value: deps),
      ChangeNotifierProvider.value(value: session),
    ],
    child: const GoProfileApp(),
  ));
}

class GoProfileApp extends StatelessWidget {
  const GoProfileApp({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SessionViewModel>();
    final theme = s.user?.settings.theme ?? 'system';
    return MaterialApp(
      title: 'goprofile',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: switch (theme) { 'light' => ThemeMode.light, 'dark' => ThemeMode.dark, _ => ThemeMode.system },
      locale: const Locale('fa', 'IR'),
      supportedLocales: const [Locale('fa', 'IR')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      home: s.booting
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : s.offlineBoot
              ? const OfflineView()
              : s.user == null
                  ? const LoginView()
                  : const ShellView(),
    );
  }
}

/// Shown when a saved session exists but the server cannot be reached at start.
class OfflineView extends StatelessWidget {
  const OfflineView({super.key});

  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.wifi_off_rounded, size: 64, color: gp.danger),
            const SizedBox(height: 16),
            const Text('اتصال برقرار نیست', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text('اینترنت گوشی را بررسی کنید. به محض برقراری اتصال، برنامه خودکار دوباره تلاش می‌کند.',
                textAlign: TextAlign.center, style: TextStyle(color: gp.muted)),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: () => context.read<SessionViewModel>().boot(),
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('تلاش دوباره'),
            ),
          ]),
        ),
      ),
    );
  }
}
