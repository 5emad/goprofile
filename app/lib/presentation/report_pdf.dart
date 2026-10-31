// Printable A4 work report (RTL, Persian font embedded).
import 'dart:typed_data';

import 'package:flutter/services.dart' show rootBundle;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../domain/dates.dart';
import '../domain/entities.dart';
import '../domain/jalali.dart';
import '../domain/report.dart';

const _ink = PdfColor.fromInt(0xFF1B2114);
const _muted = PdfColor.fromInt(0xFF5A6050);
const _line = PdfColor.fromInt(0xFFCFD3C4);
const _soft = PdfColor.fromInt(0xFFF3F5EE);
const _bar = PdfColor.fromInt(0xFF7F9D58);
const _barHit = PdfColor.fromInt(0xFF3D5426);
const _danger = PdfColor.fromInt(0xFFB3261E);
const _warn = PdfColor.fromInt(0xFFB35C00);

class ReportPdfData {
  ReportPdfData({
    required this.report,
    required this.prev,
    required this.prevName,
    required this.groups,
    required this.notes,
    required this.statuses,
    required this.user,
    required this.jira,
    required this.goalSeconds,
  });
  final PeriodReport report;
  final PeriodReport? prev;
  final String prevName;
  final TaskGroups groups;
  final List<String> notes;
  final Map<int, Meta> statuses;
  final User user;
  final bool jira;
  final int goalSeconds;
}

Future<Uint8List> buildReportPdf(ReportPdfData d) async {
  final regular = pw.Font.ttf(await rootBundle.load('assets/fonts/IRANYekanXFaNum-Regular.ttf'));
  final bold = pw.Font.ttf(await rootBundle.load('assets/fonts/IRANYekanXFaNum-Bold.ttf'));
  final r = d.report;
  final today = dayKey(DateTime.now());
  final period = periodLabels[r.range.period]!;
  final doc = pw.Document(title: 'گزارش کارکرد $period - ${r.range.label}', author: d.user.name, creator: 'goprofile');

  pw.Widget h2(String s, {PdfColor color = _ink}) =>
      pw.Padding(padding: const pw.EdgeInsets.only(top: 12, bottom: 6), child: pw.Text(s, style: pw.TextStyle(font: bold, fontSize: 12.5, color: color)));

  pw.Widget table(List<String> head, List<List<String>> rows, {List<PdfColor?>? rowColors, Map<int, pw.TableColumnWidth>? widths}) => pw.TableHelper.fromTextArray(
        headers: head,
        data: rows,
        border: const pw.TableBorder(horizontalInside: pw.BorderSide(color: _line, width: 0.5), bottom: pw.BorderSide(color: _line, width: 0.5)),
        headerStyle: pw.TextStyle(font: bold, fontSize: 8.5, color: _muted),
        headerDecoration: const pw.BoxDecoration(color: _soft),
        cellStyle: const pw.TextStyle(fontSize: 8.5, color: _ink),
        cellAlignment: pw.Alignment.centerRight,
        headerAlignment: pw.Alignment.centerRight,
        cellPadding: const pw.EdgeInsets.symmetric(horizontal: 5, vertical: 4),
        columnWidths: widths,
        cellDecoration: rowColors == null
            ? null
            : (col, data, row) => col == 0 && row > 0 && rowColors[row - 1] != null
                ? pw.BoxDecoration(border: pw.Border(right: pw.BorderSide(color: rowColors[row - 1]!, width: 3)))
                : const pw.BoxDecoration(),
      );

  pw.Widget kpi(String label, String value, [String? sub, PdfColor color = _barHit]) => pw.Expanded(
        child: pw.Container(
          margin: const pw.EdgeInsets.all(3),
          padding: const pw.EdgeInsets.all(8),
          decoration: pw.BoxDecoration(border: pw.Border.all(color: _line, width: 0.6), borderRadius: pw.BorderRadius.circular(6)),
          child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text(label, style: const pw.TextStyle(fontSize: 8.5, color: _muted)),
            pw.Text(value, style: pw.TextStyle(font: bold, fontSize: 15, color: color)),
            if (sub != null) pw.Text(sub, style: const pw.TextStyle(fontSize: 7.5, color: _muted)),
          ]),
        ),
      );

  final dl = d.prev == null ? null : delta(r.total, d.prev!.total);
  String deltaText(int? v) => v == null ? 'بدون داده برای مقایسه' : '${v >= 0 ? '+' : '−'}${v.abs()}٪ نسبت به ${d.prevName}';
  String label(Task t) => d.jira && t.jiraKey.isNotEmpty ? t.jiraKey : t.key;
  String logLabel(Worklog l) => l.label(d.jira);

  pw.Widget bars() {
    final daily = r.range.period == Period.week || r.range.period == Period.month;
    final maxV = [...r.buckets.map((b) => b.seconds), if (daily) d.goalSeconds, 1].reduce((a, b) => a > b ? a : b);
    const h = 110.0;
    return pw.Container(
      height: h + 30,
      child: pw.Stack(children: [
        if (daily && d.goalSeconds > 0)
          pw.Positioned(
            left: 0,
            right: 0,
            bottom: 16 + h * d.goalSeconds / maxV,
            child: pw.Container(height: 0.8, color: _warn),
          ),
        pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.end,
          children: [
            for (final b in r.buckets)
              pw.Expanded(
                child: pw.Column(mainAxisAlignment: pw.MainAxisAlignment.end, children: [
                  if (b.seconds > 0 && r.buckets.length <= 24) pw.Text(hoursLabel(b.seconds), style: const pw.TextStyle(fontSize: 6.5, color: _muted)),
                  pw.Container(
                    height: b.seconds == 0 ? 0.6 : h * b.seconds / maxV,
                    margin: const pw.EdgeInsets.symmetric(horizontal: 1),
                    color: daily && d.goalSeconds > 0 && b.seconds >= d.goalSeconds ? _barHit : _bar,
                  ),
                  pw.SizedBox(height: 3),
                  pw.Text(b.label, style: const pw.TextStyle(fontSize: 6.5, color: _muted), maxLines: 1),
                ]),
              ),
          ],
        ),
      ]),
    );
  }

  pw.Widget timeline() {
    final rows = r.days.where((x) => x.seconds > 0 || r.range.period != Period.month).toList();
    return pw.Column(children: [
      for (final day in rows)
        pw.Padding(
          padding: const pw.EdgeInsets.symmetric(vertical: 2),
          child: pw.Row(children: [
            pw.SizedBox(width: 70, child: pw.Text('${jWeekdays[weekday(day.key)]} ${fmtDay(day.key)}', style: const pw.TextStyle(fontSize: 8))),
            pw.Expanded(
              child: pw.LayoutBuilder(builder: (ctx, box) {
                final w = box!.maxWidth;
                return pw.Container(
                  height: 11,
                  decoration: pw.BoxDecoration(color: _soft, border: pw.Border.all(color: _line, width: 0.4)),
                  child: pw.Stack(children: [
                    for (final l in day.logs)
                      pw.Positioned(
                        // Time runs left to right like the hour scale.
                        left: w * ((l.startedAt.toLocal().hour * 60 + l.startedAt.toLocal().minute) / 1440),
                        top: 1.5,
                        child: pw.Container(width: (w * l.seconds / 86400).clamp(0.8, w), height: 8, color: l.source == 'timer' ? _bar : const PdfColor.fromInt(0xFFB9CC9A)),
                      ),
                  ]),
                );
              }),
            ),
            pw.SizedBox(
              width: 70,
              child: pw.Text(day.seconds == 0 ? '—' : '${fmtDuration(day.seconds, short: true)}  ${fmtTime(day.first!)}–${fmtTime(day.last!)}',
                  textAlign: pw.TextAlign.left, style: const pw.TextStyle(fontSize: 7.5)),
            ),
          ]),
        ),
      pw.Row(children: [
        pw.SizedBox(width: 70),
        pw.Expanded(
          child: pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
            for (final hh in const ['00', '06', '12', '18', '24']) pw.Text(hh, style: const pw.TextStyle(fontSize: 6.5, color: _muted)),
          ]),
        ),
        pw.SizedBox(width: 70),
      ]),
    ]);
  }

  List<String> taskRow(Task t, {bool done = false}) {
    final s = dueState(t, today);
    return [
      label(t),
      t.title,
      t.boardName,
      (t.statusId != null ? d.statuses[t.statusId]?.name : null) ?? '—',
      priorities[t.priority],
      done
          ? (t.doneAt != null ? fmtDay(dayKey(t.doneAt!), year: true) : '—')
          : t.dueOn == null
              ? '—'
              : '${fmtDay(t.dueOn!, year: true)}${s != null && s != DueState.later ? ' (${dueLabel(t, today)})' : ''}',
      fmtDuration(t.loggedSeconds, short: true),
    ];
  }

  final taskHead = ['کلید', 'عنوان', 'کارتابل', 'وضعیت', 'اولویت', 'سررسید', 'زمان'];
  const taskWidths = {1: pw.FlexColumnWidth(3), 5: pw.FlexColumnWidth(1.6)};
  final worked = r.days.expand((x) => x.logs).toList();

  doc.addPage(pw.MultiPage(
    pageTheme: pw.PageTheme(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(30, 30, 30, 34),
      textDirection: pw.TextDirection.rtl,
      theme: pw.ThemeData.withFont(base: regular, bold: bold),
    ),
    header: (ctx) => ctx.pageNumber == 1
        ? pw.SizedBox()
        : pw.Container(
            padding: const pw.EdgeInsets.only(bottom: 6),
            margin: const pw.EdgeInsets.only(bottom: 6),
            decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: _line, width: 0.5))),
            child: pw.Text('گزارش کارکرد $period · ${r.range.label} · ${d.user.name}', style: const pw.TextStyle(fontSize: 8, color: _muted)),
          ),
    footer: (ctx) => pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
      pw.Text('goprofile', style: const pw.TextStyle(fontSize: 7.5, color: _muted)),
      pw.Text('صفحه ${ctx.pageNumber} از ${ctx.pagesCount}', style: const pw.TextStyle(fontSize: 7.5, color: _muted)),
    ]),
    build: (ctx) => [
      pw.Container(
        padding: const pw.EdgeInsets.only(bottom: 8),
        decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: _barHit, width: 1.5))),
        child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
          pw.Expanded(
            child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
              pw.Text('goprofile', style: pw.TextStyle(font: bold, fontSize: 9, color: _barHit)),
              pw.Text('گزارش کارکرد $period', style: pw.TextStyle(font: bold, fontSize: 18)),
              pw.Text('${r.range.label} (از ${fmtDay(r.range.from, year: true)} تا ${fmtDay(r.range.to, year: true)})', style: const pw.TextStyle(fontSize: 9.5, color: _muted)),
            ]),
          ),
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
            pw.Text(d.user.name, style: pw.TextStyle(font: bold, fontSize: 11)),
            pw.Text(d.user.email, textDirection: pw.TextDirection.ltr, style: const pw.TextStyle(fontSize: 8, color: _muted)),
            pw.Text('تهیه‌شده در ${fmtDayLong(today)} ساعت ${fmtTime(DateTime.now())}', style: const pw.TextStyle(fontSize: 8, color: _muted)),
          ]),
        ]),
      ),
      pw.SizedBox(height: 8),
      pw.Row(children: [
        kpi('کل زمان کار', fmtDuration(r.total, short: true), deltaText(dl)),
        if (r.range.period != Period.day) kpi('روزهای کاری', '${r.workDays} از ${r.elapsedDays}', 'میانگین ${fmtDuration(r.avgPerWorkDay.round(), short: true)}'),
        kpi('تعداد لاگ', '${r.logs}', '${r.tasks.length} تسک درگیر'),
      ]),
      pw.Row(children: [
        kpi('تسک‌های انجام‌شده', '${d.groups.done.length}', '${d.groups.created.length} تسک جدید'),
        kpi('سررسید گذشته', '${d.groups.overdue.length}', null, d.groups.overdue.isEmpty ? _barHit : _danger),
        kpi('نزدیک سررسید', '${d.groups.soon.length}', 'تا $soonDays روز آینده', d.groups.soon.isEmpty ? _barHit : _warn),
      ]),
      h2('تحلیل و جمع‌بندی'),
      for (final n in d.notes)
        pw.Padding(
          padding: const pw.EdgeInsets.only(bottom: 3),
          child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Container(width: 4, height: 4, margin: const pw.EdgeInsets.only(top: 5, left: 6), decoration: const pw.BoxDecoration(color: _bar, shape: pw.BoxShape.circle)),
            pw.Expanded(child: pw.Text(n, style: const pw.TextStyle(fontSize: 9.5, lineSpacing: 2))),
          ]),
        ),
      h2(r.range.period == Period.day ? 'کارکرد ساعت به ساعت' : r.range.period == Period.year ? 'کارکرد ماه به ماه' : 'کارکرد روز به روز'),
      bars(),
      if (r.range.period != Period.year && r.total > 0) ...[h2('خط زمانی'), timeline()],
      if (r.boards.isNotEmpty) ...[
        h2('توزیع زمان'),
        table(
          ['بخش', 'زمان', 'سهم'],
          [
            for (final b in r.boards) ['کارتابل ${b.key}', fmtDuration(b.value, short: true), '${(b.value / r.total * 100).round()}٪'],
            ['ثبت با تایمر', fmtDuration(r.timerSeconds, short: true), '${(r.timerSeconds / r.total * 100).round()}٪'],
            ['ثبت دستی', fmtDuration(r.manualSeconds, short: true), '${(r.manualSeconds / r.total * 100).round()}٪'],
          ],
        ),
      ],
      if (r.tasks.isNotEmpty) ...[
        h2('کارکرد به تفکیک تسک'),
        table(
          ['کلید', 'عنوان', 'کارتابل', 'تعداد لاگ', 'زمان', 'سهم'],
          [
            for (final t in r.tasks)
              [logLabel(t.log), t.log.taskTitle, t.log.boardName, '${t.logs}', fmtDuration(t.seconds, short: true), '${(t.seconds / r.total * 100).round()}٪'],
            ['', 'جمع', '', '${r.logs}', fmtDuration(r.total, short: true), '۱۰۰٪'],
          ],
          widths: {1: const pw.FlexColumnWidth(3)},
        ),
      ],
      h2('سررسید گذشته (${d.groups.overdue.length})', color: _danger),
      d.groups.overdue.isEmpty
          ? pw.Text('کاری از سررسیدش عقب نیست.', style: const pw.TextStyle(fontSize: 9, color: _muted))
          : table(taskHead, d.groups.overdue.map(taskRow).toList(), rowColors: List.filled(d.groups.overdue.length, _danger), widths: taskWidths),
      h2('نزدیک به سررسید (${d.groups.soon.length})', color: _warn),
      d.groups.soon.isEmpty
          ? pw.Text('کاری در روزهای آینده سررسید نمی‌شود.', style: const pw.TextStyle(fontSize: 9, color: _muted))
          : table(taskHead, d.groups.soon.map(taskRow).toList(), rowColors: List.filled(d.groups.soon.length, _warn), widths: taskWidths),
      h2('انجام‌شده در این بازه (${d.groups.done.length})'),
      d.groups.done.isEmpty
          ? pw.Text('در این بازه تسکی انجام نشده.', style: const pw.TextStyle(fontSize: 9, color: _muted))
          : table([...taskHead.take(5), 'تاریخ انجام', 'زمان'], d.groups.done.map((t) => taskRow(t, done: true)).toList(), widths: taskWidths),
      h2('سایر کارهای باقی‌مانده (${d.groups.others.length})'),
      d.groups.others.isEmpty
          ? pw.Text('کار باز دیگری نیست.', style: const pw.TextStyle(fontSize: 9, color: _muted))
          : table(taskHead, d.groups.others.map(taskRow).toList(), widths: taskWidths),
      if (r.range.period != Period.year && worked.isNotEmpty) ...[
        h2('ریز لاگ‌ها'),
        table(
          [if (r.range.period != Period.day) 'تاریخ', 'شروع', 'پایان', 'مدت', 'تسک', 'نوع', 'توضیح'],
          [
            for (final l in worked)
              [
                if (r.range.period != Period.day) fmtDayLong(dayKey(l.startedAt)),
                fmtTime(l.startedAt),
                l.endedAt == null ? 'اکنون' : fmtTime(l.endedAt!),
                fmtDuration(l.seconds, short: true),
                '${logLabel(l)} ${l.taskTitle}',
                l.source == 'timer' ? 'تایمر' : 'دستی',
                l.note.isEmpty ? '—' : l.note,
              ],
          ],
        ),
      ],
    ],
  ));
  return doc.save();
}
