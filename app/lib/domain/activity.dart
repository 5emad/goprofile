import 'dart:math';

import 'dates.dart';
import 'entities.dart';

class Cell {
  const Cell(this.key, this.count, this.level, this.future);
  final String key;
  final int count;
  final int level;
  final bool future;
}

class ActivityGrid {
  const ActivityGrid(this.weeks, this.monthLabels, this.max);
  final List<List<Cell>> weeks;
  final List<(int week, int month)> monthLabels;
  final int max;
}

int levelOf(int count, int top) => count <= 0 || top <= 0 ? 0 : min(4, max(1, (count / top * 4).ceil()));

ActivityGrid buildGrid(List<DayStat> days, String today, {int weeks = 53}) {
  final counts = {for (final d in days) d.day: d.contributions};
  final mx = counts.values.fold(0, max);
  final first = addDays(startOfWeek(today), -(weeks - 1) * 7);
  final grid = <List<Cell>>[];
  final labels = <(int, int)>[];
  var last = -1;
  for (var w = 0; w < weeks; w++) {
    final col = <Cell>[];
    for (var d = 0; d < 7; d++) {
      final k = addDays(first, w * 7 + d);
      final c = counts[k] ?? 0;
      col.add(Cell(k, c, levelOf(c, mx), diffDays(k, today) > 0));
    }
    final m = jalaliOf(col.first.key).month;
    if (m != last) {
      labels.add((w, m));
      last = m;
    }
    grid.add(col);
  }
  if (labels.length > 1 && labels[1].$1 - labels[0].$1 < 2) labels.removeAt(0);
  return ActivityGrid(grid, labels, mx);
}

class Streak {
  const Streak(this.length, this.from, this.to);
  final int length;
  final String from;
  final String to;
}

class Summary {
  const Summary(this.total, this.busiest, this.longest, this.current);
  final int total;
  final (String, int)? busiest;
  final Streak? longest;
  final Streak? current;
}

Summary summarize(List<DayStat> days, String today) {
  final active = days.where((d) => d.contributions > 0).toList()..sort((a, b) => a.day.compareTo(b.day));
  var total = 0;
  (String, int)? busiest;
  Streak? longest;
  Streak? run;
  for (final d in active) {
    total += d.contributions;
    if (busiest == null || d.contributions > busiest.$2) busiest = (d.day, d.contributions);
    run = run != null && diffDays(d.day, run.to) == 1 ? Streak(run.length + 1, run.from, d.day) : Streak(1, d.day, d.day);
    if (longest == null || run.length > longest.length) longest = run;
  }
  final current = run != null && diffDays(today, run.to) <= 1 ? run : null;
  return Summary(total, busiest, longest, current);
}

class MonthBucket {
  MonthBucket(this.year, this.month);
  final int year;
  final int month;
  int seconds = 0;
  int done = 0;
}

List<MonthBucket> monthly(List<DayStat> days, String today, {int count = 12}) {
  final t = jalaliOf(today);
  final out = <MonthBucket>[];
  for (var i = count - 1; i >= 0; i--) {
    var m = t.month - i;
    var y = t.year;
    while (m < 1) {
      m += 12;
      y--;
    }
    out.add(MonthBucket(y, m));
  }
  for (final d in days) {
    final j = jalaliOf(d.day);
    for (final b in out) {
      if (b.year == j.year && b.month == j.month) {
        b.seconds += d.seconds;
        b.done += d.done;
      }
    }
  }
  return out;
}

class Compare {
  const Compare(this.today, this.yesterday);
  final int today;
  final int yesterday;

  /// Percent change, or null when yesterday was zero.
  int? get delta => yesterday == 0 ? null : ((today - yesterday) / yesterday * 100).round();
}

DayStat dayOf(List<DayStat> days, String key) =>
    days.firstWhere((d) => d.day == key, orElse: () => DayStat(key, 0, 0, 0, 0));
