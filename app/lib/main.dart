import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'core/theme.dart';
import 'di.dart';
import 'presentation/viewmodels/session_vm.dart';
import 'presentation/views/login_view.dart';
import 'presentation/views/shell_view.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final deps = Deps.create();
  final session = SessionViewModel(deps.auth, deps.worklogs);
  deps.api.onUnauthorized = session.signedOut;
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
          : s.user == null
              ? const LoginView()
              : const ShellView(),
    );
  }
}
