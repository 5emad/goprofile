import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme.dart';
import '../../di.dart';
import '../../domain/activity.dart';
import '../../domain/dates.dart';
import '../../domain/jalali.dart';
import '../viewmodels/screen_vms.dart';
import '../viewmodels/session_vm.dart';
import '../widgets/activity.dart';
import '../widgets/charts.dart';
import '../widgets/common.dart';
import 'task_sheet.dart';

/// Rebuilds the view model whenever the session version changes.
class Reloading<T extends LoadableViewModel> extends StatefulWidget {
  const Reloading({super.key, required this.create, required this.builder});
  final T Function(Deps) create;
  final Widget Function(BuildContext, T) builder;
  @override
  State<Reloading<T>> createState() => _ReloadingState<T>();
}

class _ReloadingState<T extends LoadableViewModel> extends State<Reloading<T>> {
  late final T vm = widget.create(context.read<Deps>())..load();
  int? _version;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final v = context.watch<SessionViewModel>().version;
    if (_version != null && _version != v) vm.load();
    _version = v;
  }

  @override
  void dispose() {
    vm.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ChangeNotifierProvider<T>.value(
        value: vm,
        child: Consumer<T>(builder: (c, vm, _) {
          if (vm.error != null && vm.loading == false && !_hasData(vm)) {
            return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(vm.error!, style: TextStyle(color: context.gp.danger)),
              TextButton(onPressed: vm.load, child: const Text('تلاش دوباره')),
            ]));
          }
          if (!_hasData(vm)) return const Center(child: CircularProgressIndicator());
          return widget.builder(c, vm);
        }),
      );

  bool _hasData(T vm) => switch (vm) {
        DashboardViewModel d => d.stats != null,
        BoardViewModel b => b.board != null,
        TaskEditorViewModel t => t.task != null,
        _ => !vm.loading || vm.error != null,
      };
}

class GpPage extends StatelessWidget {
  const GpPage({super.key, required this.title, this.sub, this.actions = const [], required this.children});
  final String title;
  final String? sub;
  final List<Widget> actions;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 40),
        children: [
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1180),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.end, runSpacing: 10, children: [
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                    if (sub != null) Text(sub!, style: TextStyle(color: context.gp.muted)),
                  ]),
                  Wrap(spacing: 8, children: actions),
                ]),
                const SizedBox(height: 18),
                for (final c in children) Padding(padding: const EdgeInsets.only(bottom: 14), child: c),
              ]),
            ),
          ),
        ],
      );
}

class DashboardView extends StatelessWidget {
  const DashboardView({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionViewModel>();
    final user = session.user!;
    return Reloading<DashboardViewModel>(
      create: (d) => DashboardViewModel(d.stats, d.tasks),
      builder: (context, vm) {
        final s = vm.stats!;
        final best = vm.months.reduce((a, b) => b.seconds > a.seconds ? b : a);
        final goal = user.settings.dailyGoalMinutes * 60;
        return Elapsed(
          start: session.timer?.startedAt,
          builder: (context, running) {
            final todaySec = vm.today.seconds + running;
            final width = MediaQuery.sizeOf(context).width;
            final cols = width > 1100 ? 4 : 2;
            return GpPage(
              title: 'سلام ${user.name} 👋',
              sub: fmtDayLong(s.today),
              children: [
                ActivityCard(grid: vm.grid, summary: vm.summary, from: s.from, today: s.today, name: user.name),
                GridView.count(
                  crossAxisCount: cols,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: cols == 4 ? 1.9 : 1.35,
                  children: [
                    CompareTile(title: 'زمان کار امروز', icon: Icons.schedule, c: Compare(todaySec, vm.yesterday.seconds), format: (v) => fmtDuration(v, short: true)),
                    CompareTile(title: 'تسک‌های انجام‌شده', icon: Icons.check_rounded, c: Compare(vm.today.done, vm.yesterday.done), format: (v) => '$v'),
                    CompareTile(title: 'تسک‌های جدید', icon: Icons.add, c: Compare(vm.today.created, vm.yesterday.created), format: (v) => '$v'),
                    _GoalTile(ratio: goal == 0 ? 0 : (todaySec / goal).clamp(0, 1).toDouble(), label: '${fmtDuration(todaySec, short: true)} از ${fmtDuration(goal, short: true)}'),
                  ],
                ),
                Flex(
                  direction: width > 1100 ? Axis.horizontal : Axis.vertical,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _flex(width > 1100, 13, SectionCard(
                      title: 'تحلیل ماهانه',
                      trailing: Text('ستون: ساعت کار · خط: تسک انجام‌شده', style: TextStyle(fontSize: 11.5, color: context.gp.muted)),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        MonthlyChart(vm.months),
                        const SizedBox(height: 6),
                        Text('پربازده‌ترین ماه: ${jMonths[best.month - 1]} با ${fmtDuration(best.seconds)}', style: TextStyle(color: context.gp.muted, fontSize: 12)),
                      ]),
                    )),
                    const SizedBox(width: 14, height: 14),
                    _flex(width > 1100, 10, SectionCard(title: 'دو هفته اخیر', child: DaysChart(vm.last14, goal))),
                  ],
                ),
                SectionCard(
                  title: 'کارهای باز',
                  trailing: Text('${vm.open.length}'),
                  child: vm.open.isEmpty
                      ? Padding(padding: const EdgeInsets.all(20), child: Text('کار بازی نداری 🎉', textAlign: TextAlign.center, style: TextStyle(color: context.gp.muted)))
                      : Column(children: [
                          for (final t in vm.open.take(8))
                            ListTile(
                              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                              onTap: () => showTaskEditor(context, t.id),
                              leading: KeyChip(t.label(session.jira)),
                              title: Text(t.title, overflow: TextOverflow.ellipsis),
                              subtitle: Text('${t.boardName} · ${fmtDuration(t.loggedSeconds, short: true)}', style: TextStyle(color: context.gp.muted, fontSize: 12)),
                              trailing: TimerButton(taskId: t.id),
                            ),
                        ]),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _flex(bool row, int flex, Widget child) => row ? Expanded(flex: flex, child: child) : child;
}

class _GoalTile extends StatelessWidget {
  const _GoalTile({required this.ratio, required this.label});
  final double ratio;
  final String label;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            SizedBox(
              width: 72,
              height: 72,
              child: Stack(fit: StackFit.expand, children: [
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: ratio),
                  duration: const Duration(milliseconds: 700),
                  builder: (_, v, _) => CircularProgressIndicator(
                    value: v,
                    strokeWidth: 8,
                    strokeCap: StrokeCap.round,
                    backgroundColor: context.gp.levels[0],
                    color: context.gp.levels[3],
                  ),
                ),
                Center(child: Text('${(ratio * 100).round()}٪', style: const TextStyle(fontWeight: FontWeight.w800))),
              ]),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('هدف روزانه', style: TextStyle(color: context.gp.muted, fontSize: 12.5)),
                Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
              ]),
            ),
          ]),
        ),
      );
}
