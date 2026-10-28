import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme.dart';
import '../../domain/dates.dart';
import '../../domain/jalali.dart';
import '../viewmodels/screen_vms.dart';
import '../viewmodels/session_vm.dart';
import 'dashboard_view.dart';
import 'task_sheet.dart';

class ReportView extends StatelessWidget {
  const ReportView({super.key});

  @override
  Widget build(BuildContext context) {
    final jira = context.watch<SessionViewModel>().jira;
    return Reloading<ReportViewModel>(
      create: (d) => ReportViewModel(d.worklogs),
      builder: (context, vm) {
        final gp = context.gp;
        final maxDay = math.max(1, vm.days.fold(0, (m, d) => math.max(m, d.seconds)));
        final workDays = vm.days.where((d) => d.seconds > 0).length;
        Widget stat(String l, String v) => SizedBox(
              width: 200,
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(l, style: TextStyle(color: gp.muted, fontSize: 12.5)),
                    Text(v, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: gp.accent)),
                  ]),
                ),
              ),
            );
        return GpPage(
          title: 'گزارش هفتگی',
          sub: '${fmtDay(vm.week, year: true)} تا ${fmtDay(vm.end, year: true)}',
          actions: [
            IconButton(onPressed: () => vm.shift(-1), icon: const Icon(Icons.chevron_right), tooltip: 'هفته قبل'),
            OutlinedButton(onPressed: vm.isCurrent ? null : () => vm.shift(0), child: const Text('این هفته')),
            IconButton(onPressed: () => vm.shift(1), icon: const Icon(Icons.chevron_left), tooltip: 'هفته بعد'),
          ],
          children: [
            Wrap(spacing: 12, runSpacing: 12, children: [
              stat('جمع هفته', fmtDuration(vm.total, short: true)),
              stat('میانگین روز کاری', fmtDuration(workDays == 0 ? 0 : vm.total ~/ workDays, short: true)),
              stat('تعداد لاگ', '${vm.days.fold(0, (s, d) => s + d.logs.length)}'),
              stat('تسک‌های درگیر', '${vm.rows.length}'),
            ]),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Text('خط زمانی روزها (۰ تا ۲۴)', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 12),
                  for (final d in vm.days)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 5),
                      child: Row(children: [
                        SizedBox(
                          width: 92,
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(jWeekdays[weekday(d.key)], style: const TextStyle(fontWeight: FontWeight.w700)),
                            Text(fmtDay(d.key), style: TextStyle(color: gp.muted, fontSize: 11)),
                          ]),
                        ),
                        Expanded(
                          child: Directionality(
                            textDirection: TextDirection.ltr,
                            child: LayoutBuilder(builder: (c, box) {
                              return Container(
                                height: 26,
                                decoration: BoxDecoration(color: gp.surface2, border: Border.all(color: gp.border), borderRadius: BorderRadius.circular(8)),
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
                                            child: DecoratedBox(decoration: BoxDecoration(color: l.running ? gp.levels[2] : gp.levels[3], borderRadius: BorderRadius.circular(5))),
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
                          width: 92,
                          child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                            Text(d.seconds == 0 ? '—' : fmtDuration(d.seconds, short: true), style: const TextStyle(fontWeight: FontWeight.w700)),
                            if (d.logs.isNotEmpty)
                              Text('${fmtTime(d.logs.first.startedAt)}–${d.logs.last.endedAt == null ? 'now' : fmtTime(d.logs.last.endedAt!)}',
                                  textDirection: TextDirection.ltr, style: TextStyle(color: gp.muted, fontSize: 11)),
                            const SizedBox(height: 3),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(99),
                              child: LinearProgressIndicator(minHeight: 4, value: d.seconds / maxDay, color: gp.levels[3], backgroundColor: gp.levels[0]),
                            ),
                          ]),
                        ),
                      ]),
                    ),
                ]),
              ),
            ),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Text('جدول لاگ‌ها (تسک × روز)', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 12),
                  if (vm.rows.isEmpty)
                    Padding(padding: const EdgeInsets.all(20), child: Text('در این هفته لاگی ثبت نشده', textAlign: TextAlign.center, style: TextStyle(color: gp.muted)))
                  else
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: DataTable(
                        showCheckboxColumn: false,
                        headingTextStyle: TextStyle(color: gp.muted, fontWeight: FontWeight.w600, fontFamily: 'IRANYekanX'),
                        columns: [
                          const DataColumn(label: Text('تسک')),
                          for (final d in vm.days) DataColumn(label: Text('${jWeekdays[weekday(d.key)]}\n${fmtDay(d.key)}', style: const TextStyle(fontSize: 11))),
                          const DataColumn(label: Text('جمع')),
                        ],
                        rows: [
                          for (final r in vm.rows)
                            DataRow(
                              onSelectChanged: (_) => showTaskEditor(context, r.log.taskId),
                              cells: [
                                DataCell(Text('${r.log.label(jira)}  ${r.log.taskTitle}', overflow: TextOverflow.ellipsis)),
                                for (final s in r.perDay)
                                  DataCell(Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: s == 0 ? null : gp.levels[3].withValues(alpha: 0.15 + s / maxDay * 0.6),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(s == 0 ? '' : fmtDuration(s, short: true), style: const TextStyle(fontWeight: FontWeight.w600)),
                                  )),
                                DataCell(Text(fmtDuration(r.total, short: true), style: TextStyle(fontWeight: FontWeight.w800, color: gp.accent))),
                              ],
                            ),
                          DataRow(cells: [
                            const DataCell(Text('جمع روز', style: TextStyle(fontWeight: FontWeight.w700))),
                            for (final d in vm.days) DataCell(Text(d.seconds == 0 ? '—' : fmtDuration(d.seconds, short: true))),
                            DataCell(Text(fmtDuration(vm.total, short: true), style: TextStyle(fontWeight: FontWeight.w800, color: gp.accent))),
                          ]),
                        ],
                      ),
                    ),
                ]),
              ),
            ),
          ],
        );
      },
    );
  }
}
