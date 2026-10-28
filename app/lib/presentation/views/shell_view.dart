import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme.dart';
import '../../domain/dates.dart';
import '../viewmodels/session_vm.dart';
import '../widgets/common.dart';
import 'boards_view.dart';
import 'dashboard_view.dart';
import 'report_view.dart';
import 'settings_view.dart';
import 'task_sheet.dart';

class _Dest {
  const _Dest(this.icon, this.label);
  final IconData icon;
  final String label;
}

const _dests = [
  _Dest(Icons.space_dashboard_outlined, 'داشبورد'),
  _Dest(Icons.view_kanban_outlined, 'کارتابل‌ها'),
  _Dest(Icons.add_task_rounded, 'ایجاد تسک'),
  _Dest(Icons.bar_chart_rounded, 'گزارش هفتگی'),
  _Dest(Icons.settings_outlined, 'تنظیمات'),
  _Dest(Icons.person_outline_rounded, 'پروفایل'),
];

class ShellView extends StatefulWidget {
  const ShellView({super.key});
  @override
  State<ShellView> createState() => _ShellViewState();
}

class _ShellViewState extends State<ShellView> {
  int index = 0;

  void go(int i) {
    if (i == 2) {
      showTaskCreate(context);
      return;
    }
    setState(() => index = i);
  }

  Widget page() => switch (index) {
        0 => const DashboardView(),
        1 => const BoardsView(),
        3 => const ReportView(),
        4 => const SettingsView(),
        _ => const ProfileView(),
      };

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 860;
    final body = Column(children: [
      const _TimerBar(),
      Expanded(child: AnimatedSwitcher(duration: const Duration(milliseconds: 250), child: KeyedSubtree(key: ValueKey(index), child: page()))),
    ]);
    if (wide) {
      final user = context.watch<SessionViewModel>().user!;
      return Scaffold(
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
            destinations: [for (final d in _dests) NavigationRailDestination(icon: Icon(d.icon), label: Text(d.label))],
          ),
          VerticalDivider(width: 1, color: context.gp.border),
          Expanded(child: body),
        ]),
      );
    }
    return Scaffold(
      body: SafeArea(child: body),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index > 4 ? 4 : index,
        onDestinationSelected: go,
        destinations: [for (final d in _dests.take(5)) NavigationDestination(icon: Icon(d.icon), label: d.label)],
      ),
    );
  }
}

class _TimerBar extends StatelessWidget {
  const _TimerBar();
  @override
  Widget build(BuildContext context) {
    final s = context.watch<SessionViewModel>();
    final t = s.timer;
    final cs = Theme.of(context).colorScheme;
    return AnimatedSize(
      duration: const Duration(milliseconds: 250),
      child: t == null
          ? const SizedBox(width: double.infinity)
          : Container(
              margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(color: cs.primary, borderRadius: BorderRadius.circular(14)),
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
                  label: const Text('توقف و ثبت'),
                ),
              ]),
            ),
    );
  }
}
