import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';

import '../../core/theme.dart';
import '../../domain/dates.dart';
import '../../domain/entities.dart';
import '../../domain/jalali.dart';
import '../../domain/report.dart';
import '../report_pdf.dart';
import '../viewmodels/screen_vms.dart';
import '../viewmodels/session_vm.dart';
import '../widgets/common.dart';
import 'dashboard_view.dart';
import 'task_sheet.dart';

class ReportView extends StatelessWidget {
  const ReportView({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionViewModel>();
    final jira = session.jira;
    return Reloading<ReportViewModel>(
      create: (d) => ReportViewModel(d.worklogs, d.tasks, d.boards, session.user!.settings.dailyGoalMinutes * 60),
      builder: (context, vm) {
        final r = vm.report!;
        final g = vm.groups!;
        final gp = context.gp;
        final period = r.range.period;
        final dl = vm.prev == null ? null : delta(r.total, vm.prev!.total);

        Future<void> exportPdf() => run(context, () async {
              final bytes = await buildReportPdf(ReportPdfData(
                report: r,
                prev: vm.prev,
                prevName: vm.prevName,
                groups: g,
                notes: vm.notes,
                statuses: vm.statuses,
                user: session.user!,
                jira: jira,
                goalSeconds: vm.goalSeconds,
              ));
              await Printing.layoutPdf(onLayout: (_) async => bytes, name: 'goprofile-${period.name}-${r.range.from}.pdf');
            });

        return GpPage(
          title: 'گزارش کارکرد ${periodLabels[period]}',
          sub: r.range.label,
          actions: [
            SegmentedButton<Period>(
              showSelectedIcon: false,
              style: const ButtonStyle(visualDensity: VisualDensity.compact),
              segments: [for (final p in Period.values) ButtonSegment(value: p, label: Text(periodLabels[p]!))],
              selected: {period},
              onSelectionChanged: (s) => vm.setPeriod(s.first),
            ),
            Row(mainAxisSize: MainAxisSize.min, children: [
              IconButton(onPressed: () => vm.shift(-1), icon: const Icon(Icons.chevron_right), tooltip: 'بازه قبل'),
              OutlinedButton(onPressed: vm.isCurrent ? null : () => vm.shift(0), child: Text(currentLabels[period]!)),
              IconButton(onPressed: () => vm.shift(1), icon: const Icon(Icons.chevron_left), tooltip: 'بازه بعد'),
            ]),
            FilledButton.icon(onPressed: exportPdf, icon: const Icon(Icons.picture_as_pdf_outlined, size: 18), label: const Text('خروجی PDF')),
          ],
          children: [
            if (vm.loading) const LinearProgressIndicator(minHeight: 2),
            Wrap(spacing: 10, runSpacing: 10, children: [
              _Kpi('کل زمان کار', fmtDuration(r.total, short: true),
                  sub: dl == null ? 'بدون داده برای مقایسه' : '${dl >= 0 ? '▲' : '▼'} ${dl.abs()}٪ نسبت به ${vm.prevName}',
                  subColor: dl == null ? null : (dl >= 0 ? gp.accent : gp.danger)),
              if (period != Period.day) _Kpi('روزهای کاری', '${r.workDays} از ${r.elapsedDays}', sub: 'میانگین ${fmtDuration(r.avgPerWorkDay.round(), short: true)}'),
              if (period == Period.day)
                _Kpi('هدف روزانه', '${vm.goalSeconds == 0 ? 0 : (r.total / vm.goalSeconds * 100).round()}٪', sub: 'از ${fmtDuration(vm.goalSeconds, short: true)}'),
              _Kpi('تعداد لاگ', '${r.logs}', sub: '${r.tasks.length} تسک درگیر'),
              _Kpi('انجام‌شده', '${g.done.length}', sub: '${g.created.length} تسک جدید'),
              _Kpi('سررسید گذشته', '${g.overdue.length}', color: g.overdue.isEmpty ? null : gp.danger, sub: '${g.soon.length} نزدیک سررسید'),
            ]),
            SectionCard(
              title: 'تحلیل و جمع‌بندی',
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (final n in vm.notes)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Padding(padding: const EdgeInsets.only(top: 8, left: 8), child: CircleAvatar(radius: 3, backgroundColor: gp.levels[3])),
                      Expanded(child: Text(n, style: const TextStyle(height: 1.8))),
                    ]),
                  ),
              ]),
            ),
            SectionCard(
              title: period == Period.day ? 'کارکرد ساعت به ساعت' : period == Period.year ? 'کارکرد ماه به ماه' : 'کارکرد روز به روز',
              trailing: Text('ساعت', style: TextStyle(color: gp.muted, fontSize: 11.5)),
              child: _Bars(r, vm.goalSeconds, onPick: vm.openDay),
            ),
            if (period != Period.year) SectionCard(title: 'خط زمانی', child: _Timeline(r, jira: jira, onPick: vm.openDay)),
            SectionCard(
              title: 'توزیع زمان',
              child: Column(children: [
                for (final b in r.boards) _Share(b.key, b.value, r.total),
                const Divider(height: 20),
                _Share('ثبت با تایمر', r.timerSeconds, r.total),
                _Share('ثبت دستی', r.manualSeconds, r.total),
              ]),
            ),
            SectionCard(
              title: 'کارکرد به تفکیک تسک',
              trailing: Text('${r.tasks.length}'),
              child: r.tasks.isEmpty
                  ? Padding(padding: const EdgeInsets.all(16), child: Text('در این بازه لاگی ثبت نشده', textAlign: TextAlign.center, style: TextStyle(color: gp.muted)))
                  : Column(children: [
                      for (final t in r.tasks)
                        InkWell(
                          onTap: () => showTaskEditor(context, t.log.taskId),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: _Share('${t.log.label(jira)}  ${t.log.taskTitle}', t.seconds, r.total, sub: '${t.logs} لاگ'),
                          ),
                        ),
                    ]),
            ),
            _TaskGroup('سررسید گذشته', g.overdue, color: gp.danger, empty: 'کاری از سررسیدش عقب نیست.', statuses: vm.statuses),
            _TaskGroup('نزدیک به سررسید', g.soon, color: gp.warn, empty: 'کاری در روزهای آینده سررسید نمی‌شود.', statuses: vm.statuses),
            _TaskGroup('انجام‌شده در این بازه', g.done, color: gp.levels[3], empty: 'در این بازه تسکی انجام نشده.', statuses: vm.statuses, done: true),
            _TaskGroup('سایر کارهای باقی‌مانده', g.others, empty: 'کار باز دیگری نداری.', statuses: vm.statuses),
          ],
        );
      },
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi(this.label, this.value, {this.sub, this.color, this.subColor});
  final String label;
  final String value;
  final String? sub;
  final Color? color;
  final Color? subColor;

  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    final w = MediaQuery.sizeOf(context).width;
    return SizedBox(
      width: w < 600 ? (w - 42) / 2 : 190,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: TextStyle(color: gp.muted, fontSize: 12)),
            FittedBox(child: Text(value, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: color ?? gp.accent))),
            if (sub != null) Text(sub!, maxLines: 2, style: TextStyle(color: subColor ?? gp.muted, fontSize: 11, fontWeight: subColor == null ? null : FontWeight.w600)),
          ]),
        ),
      ),
    );
  }
}

class _Bars extends StatelessWidget {
  const _Bars(this.r, this.goal, {required this.onPick});
  final PeriodReport r;
  final int goal;
  final void Function(String) onPick;

  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    final daily = r.range.period == Period.week || r.range.period == Period.month;
    final top = math.max(1, [...r.buckets.map((b) => b.seconds), if (daily) goal].fold(0, math.max));
    const h = 160.0;
    final dense = r.buckets.length > 12;
    return Directionality(
      textDirection: r.range.period == Period.day ? TextDirection.ltr : TextDirection.rtl,
      child: Column(children: [
        SizedBox(
          height: h + 16,
          child: Stack(children: [
            if (daily && goal > 0)
              Positioned(
                left: 0,
                right: 0,
                bottom: h * goal / top,
                child: Container(height: 1.2, color: gp.warn),
              ),
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              for (final b in r.buckets)
                Expanded(
                  child: GestureDetector(
                    onTap: daily ? () => onPick(b.key) : null,
                    child: Tooltip(
                      message: fmtDuration(b.seconds),
                      child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                        if (b.seconds > 0 && !dense) Text(hoursLabel(b.seconds), style: TextStyle(fontSize: 9.5, color: gp.muted, fontWeight: FontWeight.w700)),
                        TweenAnimationBuilder<double>(
                          tween: Tween(begin: 0, end: b.seconds / top),
                          duration: const Duration(milliseconds: 500),
                          builder: (_, v, _) => Container(
                            height: math.max(2, h * v),
                            margin: EdgeInsets.symmetric(horizontal: dense ? 1 : 3),
                            decoration: BoxDecoration(
                              color: daily && goal > 0 && b.seconds >= goal ? gp.levels[4] : gp.levels[3],
                              borderRadius: const BorderRadius.vertical(top: Radius.circular(5)),
                            ),
                          ),
                        ),
                      ]),
                    ),
                  ),
                ),
            ]),
          ]),
        ),
        const SizedBox(height: 4),
        Row(children: [
          for (final (i, b) in r.buckets.indexed)
            Expanded(
              child: Text(dense && i % 2 == 1 ? '' : b.label,
                  textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.clip, style: TextStyle(fontSize: dense ? 8.5 : 10.5, color: gp.muted)),
            ),
        ]),
      ]),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline(this.r, {required this.jira, required this.onPick});
  final PeriodReport r;
  final bool jira;
  final void Function(String) onPick;

  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    final rows = r.range.period == Period.month ? r.days.where((d) => d.seconds > 0).toList() : r.days;
    if (rows.isEmpty) return Padding(padding: const EdgeInsets.all(16), child: Text('در این بازه لاگی ثبت نشده', textAlign: TextAlign.center, style: TextStyle(color: gp.muted)));
    return Column(children: [
      for (final d in rows)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(children: [
            InkWell(
              onTap: r.range.period == Period.day ? null : () => onPick(d.key),
              child: SizedBox(
                width: 76,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(jWeekdays[weekday(d.key)], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  Text(fmtDay(d.key), style: TextStyle(color: gp.muted, fontSize: 11)),
                ]),
              ),
            ),
            Expanded(
              child: Directionality(
                textDirection: TextDirection.ltr,
                child: LayoutBuilder(builder: (c, box) {
                  return Container(
                    height: 24,
                    decoration: BoxDecoration(color: gp.surface2, border: Border.all(color: gp.border), borderRadius: BorderRadius.circular(7)),
                    child: Stack(children: [
                      for (final l in d.logs)
                        Builder(builder: (_) {
                          final s = l.startedAt.toLocal();
                          final start = (s.hour * 60 + s.minute) / 1440;
                          final w = math.max(0.006, l.seconds / 86400);
                          return Positioned(
                            left: start * box.maxWidth,
                            width: math.min(w, 1 - start) * box.maxWidth,
                            top: 3,
                            bottom: 3,
                            child: Tooltip(
                              message: '${l.label(jira)} ${l.taskTitle}\n${fmtTime(l.startedAt)} – ${l.endedAt == null ? 'اکنون' : fmtTime(l.endedAt!)}',
                              child: InkWell(
                                onTap: () => showTaskEditor(context, l.taskId),
                                child: DecoratedBox(
                                    decoration: BoxDecoration(
                                        color: l.running ? gp.levels[2] : l.source == 'timer' ? gp.levels[3] : gp.levels[2], borderRadius: BorderRadius.circular(4))),
                              ),
                            ),
                          );
                        }),
                    ]),
                  );
                }),
              ),
            ),
            SizedBox(
              width: 66,
              child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(d.seconds == 0 ? '—' : fmtDuration(d.seconds, short: true), style: const TextStyle(fontWeight: FontWeight.w700)),
                if (d.first != null)
                  Text('${fmtTime(d.first!)}–${fmtTime(d.last!)}', textDirection: TextDirection.ltr, style: TextStyle(color: gp.muted, fontSize: 10)),
              ]),
            ),
          ]),
        ),
      Padding(
        padding: const EdgeInsets.only(right: 76, left: 66, top: 2),
        child: Directionality(
          textDirection: TextDirection.ltr,
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            for (final h in const ['00', '06', '12', '18', '24']) Text(h, style: TextStyle(fontSize: 10, color: gp.muted)),
          ]),
        ),
      ),
    ]);
  }
}

class _Share extends StatelessWidget {
  const _Share(this.label, this.seconds, this.total, {this.sub});
  final String label;
  final int seconds;
  final int total;
  final String? sub;

  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    final p = total == 0 ? 0.0 : seconds / total;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text(label, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13))),
          if (sub != null) Text('$sub  ', style: TextStyle(color: gp.muted, fontSize: 11)),
          Text(fmtDuration(seconds, short: true), style: const TextStyle(fontWeight: FontWeight.w700)),
          SizedBox(width: 44, child: Text('${(p * 100).round()}٪', textAlign: TextAlign.end, style: TextStyle(color: gp.muted, fontSize: 11.5))),
        ]),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(99),
          child: LinearProgressIndicator(minHeight: 6, value: p, color: gp.levels[3], backgroundColor: gp.levels[0]),
        ),
      ]),
    );
  }
}

class _TaskGroup extends StatelessWidget {
  const _TaskGroup(this.title, this.tasks, {this.color, required this.empty, required this.statuses, this.done = false});
  final String title;
  final List<Task> tasks;
  final Color? color;
  final String empty;
  final Map<int, Meta> statuses;
  final bool done;

  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    final jira = context.watch<SessionViewModel>().jira;
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: color ?? gp.border, width: color == null ? 1 : 1.4)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text(title, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: color == gp.levels[3] ? null : color))),
            Text('${tasks.length}', style: TextStyle(color: gp.muted)),
          ]),
          const SizedBox(height: 6),
          if (tasks.isEmpty) Text(empty, style: TextStyle(color: gp.muted, fontSize: 12.5)),
          for (final t in tasks)
            ListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              onTap: () => showTaskEditor(context, t.id),
              title: Text(t.title, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  KeyChip(t.label(jira)),
                  Text('${t.boardName} · ${(t.statusId != null ? statuses[t.statusId]?.name : null) ?? '—'} · ${fmtDuration(t.loggedSeconds, short: true)}',
                      style: TextStyle(color: gp.muted, fontSize: 11.5)),
                  if (done && t.doneAt != null) Text('انجام: ${fmtDay(dayKey(t.doneAt!), year: true)}', style: TextStyle(color: gp.muted, fontSize: 11.5)),
                  if (!done) DueChip(t, always: true),
                ]),
              ),
            ),
        ]),
      ),
    );
  }
}
