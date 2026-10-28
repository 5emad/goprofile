import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme.dart';
import '../../domain/dates.dart';
import '../../domain/entities.dart';
import '../../domain/jalali.dart';
import '../viewmodels/session_vm.dart';

void toast(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(msg), backgroundColor: error ? context.gp.danger : null));
}

/// Runs an action and shows its error as a snack bar.
Future<void> run(BuildContext context, Future<void> Function() f, {String? ok}) async {
  try {
    await f();
    if (ok != null && context.mounted) toast(context, ok);
  } catch (e) {
    if (context.mounted) toast(context, e.toString(), error: true);
  }
}

class GpLogo extends StatelessWidget {
  const GpLogo({super.key, this.size = 36, this.withText = false});
  final double size;
  final bool withText;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final mark = CustomPaint(size: Size.square(size), painter: _LogoPainter(cs.primary, cs.onPrimary, context.gp.levels[3]));
    if (!withText) return mark;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      mark,
      const SizedBox(width: 10),
      const Text('goprofile', textDirection: TextDirection.ltr, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
    ]);
  }
}

class _LogoPainter extends CustomPainter {
  _LogoPainter(this.bg, this.ink, this.dot);
  final Color bg, ink, dot;

  @override
  void paint(Canvas c, Size s) {
    c.scale(s.width / 128);
    c.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(0, 0, 128, 128), const Radius.circular(30)), Paint()..color = bg);
    final p = Paint()
      ..color = ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 11
      ..strokeCap = StrokeCap.round;
    c.drawCircle(const Offset(42, 60), 17, p);
    c.drawPath(
        Path()
          ..moveTo(59, 46)
          ..lineTo(59, 80)
          ..cubicTo(59, 94, 50, 102, 38, 102)
          ..cubicTo(32, 102, 27, 100, 24, 96),
        p);
    c.drawCircle(const Offset(84, 60), 17, p);
    c.drawLine(const Offset(67, 46), const Offset(67, 104), p);
    c.drawCircle(const Offset(106, 26), 9, Paint()..color = dot);
  }

  @override
  bool shouldRepaint(_LogoPainter o) => o.bg != bg || o.ink != ink;
}

class SectionCard extends StatelessWidget {
  const SectionCard({super.key, this.title, this.trailing, required this.child, this.padding = const EdgeInsets.all(18)});
  final String? title;
  final Widget? trailing;
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: padding,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (title != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Row(children: [
                  Expanded(child: Text(title!, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                  ?trailing,
                ]),
              ),
            child,
          ]),
        ),
      );
}

class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.value, required this.unit, this.sub, this.big = false});
  final String label;
  final String value;
  final String unit;
  final String? sub;
  final bool big;

  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      Text(label, style: TextStyle(color: gp.muted, fontSize: 12.5)),
      Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.center, children: [
        Text(value, style: TextStyle(fontSize: big ? 42 : 30, fontWeight: FontWeight.w900, color: gp.accent, height: 1.1)),
        const SizedBox(width: 8),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(unit, style: const TextStyle(fontWeight: FontWeight.w600)),
          if (sub != null) Text(sub!, style: TextStyle(color: gp.muted, fontSize: 11.5)),
        ]),
      ]),
    ]);
  }
}

class KeyChip extends StatelessWidget {
  const KeyChip(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
        decoration: BoxDecoration(color: context.gp.levels[1], borderRadius: BorderRadius.circular(6)),
        child: Text(text,
            textDirection: TextDirection.ltr, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: context.gp.levels[4])),
      );
}

Color hexColor(String? hex, Color fallback) {
  if (hex == null || hex.length != 7) return fallback;
  return Color(int.parse(hex.substring(1), radix: 16) | 0xFF000000);
}

class MetaChip extends StatelessWidget {
  const MetaChip(this.meta, {super.key, this.icon});
  final Meta meta;
  final IconData? icon;
  @override
  Widget build(BuildContext context) {
    final c = hexColor(meta.color, context.gp.muted);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) Icon(icon, size: 11, color: c),
        if (icon != null) const SizedBox(width: 3),
        Text(meta.name, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color.lerp(c, Theme.of(context).colorScheme.onSurface, 0.3))),
      ]),
    );
  }
}

/// Ticks every second while `start` is set.
class Elapsed extends StatefulWidget {
  const Elapsed({super.key, required this.start, required this.builder});
  final DateTime? start;
  final Widget Function(BuildContext, int seconds) builder;
  @override
  State<Elapsed> createState() => _ElapsedState();
}

class _ElapsedState extends State<Elapsed> {
  Timer? _t;
  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) => mounted && widget.start != null ? setState(() {}) : null);
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.start == null ? 0 : DateTime.now().difference(widget.start!).inSeconds;
    return widget.builder(context, s < 0 ? 0 : s);
  }
}

class TimerButton extends StatelessWidget {
  const TimerButton({super.key, required this.taskId});
  final int taskId;

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionViewModel>();
    final running = session.timer?.taskId == taskId;
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: running ? cs.primary : cs.surface,
      shape: StadiumBorder(side: BorderSide(color: running ? cs.primary : context.gp.border)),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: () => run(context, () => running ? session.stopTimer() : session.startTimer(taskId), ok: running ? 'لاگ ثبت شد' : null),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(running ? Icons.stop_rounded : Icons.play_arrow_rounded, size: 16, color: running ? cs.onPrimary : context.gp.accent),
            if (running)
              Elapsed(
                start: session.timer?.startedAt,
                builder: (_, s) => Padding(
                  padding: const EdgeInsetsDirectional.only(start: 4),
                  child: Text(fmtDuration(s, short: true), style: TextStyle(color: cs.onPrimary, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}

/// Jalali calendar dialog returning a Gregorian day key.
Future<String?> pickJalaliDate(BuildContext context, String? initial) {
  return showDialog<String>(context: context, builder: (_) => _JalaliPicker(initial ?? dayKey(DateTime.now())));
}

class _JalaliPicker extends StatefulWidget {
  const _JalaliPicker(this.initial);
  final String initial;
  @override
  State<_JalaliPicker> createState() => _JalaliPickerState();
}

class _JalaliPickerState extends State<_JalaliPicker> {
  late int y;
  late int m;

  @override
  void initState() {
    super.initState();
    final j = jalaliOf(widget.initial);
    y = j.year;
    m = j.month;
  }

  void shift(int n) => setState(() {
        m += n;
        if (m < 1) {
          m = 12;
          y--;
        } else if (m > 12) {
          m = 1;
          y++;
        }
      });

  @override
  Widget build(BuildContext context) {
    final today = dayKey(DateTime.now());
    final first = dayKey(toGregorian(y, m, 1));
    final lead = weekday(first);
    final len = jalaliMonthLength(y, m);
    final cs = Theme.of(context).colorScheme;
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: SizedBox(
        width: 320,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              IconButton(onPressed: () => shift(-1), icon: const Icon(Icons.chevron_right)),
              Expanded(child: Text('${jMonths[m - 1]} $y', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700))),
              IconButton(onPressed: () => shift(1), icon: const Icon(Icons.chevron_left)),
            ]),
            GridView.count(
              crossAxisCount: 7,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                for (final w in jWeekdays) Center(child: Text(w.substring(0, 1), style: TextStyle(color: context.gp.muted, fontSize: 12))),
                for (var i = 0; i < lead; i++) const SizedBox(),
                for (var d = 1; d <= len; d++)
                  Builder(builder: (_) {
                    final k = dayKey(toGregorian(y, m, d));
                    final on = k == widget.initial;
                    return Padding(
                      padding: const EdgeInsets.all(2),
                      child: Material(
                        color: on ? cs.primary : Colors.transparent,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                          side: k == today ? BorderSide(color: context.gp.levels[3], width: 1.5) : BorderSide.none,
                        ),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(8),
                          onTap: () => Navigator.pop(context, k),
                          child: Center(child: Text('$d', style: TextStyle(color: on ? cs.onPrimary : null))),
                        ),
                      ),
                    );
                  }),
              ],
            ),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              TextButton(onPressed: () => Navigator.pop(context, today), child: const Text('امروز')),
              TextButton(onPressed: () => Navigator.pop(context, ''), child: const Text('پاک کردن')),
            ]),
          ]),
        ),
      ),
    );
  }
}
