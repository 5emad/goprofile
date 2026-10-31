import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme.dart';
import '../../domain/dates.dart';
import '../viewmodels/session_vm.dart';
import '../widgets/common.dart';
import 'boards_view.dart';
import 'dashboard_view.dart';
import 'report_view.dart';
import 'settings_view.dart';
import 'task_sheet.dart';
import 'timer_view.dart';

class _Dest {
  const _Dest(this.icon, this.selected, this.label);
  final IconData icon;
  final IconData selected;
  final String label;
}

const _dests = [
  _Dest(Icons.home_outlined, Icons.home_rounded, 'خانه'),
  _Dest(Icons.view_kanban_outlined, Icons.view_kanban_rounded, 'کارتابل‌ها'),
  _Dest(Icons.timer_outlined, Icons.timer_rounded, 'تایمر'),
  _Dest(Icons.bar_chart_outlined, Icons.bar_chart_rounded, 'گزارش‌ها'),
  _Dest(Icons.settings_outlined, Icons.settings_rounded, 'تنظیمات'),
  _Dest(Icons.person_outline_rounded, Icons.person_rounded, 'پروفایل'),
];

class ShellView extends StatefulWidget {
  const ShellView({super.key});
  @override
  State<ShellView> createState() => _ShellViewState();
}

class _ShellViewState extends State<ShellView> {
  int index = 0;

  void go(int i) => setState(() => index = i);

  Widget page() => switch (index) {
        0 => const DashboardView(),
        1 => const BoardsView(),
        2 => const TimerView(),
        3 => const ReportView(),
        4 => const SettingsView(),
        _ => const ProfileView(),
      };

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 860;
    final body = Column(children: [
      const _NetBanner(),
      const _UpdateBanner(),
      if (index != 2) _TimerBar(onOpen: () => go(2)),
      Expanded(child: AnimatedSwitcher(duration: const Duration(milliseconds: 250), child: KeyedSubtree(key: ValueKey(index), child: page()))),
    ]);
    final fab = index <= 1
        ? FloatingActionButton.extended(onPressed: () => showTaskCreate(context), icon: const Icon(Icons.add_task_rounded), label: const Text('تسک جدید'))
        : null;
    if (wide) {
      final user = context.watch<SessionViewModel>().user!;
      return Scaffold(
        floatingActionButton: fab,
        body: Row(children: [
          NavigationRail(
            extended: MediaQuery.sizeOf(context).width >= 1100,
            minExtendedWidth: 230,
            selectedIndex: index,
            onDestinationSelected: go,
            leading: Padding(
              padding: const EdgeInsets.symmetric(vertical: 18),
              child: GpLogo(size: 34, withText: MediaQuery.sizeOf(context).width >= 1100),
            ),
            trailing: Expanded(
              child: Align(
                alignment: Alignment.bottomCenter,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: CircleAvatar(
                    backgroundColor: context.gp.levels[2],
                    child: Text(user.name.characters.first, style: TextStyle(fontWeight: FontWeight.w800, color: Theme.of(context).colorScheme.primary)),
                  ),
                ),
              ),
            ),
            destinations: [for (final d in _dests) NavigationRailDestination(icon: Icon(d.icon), selectedIcon: Icon(d.selected), label: Text(d.label))],
          ),
          VerticalDivider(width: 1, color: context.gp.border),
          Expanded(child: body),
        ]),
      );
    }
    // Phones: profile lives in the settings tab's app bar to keep five tabs.
    return Scaffold(
      floatingActionButton: fab,
      body: SafeArea(child: body),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index > 4 ? 4 : index,
        onDestinationSelected: go,
        destinations: [for (final d in _dests.take(5)) NavigationDestination(icon: Icon(d.icon), selectedIcon: Icon(d.selected), label: d.label)],
      ),
    );
  }
}

class _NetBanner extends StatelessWidget {
  const _NetBanner();
  @override
  Widget build(BuildContext context) {
    final online = context.select<SessionViewModel, bool>((s) => s.online);
    return AnimatedSize(
      duration: const Duration(milliseconds: 200),
      child: online
          ? const SizedBox(width: double.infinity)
          : Container(
              width: double.infinity,
              color: context.gp.danger,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: const Row(children: [
                Icon(Icons.wifi_off_rounded, color: Colors.white, size: 18),
                SizedBox(width: 8),
                Expanded(child: Text('اتصال به اینترنت یا سرور برقرار نیست؛ تغییرات ذخیره نمی‌شوند.', style: TextStyle(color: Colors.white, fontSize: 12.5))),
              ]),
            ),
    );
  }
}

class _UpdateBanner extends StatelessWidget {
  const _UpdateBanner();
  @override
  Widget build(BuildContext context) {
    final u = context.select<SessionViewModel, Object?>((s) => s.update);
    if (u == null) return const SizedBox.shrink();
    final up = context.read<SessionViewModel>().update!;
    final cs = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
      decoration: BoxDecoration(color: context.gp.levels[1], borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        Icon(Icons.system_update_rounded, color: cs.primary, size: 20),
        const SizedBox(width: 8),
        Expanded(child: Text('نسخه ${up.version} آماده است. اطلاعات شما روی سرور است و با به‌روزرسانی از بین نمی‌رود.', style: const TextStyle(fontSize: 12.5))),
        TextButton(onPressed: () => launchUrl(up.url, mode: LaunchMode.externalApplication), child: const Text('دریافت')),
      ]),
    );
  }
}

class _TimerBar extends StatelessWidget {
  const _TimerBar({required this.onOpen});
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SessionViewModel>();
    final t = s.timer;
    final cs = Theme.of(context).colorScheme;
    return AnimatedSize(
      duration: const Duration(milliseconds: 250),
      child: t == null
          ? const SizedBox(width: double.infinity)
          : Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Material(
                color: cs.primary,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: onOpen,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    child: Row(children: [
                    Icon(Icons.fiber_manual_record, size: 12, color: context.gp.levels[3]),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text('${t.label(s.jira)}  ${t.taskTitle}', overflow: TextOverflow.ellipsis, style: TextStyle(color: cs.onPrimary)),
                    ),
                    Elapsed(
                      start: t.startedAt,
                      builder: (_, sec) => Text(fmtClock(sec),
                          textDirection: TextDirection.ltr, style: TextStyle(color: cs.onPrimary, fontSize: 18, fontWeight: FontWeight.w800)),
                    ),
                    const SizedBox(width: 12),
                    FilledButton.tonalIcon(
                      style: FilledButton.styleFrom(minimumSize: const Size(0, 34)),
                      onPressed: () => run(context, () => s.stopTimer(), ok: 'لاگ ثبت شد'),
                      icon: const Icon(Icons.stop_rounded, size: 16),
                        label: const Text('توقف'),
                      ),
                    ]),
                  ),
                ),
              ),
            ),
    );
  }
}
