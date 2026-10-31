import 'package:flutter_test/flutter_test.dart';
import 'package:goprofile/domain/activity.dart';
import 'package:goprofile/domain/dates.dart';
import 'package:goprofile/domain/entities.dart';
import 'package:goprofile/domain/jalali.dart';
import 'package:goprofile/domain/report.dart';

void main() {
  test('jalali conversion', () {
    expect(toJalali(2025, 3, 21), const JDate(1404, 1, 1));
    expect(toJalali(2026, 10, 28), const JDate(1405, 8, 6));
    expect(toGregorian(1405, 8, 6), DateTime(2026, 10, 28));
    expect(jalaliMonthLength(1403, 12), 30);
  });

  test('saturday-first weeks', () {
    expect(weekday('2026-10-24'), 0);
    expect(weekday('2026-10-30'), 6);
    expect(startOfWeek('2026-10-28'), '2026-10-24');
  });

  test('streaks and grid', () {
    const days = [
      DayStat('2026-10-25', 1, 0, 1, 3600),
      DayStat('2026-10-26', 0, 1, 2, 7200),
      DayStat('2026-10-27', 0, 0, 1, 600),
    ];
    final s = summarize(days, '2026-10-28');
    expect(s.total, 6);
    expect(s.longest?.length, 3);
    expect(s.current?.length, 3);
    final g = buildGrid(days, '2026-10-28');
    expect(g.weeks.length, 53);
    expect(weekday(g.weeks.first.first.key), 0);
  });

  test('report ranges and due states', () {
    expect(rangeOf(Period.month, '2026-10-28').from, '2026-10-23');
    expect(rangeOf(Period.month, '2026-10-28').to, '2026-11-21');
    expect(rangeOf(Period.year, '2026-10-28').from, '2026-03-21');
    expect(shiftRange(rangeOf(Period.month, '2026-10-28'), -1).from, '2026-09-23');
    Task t(String? due, {DateTime? done}) => Task(id: 1, boardId: 1, boardName: 'B', key: 'GP-1', jiraKey: '', title: 'a', description: '', statusId: null,
        phaseId: null, epicId: null, categoryId: null, priority: 2, estimateMinutes: 0, dueOn: due, position: 0, doneAt: done, loggedSeconds: 0, running: false);
    expect(dueState(t('2026-10-27'), '2026-10-28'), DueState.overdue);
    expect(dueState(t('2026-10-28'), '2026-10-28'), DueState.today);
    expect(dueState(t('2026-10-31'), '2026-10-28'), DueState.soon);
    expect(dueState(t('2026-11-09'), '2026-10-28'), DueState.later);
    expect(dueState(t('2026-10-01', done: DateTime(2026, 10, 2)), '2026-10-28'), isNull);
  });

  test('report totals', () {
    Worklog w(int id, DateTime start, int min, String src) => Worklog(id: id, taskId: id % 2, taskKey: 'GP-$id', jiraKey: '', taskTitle: 't$id', boardName: 'B',
        startedAt: start, endedAt: start.add(Duration(minutes: min)), seconds: min * 60, note: '', source: src);
    final r = buildReport(rangeOf(Period.week, '2026-10-28'), [w(1, DateTime(2026, 10, 25, 9, 30), 90, 'timer'), w(2, DateTime(2026, 10, 25, 13), 30, 'manual')], 3600);
    expect(r.total, 120 * 60);
    expect(r.workDays, 1);
    expect(r.goalDays, 1);
    expect(r.hours[9], 30 * 60);
    expect(r.manualSeconds, 30 * 60);
    expect(r.buckets.length, 7);
  });
}
