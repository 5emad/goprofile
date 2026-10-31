import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme.dart';
import '../../di.dart';
import '../../domain/activity.dart';
import '../../domain/dates.dart';
import '../../domain/jalali.dart';
import '../../domain/report.dart';
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
        ReportViewModel r => r.report != null,
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
      create: (d) => DashboardViewModel(d.stats, d.tasks, d.boards),
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
                if (vm.overdue.isNotEmpty || vm.soon.isNotEmpty)
                  SectionCard(
                    title: 'هشدار سررسید',
                    trailing: Text('قرمز: گذشته · نارنجی: تا $soonDays روز آینده', style: TextStyle(fontSize: 11, color: context.gp.muted)),
                    child: Column(children: [
                      for (final t in [...vm.overdue, ...vm.soon])
                        Container(
                          margin: const EdgeInsets.only(bottom: 6),
                          decoration: BoxDecoration(
                            border: BorderDirectional(start: BorderSide(color: dueColor(context, t)!, width: 3)),
                            color: dueColor(context, t)!.withValues(alpha: 0.06),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: ListTile(
                            dense: true,
                            onTap: () => showTaskEditor(context, t.id),
                            title: Text(t.title, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                            subtitle: Padding(
                              padding: const EdgeInsets.only(top: 3),
                              child: Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [KeyChip(t.label(session.jira)), DueChip(t)]),
                            ),
                            trailing: TimerButton(taskId: t.id),
                          ),
                        ),
                    ]),
                  ),
                _StatusOverview(vm),
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
                              title: Row(children: [Flexible(child: Text(t.title, overflow: TextOverflow.ellipsis)), const SizedBox(width: 6), DueChip(t)]),
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

const _statusColors = [Color(0xFFC3CDB0), Color(0xFFE2B15B), Color(0xFF6F9FB0), Color(0xFFA98BC4), Color(0xFFD98B6A), Color(0xFF8FB3A0)];

/// Task counts per status for every board, with overall totals.
class _StatusOverview extends StatelessWidget {
  const _StatusOverview(this.vm);
  final DashboardViewModel vm;

  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    final week = rangeOf(Period.week, dayKey(DateTime.now()));
    final doneWeek = vm.tasks.where((t) => t.doneAt != null && week.contains(dayKey(t.doneAt!))).length;
    Widget total(String label, int n, Color? c) => Expanded(
          child: Container(
            margin: const EdgeInsets.all(4),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: gp.surface2, border: Border.all(color: gp.border), borderRadius: BorderRadius.circular(12)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('$n', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: c)),
              Text(label, style: TextStyle(color: gp.muted, fontSize: 11.5)),
            ]),
          ),
        );
    return SectionCard(
      title: 'وضعیت کارها',
      trailing: Text('${vm.tasks.length} تسک', style: TextStyle(color: gp.muted, fontSize: 12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [total('کار باز', vm.open.length, null), total('سررسید گذشته', vm.overdue.length, gp.danger)]),
        Row(children: [total('نزدیک سررسید', vm.soon.length, gp.warn), total('انجام‌شده این هفته', doneWeek, gp.accent)]),
        const SizedBox(height: 10),
        for (final b in vm.boards.where((b) => b.taskCount > 0))
          Builder(builder: (context) {
            final mine = vm.tasks.where((t) => t.boardId == b.id).toList();
            var n = 0;
            final parts = [
              for (final s in b.statuses)
                (s, mine.where((t) => t.statusId == s.id).length, s.isDone ? gp.levels[4] : _statusColors[n++ % _statusColors.length]),
            ];
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(child: Text(b.name, style: const TextStyle(fontWeight: FontWeight.w700))),
                  Text('${b.openCount} باز از ${b.taskCount}', style: TextStyle(color: gp.muted, fontSize: 12)),
                ]),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: SizedBox(
                    height: 12,
                    child: Row(children: [
                      for (final p in parts.where((p) => p.$2 > 0)) Expanded(flex: p.$2, child: Container(color: p.$3)),
                      if (mine.isEmpty) Expanded(child: Container(color: gp.levels[0])),
                    ]),
                  ),
                ),
                const SizedBox(height: 6),
                Wrap(spacing: 12, runSpacing: 4, children: [
                  for (final p in parts)
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      Container(width: 9, height: 9, decoration: BoxDecoration(color: p.$3, borderRadius: BorderRadius.circular(3))),
                      const SizedBox(width: 4),
                      Text('${p.$1.name} ${p.$2}', style: TextStyle(fontSize: 11.5, color: gp.muted)),
                    ]),
                ]),
              ]),
            );
          }),
      ]),
    );
  }
}

