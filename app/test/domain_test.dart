import 'package:flutter_test/flutter_test.dart';
import 'package:goprofile/domain/activity.dart';
import 'package:goprofile/domain/dates.dart';
import 'package:goprofile/domain/entities.dart';
import 'package:goprofile/domain/jalali.dart';

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
}
