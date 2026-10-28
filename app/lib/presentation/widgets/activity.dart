import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../domain/activity.dart';
import '../../domain/dates.dart';
import '../../domain/jalali.dart';

TextPainter _label(String s, Color c) =>
    TextPainter(text: TextSpan(text: s, style: TextStyle(fontSize: 10, color: c, fontFamily: 'IRANYekanX')), textDirection: TextDirection.rtl)
      ..layout();

/// Flat grid; cells pop in column by column as `t` goes from 0 to 1.
class _FlatPainter extends CustomPainter {
  _FlatPainter(this.grid, this.levels, this.muted, this.t);
  final ActivityGrid grid;
  final List<Color> levels;
  final Color muted;
  final double t;
  static const cell = 12.0, gap = 3.0, left = 56.0, top = 20.0;

  static Size sizeFor(ActivityGrid g) => Size(left + g.weeks.length * (cell + gap), top + 7 * (cell + gap));

  @override
  void paint(Canvas c, Size s) {
    for (final (w, m) in grid.monthLabels) {
      _label(jMonths[m - 1], muted).paint(c, Offset(left + w * (cell + gap), 0));
    }
    for (final (d, l) in [(1, 'یکشنبه'), (3, 'سه‌شنبه'), (5, 'پنجشنبه')]) {
      _label(l, muted).paint(c, Offset(0, top + d * (cell + gap) - 1));
    }
    final n = grid.weeks.length;
    for (var w = 0; w < n; w++) {
      final local = ((t - w / n * 0.6) / 0.4).clamp(0.0, 1.0);
      if (local == 0) continue;
      final k = Curves.easeOutBack.transform(local);
      for (var d = 0; d < 7; d++) {
        final cl = grid.weeks[w][d];
        if (cl.future) continue;
        final center = Offset(left + w * (cell + gap) + cell / 2, top + d * (cell + gap) + cell / 2);
        c.drawRRect(
          RRect.fromRectAndRadius(Rect.fromCenter(center: center, width: cell * k, height: cell * k), const Radius.circular(2.5)),
          Paint()..color = levels[cl.level],
        );
      }
    }
  }

  @override
  bool shouldRepaint(_FlatPainter o) => o.t != t || o.grid != grid || o.levels != levels;
}

/// Isometric bars that rise in a wave from the oldest week to the newest.
class _IsoPainter extends CustomPainter {
  _IsoPainter(this.grid, this.levels, this.muted, this.edge, this.t, this.hover);
  final ActivityGrid grid;
  final List<Color> levels;
  final Color muted;
  final Color edge;
  final double t;
  final String? hover;
  static const s = 13.0, maxH = 110.0;
  static const ux = s * 0.866, uy = s * 0.5;

  static Size sizeFor(ActivityGrid g) => Size(20 + (g.weeks.length + 7) * ux, 7 * uy + maxH + 14 + g.weeks.length * uy + 34);

  static Offset _pt(num w, num d) => Offset(10 + (w + d) * ux, 7 * uy + maxH + 14 + (w - d) * uy);

  static double _height(Cell c, int max, double grow) => c.count > 0 ? math.max(2.5, (6 + c.count / math.max(1, max) * maxH) * grow) : 2.5;

  /// The cell whose top face contains `p`, topmost first.
  static Cell? hit(ActivityGrid g, Offset p) {
    final cells = _ordered(g).reversed;
    for (final (cl, w, d) in cells) {
      final h = _height(cl, g.max, 1);
      final up = Offset(0, -h);
      final path = Path()..addPolygon([_pt(w, d) + up, _pt(w + 1, d) + up, _pt(w + 1, d + 1) + up, _pt(w, d + 1) + up], true);
      if (path.contains(p)) return cl;
    }
    return null;
  }

  static List<(Cell, int, int)> _ordered(ActivityGrid g) {
    final cells = <(Cell, int, int)>[];
    for (var w = 0; w < g.weeks.length; w++) {
      for (var d = 0; d < 7; d++) {
        if (!g.weeks[w][d].future) cells.add((g.weeks[w][d], w, d));
      }
    }
    cells.sort((a, b) {
      final x = (a.$2 - a.$3).compareTo(b.$2 - b.$3);
      return x != 0 ? x : a.$2.compareTo(b.$2);
    });
    return cells;
  }

  @override
  void paint(Canvas c, Size size) {
    final stroke = Paint()
      ..color = edge
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.6;
    final n = grid.weeks.length;
    for (final (cl, w, d) in _ordered(grid)) {
      final local = ((t - w / n * 0.55) / 0.45).clamp(0.0, 1.0);
      final grow = local == 0 ? 0.0 : Curves.easeOutBack.transform(local);
      final lift = hover == cl.key ? 6.0 : 0.0;
      final h = _height(cl, grid.max, grow) + lift;
      final p0 = _pt(w, d), p1 = _pt(w + 1, d), p2 = _pt(w + 1, d + 1), p3 = _pt(w, d + 1);
      final up = Offset(0, -h);
      final base = levels[cl.level];
      Path poly(List<Offset> ps) => Path()..addPolygon(ps, true);
      final top = poly([p0 + up, p1 + up, p2 + up, p3 + up]);
      c.drawPath(poly([p0, p1, p1 + up, p0 + up]), Paint()..color = Color.lerp(base, Colors.black, 0.1)!);
      c.drawPath(poly([p1, p2, p2 + up, p1 + up]), Paint()..color = Color.lerp(base, Colors.black, 0.22)!);
      c.drawPath(top, Paint()..color = hover == cl.key ? Color.lerp(base, Colors.white, 0.18)! : base);
      c.drawPath(top, stroke);
    }
    for (final (w, m) in grid.monthLabels) {
      final tp = _label(jMonths[m - 1], muted);
      tp.paint(c, _pt(w, -0.6) + Offset(-tp.width + 6, 4));
    }
  }

  @override
  bool shouldRepaint(_IsoPainter o) => o.t != t || o.hover != hover || o.grid != grid || o.levels != levels;
}

class Legend extends StatelessWidget {
  const Legend({super.key});
  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Text('کمتر', style: TextStyle(fontSize: 11.5, color: gp.muted)),
      const SizedBox(width: 6),
      for (final c in gp.levels)
        Container(width: 11, height: 11, margin: const EdgeInsets.symmetric(horizontal: 2), decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3))),
      const SizedBox(width: 6),
      Text('بیشتر', style: TextStyle(fontSize: 11.5, color: gp.muted)),
    ]);
  }
}

class _CountUp extends StatelessWidget {
  const _CountUp(this.value, this.style);
  final int value;
  final TextStyle style;
  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: value.toDouble()),
        duration: const Duration(milliseconds: 1100),
        curve: Curves.easeOutCubic,
        builder: (_, v, _) => Text('${v.round()}', style: style),
      );
}

class ActivityCard extends StatefulWidget {
  const ActivityCard({super.key, required this.grid, required this.summary, required this.from, required this.today, required this.name});
  final ActivityGrid grid;
  final Summary summary;
  final String from;
  final String today;
  final String name;

  @override
  State<ActivityCard> createState() => _ActivityCardState();
}

class _ActivityCardState extends State<ActivityCard> with SingleTickerProviderStateMixin {
  bool iso = true;
  Cell? hover;
  Offset? hoverAt;
  late final AnimationController anim = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))..forward();

  @override
  void didUpdateWidget(ActivityCard old) {
    super.didUpdateWidget(old);
    if (old.grid != widget.grid) anim.forward(from: 0);
  }

  @override
  void dispose() {
    anim.dispose();
    super.dispose();
  }

  void pick(bool v) {
    setState(() {
      iso = v;
      hover = null;
    });
    anim.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    final cs = Theme.of(context).colorScheme;
    final s = widget.summary;
    final natural = iso ? _IsoPainter.sizeFor(widget.grid) : _FlatPainter.sizeFor(widget.grid);

    Widget graph = LayoutBuilder(builder: (context, box) {
      if (!iso) {
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          reverse: true,
          child: AnimatedBuilder(
            animation: anim,
            builder: (_, _) => CustomPaint(size: natural, painter: _FlatPainter(widget.grid, gp.levels, gp.muted, anim.value)),
          ),
        );
      }
      final scale = math.min(1.4, box.maxWidth / natural.width);
      return Center(
        child: MouseRegion(
          onHover: (e) {
            final c = _IsoPainter.hit(widget.grid, e.localPosition / scale);
            if (c?.key != hover?.key) setState(() => hover = c);
            hoverAt = e.localPosition;
          },
          onExit: (_) => setState(() => hover = null),
          child: GestureDetector(
            onTapDown: (e) => setState(() {
              hover = _IsoPainter.hit(widget.grid, e.localPosition / scale);
              hoverAt = e.localPosition;
            }),
            child: SizedBox(
              width: natural.width * scale,
              height: natural.height * scale,
              child: Stack(clipBehavior: Clip.none, children: [
                Positioned.fill(
                  child: AnimatedBuilder(
                    animation: anim,
                    builder: (_, _) => Transform.scale(
                      scale: scale,
                      alignment: Alignment.topLeft,
                      child: CustomPaint(
                        size: natural,
                        painter: _IsoPainter(widget.grid, gp.levels, gp.muted, cs.surface.withValues(alpha: 0.55), anim.value, hover?.key),
                      ),
                    ),
                  ),
                ),
                if (hover != null && hoverAt != null)
                  Positioned(
                    left: hoverAt!.dx - 70,
                    top: hoverAt!.dy - 40,
                    child: IgnorePointer(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(color: cs.primary, borderRadius: BorderRadius.circular(8)),
                        child: Text(
                          '${hover!.count == 0 ? 'بدون مشارکت' : '${hover!.count} مشارکت'} · ${fmtDay(hover!.key, year: true)}',
                          style: TextStyle(color: cs.onPrimary, fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                  ),
              ]),
            ),
          ),
        ),
      );
    });

    final numStyle = TextStyle(fontWeight: FontWeight.w900, color: gp.accent, height: 1);
    Widget stat(String label, int value, String unit) => Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: TextStyle(color: gp.muted, fontSize: 12.5)),
              const SizedBox(height: 6),
              Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                _CountUp(value, numStyle.copyWith(fontSize: 24)),
                const SizedBox(width: 6),
                Flexible(child: Text(unit, overflow: TextOverflow.ellipsis, style: TextStyle(color: gp.muted, fontSize: 11.5))),
              ]),
            ]),
          ),
        );
    final divider = Divider(height: 1, color: gp.border);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(
              child: Text('@${widget.name}', textDirection: TextDirection.ltr, textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            ),
            const SizedBox(width: 12),
            SegmentedButton<bool>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: false, icon: Icon(Icons.grid_view_rounded, size: 18), tooltip: 'نمای جدولی'),
                ButtonSegment(value: true, icon: Icon(Icons.view_in_ar_rounded, size: 18), tooltip: 'نمای سه‌بعدی'),
              ],
              selected: {iso},
              onSelectionChanged: (v) => pick(v.first),
              style: ButtonStyle(
                backgroundColor: WidgetStateProperty.resolveWith((st) => st.contains(WidgetState.selected) ? cs.primary : null),
                foregroundColor: WidgetStateProperty.resolveWith((st) => st.contains(WidgetState.selected) ? cs.onPrimary : gp.muted),
              ),
            ),
          ]),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
            decoration: BoxDecoration(color: gp.surface2, border: Border.all(color: gp.border), borderRadius: BorderRadius.circular(12)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              graph,
              const SizedBox(height: 10),
              divider,
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 14),
                child: Row(children: [
                  Expanded(child: Text('مجموع مشارکت‌ها', style: TextStyle(color: gp.muted, fontSize: 14))),
                  _CountUp(s.total, numStyle.copyWith(fontSize: 46)),
                ]),
              ),
              divider,
              IntrinsicHeight(
                child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  stat('بیشترین فعالیت', s.busiest?.$2 ?? 0, s.busiest == null ? 'مشارکت' : 'مشارکت · ${fmtDay(s.busiest!.$1)}'),
                  VerticalDivider(width: 1, color: gp.border),
                  stat('رکورد تداوم', s.longest?.length ?? 0, 'روز'),
                  VerticalDivider(width: 1, color: gp.border),
                  stat('تداوم فعلی', s.current?.length ?? 0, 'روز'),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 10),
          const Align(alignment: AlignmentDirectional.centerEnd, child: Legend()),
        ]),
      ),
    );
  }
}
