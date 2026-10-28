import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../domain/activity.dart';
import '../../domain/dates.dart';
import '../../domain/jalali.dart';
import 'common.dart';

TextPainter _label(String s, Color c) =>
    TextPainter(text: TextSpan(text: s, style: TextStyle(fontSize: 10, color: c, fontFamily: 'IRANYekanX')), textDirection: TextDirection.rtl)
      ..layout();

class _FlatPainter extends CustomPainter {
  _FlatPainter(this.grid, this.levels, this.muted);
  final ActivityGrid grid;
  final List<Color> levels;
  final Color muted;
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
    for (var w = 0; w < grid.weeks.length; w++) {
      for (var d = 0; d < 7; d++) {
        final cl = grid.weeks[w][d];
        if (cl.future) continue;
        c.drawRRect(
          RRect.fromRectAndRadius(Rect.fromLTWH(left + w * (cell + gap), top + d * (cell + gap), cell, cell), const Radius.circular(2.5)),
          Paint()..color = levels[cl.level],
        );
      }
    }
  }

  @override
  bool shouldRepaint(_FlatPainter o) => o.grid != grid || o.levels != levels;
}

class _IsoPainter extends CustomPainter {
  _IsoPainter(this.grid, this.levels, this.muted, this.edge);
  final ActivityGrid grid;
  final List<Color> levels;
  final Color muted;
  final Color edge;
  static const s = 13.0, maxH = 120.0;
  static const ux = s * 0.866, uy = s * 0.5;

  static Size sizeFor(ActivityGrid g) => Size(10 + (g.weeks.length + 7) * ux + 10, 7 * uy + maxH + 8 + g.weeks.length * uy + 30);

  @override
  void paint(Canvas c, Size size) {
    final oy = 7 * uy + maxH + 8;
    Offset pt(num w, num d) => Offset(10 + (w + d) * ux, oy + (w - d) * uy);
    final cells = <(Cell, int, int)>[];
    for (var w = 0; w < grid.weeks.length; w++) {
      for (var d = 0; d < 7; d++) {
        if (!grid.weeks[w][d].future) cells.add((grid.weeks[w][d], w, d));
      }
    }
    cells.sort((a, b) {
      final x = (a.$2 - a.$3).compareTo(b.$2 - b.$3);
      return x != 0 ? x : a.$2.compareTo(b.$2);
    });
    final stroke = Paint()
      ..color = edge
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.6;
    for (final (cl, w, d) in cells) {
      final h = cl.count > 0 ? 6 + cl.count / (grid.max < 1 ? 1 : grid.max) * maxH : 2.5;
      final p0 = pt(w, d), p1 = pt(w + 1, d), p2 = pt(w + 1, d + 1), p3 = pt(w, d + 1);
      final up = Offset(0, -h);
      final base = levels[cl.level];
      Path poly(List<Offset> ps) => Path()..addPolygon(ps, true);
      final left = poly([p0, p1, p1 + up, p0 + up]);
      final right = poly([p1, p2, p2 + up, p1 + up]);
      final topFace = poly([p0 + up, p1 + up, p2 + up, p3 + up]);
      c.drawPath(left, Paint()..color = Color.lerp(base, Colors.black, 0.1)!);
      c.drawPath(right, Paint()..color = Color.lerp(base, Colors.black, 0.22)!);
      c.drawPath(topFace, Paint()..color = base);
      c.drawPath(topFace, stroke);
    }
    for (final (w, m) in grid.monthLabels) {
      _label(jMonths[m - 1], muted).paint(c, pt(w, -0.6) + const Offset(-6, 2));
    }
  }

  @override
  bool shouldRepaint(_IsoPainter o) => o.grid != grid || o.levels != levels;
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
        Container(
          width: 11,
          height: 11,
          margin: const EdgeInsets.symmetric(horizontal: 2),
          decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3)),
        ),
      const SizedBox(width: 6),
      Text('بیشتر', style: TextStyle(fontSize: 11.5, color: gp.muted)),
    ]);
  }
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

class _ActivityCardState extends State<ActivityCard> {
  bool iso = false;

  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    final cs = Theme.of(context).colorScheme;
    final s = widget.summary;
    final stats = [
      StatTile(big: true, label: 'مجموع مشارکت‌ها', value: '${s.total}', unit: 'مشارکت', sub: '${fmtDay(widget.from, year: true)} — ${fmtDay(widget.today, year: true)}'),
      StatTile(label: 'پرفعالیت‌ترین روز', value: '${s.busiest?.$2 ?? 0}', unit: 'مشارکت', sub: s.busiest == null ? '—' : fmtDay(s.busiest!.$1)),
      StatTile(
          label: 'طولانی‌ترین تداوم',
          value: '${s.longest?.length ?? 0}',
          unit: 'روز',
          sub: s.longest == null ? '—' : '${fmtDay(s.longest!.from)} — ${fmtDay(s.longest!.to)}'),
      StatTile(
          label: 'تداوم فعلی',
          value: '${s.current?.length ?? 0}',
          unit: 'روز',
          sub: s.current == null ? '—' : '${fmtDay(s.current!.from)} — ${fmtDay(s.current!.to)}'),
    ];
    final painterSize = iso ? _IsoPainter.sizeFor(widget.grid) : _FlatPainter.sizeFor(widget.grid);
    final graph = SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      reverse: true,
      child: CustomPaint(
        size: painterSize,
        painter: iso
            ? _IsoPainter(widget.grid, gp.levels, gp.muted, cs.surface.withValues(alpha: 0.5))
            : _FlatPainter(widget.grid, gp.levels, gp.muted),
      ),
    );

    return SectionCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(
            child: Text.rich(TextSpan(children: [
              const TextSpan(text: 'فعالیت‌های '),
              TextSpan(text: widget.name, style: const TextStyle(fontWeight: FontWeight.w800)),
              const TextSpan(text: ' در goprofile'),
            ])),
          ),
          SegmentedButton<bool>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: false, icon: Icon(Icons.grid_view_rounded, size: 18), tooltip: 'نمای جدولی'),
              ButtonSegment(value: true, icon: Icon(Icons.view_in_ar_rounded, size: 18), tooltip: 'نمای سه‌بعدی'),
            ],
            selected: {iso},
            onSelectionChanged: (v) => setState(() => iso = v.first),
            style: ButtonStyle(
              backgroundColor: WidgetStateProperty.resolveWith((st) => st.contains(WidgetState.selected) ? cs.primary : null),
              foregroundColor: WidgetStateProperty.resolveWith((st) => st.contains(WidgetState.selected) ? cs.onPrimary : gp.muted),
            ),
          ),
        ]),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: gp.surface2, border: Border.all(color: gp.border), borderRadius: BorderRadius.circular(12)),
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            child: Column(
              key: ValueKey(iso),
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: iso
                  ? [
                      Wrap(spacing: 28, runSpacing: 12, children: stats.sublist(0, 2)),
                      graph,
                      Wrap(spacing: 28, runSpacing: 12, crossAxisAlignment: WrapCrossAlignment.end, children: [...stats.sublist(2), const Legend()]),
                    ]
                  : [
                      graph,
                      const SizedBox(height: 18),
                      Wrap(spacing: 28, runSpacing: 16, children: stats),
                      const SizedBox(height: 10),
                      const Align(alignment: AlignmentDirectional.centerStart, child: Legend()),
                    ],
            ),
          ),
        ),
      ]),
    );
  }
}
