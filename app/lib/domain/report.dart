// Period reports (day, week, Jalali month, Jalali year) and due-date rules.
import 'dart:math';

import 'dates.dart';
import 'entities.dart';
import 'jalali.dart';

enum Period { day, week, month, year }

const periodLabels = {Period.day: 'روزانه', Period.week: 'هفتگی', Period.month: 'ماهانه', Period.year: 'سالانه'};
const currentLabels = {Period.day: 'امروز', Period.week: 'این هفته', Period.month: 'این ماه', Period.year: 'امسال'};
const previousNames = {Period.day: 'دیروز', Period.week: 'هفته قبل', Period.month: 'ماه قبل', Period.year: 'سال قبل'};

class Range {
  const Range(this.period, this.from, this.to, this.label);
  final Period period;
  final String from;
  final String to;
  final String label;

  bool contains(String k) => k.compareTo(from) >= 0 && k.compareTo(to) <= 0;
  List<String> get days => List.generate(diffDays(to, from) + 1, (i) => addDays(from, i));
  Range withTo(String t) => Range(period, from, t, label);
}

String keyFromJalali(int jy, int jm, int jd) => dayKey(toGregorian(jy, jm, jd));

Range rangeOf(Period p, String anchor) {
  final j = jalaliOf(anchor);
  switch (p) {
    case Period.day:
      return Range(p, anchor, anchor, fmtDayLong(anchor));
    case Period.week:
      final from = startOfWeek(anchor);
      final to = addDays(from, 6);
      return Range(p, from, to, '${fmtDay(from)} تا ${fmtDay(to, year: true)}');
    case Period.month:
      return Range(p, keyFromJalali(j.year, j.month, 1), keyFromJalali(j.year, j.month, jalaliMonthLength(j.year, j.month)),
          '${jMonths[j.month - 1]} ${j.year}');
    case Period.year:
      return Range(p, keyFromJalali(j.year, 1, 1), keyFromJalali(j.year, 12, jalaliMonthLength(j.year, 12)), 'سال ${j.year}');
  }
}

Range shiftRange(Range r, int n) {
  var anchor = r.from;
  for (var i = 0; i < n.abs(); i++) {
    final cur = rangeOf(r.period, anchor);
    anchor = n < 0 ? addDays(cur.from, -1) : addDays(cur.to, 1);
  }
  return rangeOf(r.period, anchor);
}

// ---------- due dates ----------

/// Open tasks due within this many days are flagged as near.
const soonDays = 3;

enum DueState { overdue, today, soon, later }

DueState? dueState(Task t, String today) {
  if (t.dueOn == null || t.doneAt != null) return null;
  final left = diffDays(t.dueOn!, today);
  if (left < 0) return DueState.overdue;
  if (left == 0) return DueState.today;
  return left <= soonDays ? DueState.soon : DueState.later;
}

bool isNear(DueState? s) => s == DueState.today || s == DueState.soon;

String dueLabel(Task t, String today) {
  final s = dueState(t, today);
  if (s == null) return '';
  final left = diffDays(t.dueOn!, today);
  return switch (s) {
    DueState.overdue => '${-left} روز گذشته',
    DueState.today => 'سررسید امروز',
    _ => '$left روز مانده',
  };
}

class TaskGroups {
  TaskGroups(this.overdue, this.soon, this.open, this.done, this.created);
  final List<Task> overdue;
  final List<Task> soon;
  final List<Task> open;
  final List<Task> done;
  final List<Task> created;

  List<Task> get others => open.where((t) => !overdue.contains(t) && !soon.contains(t)).toList();
}

TaskGroups groupTasks(List<Task> tasks, Range r, String today) {
  int byDue(Task a, Task b) {
    final c = (a.dueOn ?? '9999').compareTo(b.dueOn ?? '9999');
    return c != 0 ? c : b.priority - a.priority;
  }

  final open = tasks.where((t) => t.doneAt == null).toList()..sort(byDue);
  return TaskGroups(
    open.where((t) => dueState(t, today) == DueState.overdue).toList(),
    open.where((t) => isNear(dueState(t, today))).toList(),
    open,
    tasks.where((t) => t.doneAt != null && r.contains(dayKey(t.doneAt!))).toList()..sort((a, b) => b.doneAt!.compareTo(a.doneAt!)),
    tasks.where((t) => t.createdAt != null && r.contains(dayKey(t.createdAt!))).toList(),
  );
}

// ---------- work time ----------

class Bucket {
  Bucket(this.key, this.label);
  final String key;
  final String label;
  int seconds = 0;
}

class TaskTotal {
  TaskTotal(this.log);
  final Worklog log;
  int seconds = 0;
  int logs = 0;
}

class DayLogs {
  DayLogs(this.key);
  final String key;
  final List<Worklog> logs = [];
  int seconds = 0;
  DateTime? first;
  DateTime? last;
}

class PeriodReport {
  PeriodReport._(this.range);
  final Range range;
  int total = 0;
  int logs = 0;
  int workDays = 0;
  int elapsedDays = 0;
  int goalDays = 0;
  int timerSeconds = 0;
  late List<DayLogs> days;
  late List<Bucket> buckets;
  late List<TaskTotal> tasks;
  late List<MapEntry<String, int>> boards;
  final weekdays = List.filled(7, 0);
  final hours = List.filled(24, 0.0);
  Worklog? longest;
  DayLogs? bestDay;
  double? avgStart;
  double? avgEnd;

  int get manualSeconds => total - timerSeconds;
  double get avgPerWorkDay => workDays == 0 ? 0 : total / workDays;
}

DateTime _endOf(Worklog l) => l.endedAt ?? l.startedAt.add(Duration(seconds: l.seconds));
double _minuteOfDay(DateTime d) {
  final l = d.toLocal();
  return l.hour * 60 + l.minute + l.second / 60;
}

PeriodReport buildReport(Range range, List<Worklog> logs, int goalSeconds, {String? today}) {
  final r = PeriodReport._(range);
  r.days = range.days.map(DayLogs.new).toList();
  final index = {for (var i = 0; i < r.days.length; i++) r.days[i].key: i};
  final tasks = <int, TaskTotal>{};
  final boards = <String, int>{};

  for (final l in logs) {
    final key = dayKey(l.startedAt);
    final i = index[key];
    if (i == null) continue;
    r.logs++;
    final d = r.days[i]
      ..logs.add(l)
      ..seconds += l.seconds;
    if (d.first == null || l.startedAt.isBefore(d.first!)) d.first = l.startedAt;
    if (d.last == null || _endOf(l).isAfter(d.last!)) d.last = _endOf(l);
    tasks.putIfAbsent(l.taskId, () => TaskTotal(l))
      ..seconds += l.seconds
      ..logs += 1;
    boards[l.boardName] = (boards[l.boardName] ?? 0) + l.seconds;
    r.weekdays[weekday(key)] += l.seconds;
    var m = _minuteOfDay(l.startedAt);
    var left = l.seconds / 60;
    while (left > 0 && m < 1440) {
      final h = m ~/ 60;
      final take = min(left, (h + 1) * 60 - m);
      r.hours[h] += take * 60;
      left -= take;
      m += take;
    }
    if (l.source == 'timer') r.timerSeconds += l.seconds;
    if (r.longest == null || l.seconds > r.longest!.seconds) r.longest = l;
  }

  r.total = r.days.fold(0, (s, d) => s + d.seconds);
  final worked = r.days.where((d) => d.seconds > 0).toList();
  r.workDays = worked.length;
  r.elapsedDays = today == null ? r.days.length : r.days.where((d) => d.key.compareTo(today) <= 0).length;
  r.goalDays = goalSeconds > 0 ? worked.where((d) => d.seconds >= goalSeconds).length : 0;
  r.tasks = tasks.values.toList()..sort((a, b) => b.seconds.compareTo(a.seconds));
  r.boards = boards.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
  for (final d in worked) {
    if (r.bestDay == null || d.seconds > r.bestDay!.seconds) r.bestDay = d;
  }
  if (worked.isNotEmpty) {
    r.avgStart = worked.map((d) => _minuteOfDay(d.first!)).reduce((a, b) => a + b) / worked.length;
    r.avgEnd = worked.map((d) => _minuteOfDay(d.last!)).reduce((a, b) => a + b) / worked.length;
  }

  switch (range.period) {
    case Period.day:
      r.buckets = [for (var h = 0; h < 24; h++) Bucket('$h', h.toString().padLeft(2, '0'))..seconds = r.hours[h].round()];
    case Period.year:
      r.buckets = [for (var m = 0; m < 12; m++) Bucket('${m + 1}', jMonths[m])];
      for (final d in r.days) {
        r.buckets[jalaliOf(d.key).month - 1].seconds += d.seconds;
      }
    default:
      const short = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
      r.buckets = [
        for (final d in r.days)
          Bucket(d.key, range.period == Period.week ? short[weekday(d.key)] : '${jalaliOf(d.key).day}')..seconds = d.seconds,
      ];
  }
  return r;
}

/// Percent change from prev to cur, or null when there is nothing to compare with.
int? delta(num cur, num prev) => prev == 0 ? null : ((cur - prev) / prev * 100).round();

String _hm(double min) => '${(min ~/ 60 % 24).toString().padLeft(2, '0')}:${(min % 60).round().toString().padLeft(2, '0')}';

/// Short Persian observations about a report.
List<String> insights(PeriodReport r, PeriodReport? prev, TaskGroups g, int goalSeconds, String prevName) {
  String fmt(num s) => fmtDuration(s.round());
  final out = <String>[];
  if (r.total == 0) {
    out.add('در این بازه زمان کاری ثبت نشده است.');
  } else {
    final d = prev == null ? null : delta(r.total, prev.total);
    if (d != null) out.add('زمان کار نسبت به $prevName ${d >= 0 ? '$d٪ بیشتر' : '${-d}٪ کمتر'} بوده است (${fmt(prev!.total)} ← ${fmt(r.total)}).');
    if (r.range.period != Period.day) {
      out.add('در ${r.workDays} روز از ${r.elapsedDays} روز${r.elapsedDays < r.days.length ? ' سپری‌شده' : ''} کار ثبت شده؛ میانگین هر روز کاری ${fmt(r.avgPerWorkDay)}.');
      if (goalSeconds > 0) out.add('هدف روزانه (${fmt(goalSeconds)}) در ${r.goalDays} روز محقق شده است.');
      if (r.bestDay != null) out.add('پرکارترین روز ${fmtDayLong(r.bestDay!.key)} با ${fmt(r.bestDay!.seconds)} بود.');
    }
    if (r.avgStart != null) out.add('شروع کار به‌طور میانگین ساعت ${_hm(r.avgStart!)} و پایان آن ${_hm(r.avgEnd!)} بوده است.');
    final peak = r.hours.indexOf(r.hours.reduce(max));
    if (r.hours[peak] > 0) out.add('بیشترین تمرکز بین ساعت ${peak.toString().padLeft(2, '0')} تا ${(peak + 1).toString().padLeft(2, '0')} بوده است.');
    if (r.tasks.isNotEmpty) {
      final t = r.tasks.first;
      out.add('بیشترین زمان صرف «${t.log.taskTitle}» شد (${(t.seconds / r.total * 100).round()}٪ کل زمان).');
    }
    if (r.longest != null && r.longest!.seconds >= 1800) out.add('طولانی‌ترین بازه پیوسته ${fmt(r.longest!.seconds)} روی «${r.longest!.taskTitle}» بود.');
    out.add('${(r.timerSeconds / r.total * 100).round()}٪ زمان با تایمر و بقیه به‌صورت دستی ثبت شده است.');
  }
  if (g.done.isNotEmpty) out.add('${g.done.length} تسک در این بازه انجام شد.');
  if (g.overdue.isNotEmpty) out.add('${g.overdue.length} تسک از سررسیدش گذشته و نیاز به رسیدگی فوری دارد.');
  if (g.soon.isNotEmpty) out.add('${g.soon.length} تسک تا $soonDays روز آینده سررسید می‌شود.');
  return out;
}

String hoursLabel(num seconds) {
  final h = seconds / 3600;
  return h >= 10 ? h.toStringAsFixed(0) : h.toStringAsFixed(1).replaceAll(RegExp(r'\.0$'), '');
}
