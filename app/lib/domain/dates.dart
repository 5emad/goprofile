// Day keys are "YYYY-MM-DD" strings. The app uses the device timezone, which
// should match the timezone chosen in settings.
import 'jalali.dart';

String _p(int n) => n.toString().padLeft(2, '0');

String dayKey(DateTime d) {
  final l = d.toLocal();
  return '${l.year}-${_p(l.month)}-${_p(l.day)}';
}

DateTime parseKey(String k) {
  final p = k.split('-').map(int.parse).toList();
  return DateTime(p[0], p[1], p[2]);
}

String addDays(String k, int n) {
  final d = parseKey(k);
  return dayKey(DateTime(d.year, d.month, d.day + n));
}

int diffDays(String a, String b) {
  final pa = parseKey(a);
  final pb = parseKey(b);
  return DateTime.utc(pa.year, pa.month, pa.day).difference(DateTime.utc(pb.year, pb.month, pb.day)).inDays;
}

/// Saturday = 0.
int weekday(String k) => (parseKey(k).weekday + 1) % 7;

String startOfWeek(String k) => addDays(k, -weekday(k));

JDate jalaliOf(String k) {
  final d = parseKey(k);
  return toJalali(d.year, d.month, d.day);
}

String fmtDay(String k, {bool year = false}) {
  final j = jalaliOf(k);
  return '${j.day} ${jMonths[j.month - 1]}${year ? ' ${j.year}' : ''}';
}

String fmtDayLong(String k) => '${jWeekdays[weekday(k)]} ${fmtDay(k, year: true)}';

String fmtTime(DateTime d) {
  final l = d.toLocal();
  return '${_p(l.hour)}:${_p(l.minute)}';
}

String fmtDuration(int seconds, {bool short = false}) {
  final s = seconds < 0 ? 0 : seconds;
  final h = s ~/ 3600;
  final m = (s % 3600) ~/ 60;
  if (short) return h > 0 ? '$h:${_p(m)}' : '$mد';
  if (h == 0 && m == 0) return 'کمتر از ۱ دقیقه';
  return [if (h > 0) '$h ساعت', if (m > 0) '$m دقیقه'].join(' و ');
}

String fmtClock(int seconds) => '${_p(seconds ~/ 3600)}:${_p((seconds % 3600) ~/ 60)}:${_p(seconds % 60)}';

/// Persian digits for text drawn outside the FaNum font.
String faDigits(Object v) => v.toString().replaceAllMapped(RegExp(r'\d'), (m) => '۰۱۲۳۴۵۶۷۸۹'[int.parse(m[0]!)]);
