import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../domain/activity.dart';
import '../../domain/dates.dart';
import '../../domain/entities.dart';
import '../../domain/jalali.dart';

double _nice(double v) {
  if (v <= 0) return 1;
  final p = math.pow(10, (math.log(v) / math.ln10).floor()).toDouble();
  for (final m in [1, 2, 2.5, 5, 10]) {
    if (m * p >= v) return m * p;
  }
  return 10 * p;
}

void _text(Canvas c, String s, Offset at, Color color, {TextAlign align = TextAlign.center}) {
  final tp = TextPainter(
      text: TextSpan(text: s, style: TextStyle(fontSize: 10.5, color: color, fontFamily: 'IRANYekanX')), textDirection: TextDirection.rtl)
    ..layout();
  final dx = align == TextAlign.center ? -tp.width / 2 : (align == TextAlign.right ? -tp.width : 0.0);
  tp.paint(c, at + Offset(dx, -tp.height / 2));
}

/// Bars for hours per month with a line for done tasks.
class MonthlyChart extends StatelessWidget {
  const MonthlyChart(this.months, {super.key});
  final List<MonthBucket> months;
  @override
  Widget build(BuildContext context) => AspectRatio(
        aspectRatio: 640 / 220,
        child: CustomPaint(painter: _MonthlyPainter(months, context.gp, Theme.of(context).colorScheme.primary)),
      );
}

class _MonthlyPainter extends CustomPainter {
  _MonthlyPainter(this.months, this.gp, this.primary);
  final List<MonthBucket> months;
  final GpColors gp;
  final Color primary;

  @override
  void paint(Canvas c, Size s) {
    const l = 34.0, r = 34.0, t = 14.0, b = 28.0;
    final iw = s.width - l - r, ih = s.height - t - b;
    final hours = months.map((m) => m.seconds / 3600).toList();
    final maxH = _nice(hours.fold(0.0, math.max));
    final maxD = _nice(months.map((m) => m.done.toDouble()).fold(0.0, math.max));
    final bw = iw / months.length;
    final grid = Paint()
      ..color = gp.border
      ..strokeWidth = 1;
    for (final f in [0.0, 0.5, 1.0]) {
      final y = t + ih - f * ih;
      c.drawLine(Offset(l, y), Offset(s.width - r, y), grid);
      _text(c, (f * maxH).toStringAsFixed(f * maxH < 10 && f > 0 ? 1 : 0), Offset(l - 6, y), gp.muted, align: TextAlign.right);
      _text(c, '${(f * maxD).round()}', Offset(s.width - r + 6, y), gp.muted, align: TextAlign.left);
    }
    final pts = <Offset>[];
    for (var i = 0; i < months.length; i++) {
      final h = hours[i] / maxH * ih;
      final x = l + bw * i;
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x + bw * 0.2, t + ih - h, bw * 0.6, math.max(h, 0.5)), const Radius.circular(4)),
          Paint()..color = i == months.length - 1 ? gp.levels[4] : gp.levels[2]);
      _text(c, jMonths[months[i].month - 1], Offset(x + bw / 2, s.height - 10), gp.muted);
      pts.add(Offset(x + bw / 2, t + ih - months[i].done / maxD * ih));
    }
    c.drawPath(
        Path()..addPolygon(pts, false),
        Paint()
          ..color = primary.withValues(alpha: 0.7)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.6);
    for (final p in pts) {
      c.drawCircle(p, 3.5, Paint()..color = gp.surface2);
      c.drawCircle(
          p,
          3.5,
          Paint()
            ..color = primary
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.8);
    }
  }

  @override
  bool shouldRepaint(_MonthlyPainter o) => o.months != months;
}

class DaysChart extends StatelessWidget {
  const DaysChart(this.days, this.goalSeconds, {super.key});
  final List<DayStat> days;
  final int goalSeconds;
  @override
  Widget build(BuildContext context) =>
      AspectRatio(aspectRatio: 640 / 180, child: CustomPaint(painter: _DaysPainter(days, goalSeconds, context.gp)));
}

class _DaysPainter extends CustomPainter {
  _DaysPainter(this.days, this.goal, this.gp);
  final List<DayStat> days;
  final int goal;
  final GpColors gp;

  @override
  void paint(Canvas c, Size s) {
    const l = 30.0, r = 8.0, t = 10.0, b = 26.0;
    final iw = s.width - l - r, ih = s.height - t - b;
    final max = _nice(math.max(goal, days.map((d) => d.seconds).fold(0, math.max)) / 3600);
    double y(int sec) => t + ih - sec / 3600 / max * ih;
    final bw = iw / days.length;
    for (final f in [0.0, 0.5, 1.0]) {
      final yy = t + ih - f * ih;
      c.drawLine(Offset(l, yy), Offset(s.width - r, yy), Paint()..color = gp.border);
      _text(c, (f * max).toStringAsFixed(0), Offset(l - 6, yy), gp.muted, align: TextAlign.right);
    }
    if (goal > 0) {
      final gy = y(goal);
      for (var x = l; x < s.width - r; x += 9) {
        c.drawLine(Offset(x, gy), Offset(math.min(x + 5, s.width - r), gy), Paint()
          ..color = gp.accent
          ..strokeWidth = 1.4);
      }
    }
    for (var i = 0; i < days.length; i++) {
      final x = l + bw * i;
      final top = y(days[i].seconds);
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(x + bw * 0.22, top, x + bw * 0.78, t + ih + 0.5), const Radius.circular(3)),
          Paint()..color = i == days.length - 1 ? gp.levels[4] : gp.levels[2]);
      _text(c, jWeekdays[weekday(days[i].day)].substring(0, 1), Offset(x + bw / 2, s.height - 9), gp.muted);
    }
  }

  @override
  bool shouldRepaint(_DaysPainter o) => o.days != days || o.goal != goal;
}

class CompareTile extends StatelessWidget {
  const CompareTile({super.key, required this.title, required this.icon, required this.c, required this.format});
  final String title;
  final IconData icon;
  final Compare c;
  final String Function(int) format;

  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    final up = c.today >= c.yesterday;
    final color = c.today == c.yesterday ? gp.muted : (up ? gp.accent : gp.danger);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(color: gp.levels[1], borderRadius: BorderRadius.circular(8)),
              child: Icon(icon, size: 16, color: gp.levels[4]),
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(title, style: TextStyle(color: gp.muted, fontSize: 13))),
          ]),
          const SizedBox(height: 8),
          Text(format(c.today), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
          Row(children: [
            if (c.today != c.yesterday) Icon(up ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded, size: 14, color: color),
            Flexible(
              child: Text(
                c.delta == null ? (c.today > 0 ? 'دیروز صفر بود' : 'بدون تغییر') : '${c.delta!.abs()}٪ ${up ? 'بیشتر' : 'کمتر'} از دیروز',
                style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w600),
              ),
            ),
          ]),
          Text('دیروز ${format(c.yesterday)}', style: TextStyle(color: gp.muted, fontSize: 11.5)),
        ]),
      ),
    );
  }
}
