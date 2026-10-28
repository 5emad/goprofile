import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme.dart';
import '../../di.dart';
import '../../domain/activity.dart';
import '../../domain/dates.dart';
import '../viewmodels/session_vm.dart';
import '../widgets/common.dart';
import 'dashboard_view.dart';

const _zones = ['Asia/Tehran', 'Asia/Dubai', 'Europe/Istanbul', 'Europe/Berlin', 'Europe/London', 'America/New_York', 'America/Toronto', 'UTC'];

class SettingsView extends StatelessWidget {
  const SettingsView({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SessionViewModel>();
    final st = s.user!.settings;
    final gp = context.gp;
    Future<void> save(settings) => run(context, () => s.updateSettings(settings), ok: 'تنظیمات ذخیره شد');
    Widget row(String title, String sub, Widget trailing) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                Text(sub, style: TextStyle(color: gp.muted, fontSize: 12.5)),
              ]),
            ),
            const SizedBox(width: 16),
            trailing,
          ]),
        );
    return GpPage(title: 'تنظیمات', children: [
      SectionCard(
        child: Column(children: [
          row('حالت جیرا', 'در ایجاد تسک فیلد «شماره تسک جیرا» نمایش داده می‌شود و همه‌جا جای کلید داخلی را می‌گیرد',
              Switch(value: st.jiraMode, onChanged: (v) => save(st.copyWith(jiraMode: v)))),
          Divider(color: gp.border),
          row(
            'پوسته',
            'روشن، تیره یا هماهنگ با سیستم',
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: const [ButtonSegment(value: 'system', label: Text('سیستم')), ButtonSegment(value: 'light', label: Text('روشن')), ButtonSegment(value: 'dark', label: Text('تیره'))],
              selected: {st.theme},
              onSelectionChanged: (v) => save(st.copyWith(theme: v.first)),
            ),
          ),
          Divider(color: gp.border),
          row(
            'هدف روزانه',
            'چند ساعت در روز می‌خواهی کار ثبت کنی؟',
            DropdownButton<int>(
              value: st.dailyGoalMinutes,
              items: [
                const DropdownMenuItem(value: 0, child: Text('بدون هدف')),
                for (final h in [2, 3, 4, 5, 6, 7, 8, 9, 10]) DropdownMenuItem(value: h * 60, child: Text('$h ساعت')),
                if (st.dailyGoalMinutes % 60 != 0 || st.dailyGoalMinutes > 600)
                  DropdownMenuItem(value: st.dailyGoalMinutes, child: Text(fmtDuration(st.dailyGoalMinutes * 60))),
              ],
              onChanged: (v) => save(st.copyWith(dailyGoalMinutes: v)),
            ),
          ),
          Divider(color: gp.border),
          row(
            'منطقه زمانی',
            'روزها و گزارش‌ها بر این اساس محاسبه می‌شوند',
            DropdownButton<String>(
              value: st.timezone,
              items: [for (final z in {st.timezone, ..._zones}) DropdownMenuItem(value: z, child: Text(z, textDirection: TextDirection.ltr))],
              onChanged: (v) => save(st.copyWith(timezone: v)),
            ),
          ),
        ]),
      ),
      const _Security(),
    ]);
  }
}

class _Security extends StatefulWidget {
  const _Security();
  @override
  State<_Security> createState() => _SecurityState();
}

class _SecurityState extends State<_Security> {
  final cur = TextEditingController();
  final next = TextEditingController();
  final again = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final auth = context.read<Deps>().auth;
    Widget pw(TextEditingController c, String l) =>
        SizedBox(width: 240, child: TextField(controller: c, obscureText: true, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: l)));
    return SectionCard(
      title: 'امنیت',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Wrap(spacing: 12, runSpacing: 12, children: [pw(cur, 'رمز فعلی'), pw(next, 'رمز جدید (حداقل ۱۰)'), pw(again, 'تکرار رمز جدید')]),
        const SizedBox(height: 14),
        Wrap(alignment: WrapAlignment.end, spacing: 10, runSpacing: 10, children: [
          OutlinedButton(
            onPressed: () => run(context, () async {
              final n = await auth.logoutOthers();
              if (context.mounted) toast(context, '$n نشست دیگر بسته شد');
            }),
            child: const Text('خروج از دستگاه‌های دیگر'),
          ),
          FilledButton(
            onPressed: () {
              if (next.text != again.text) return toast(context, 'تکرار رمز یکسان نیست', error: true);
              run(context, () async {
                await auth.changePassword(cur.text, next.text);
                cur.clear();
                next.clear();
                again.clear();
              }, ok: 'رمز عوض شد و بقیه دستگاه‌ها خارج شدند');
            },
            child: const Text('تغییر رمز'),
          ),
        ]),
      ]),
    );
  }
}

class ProfileView extends StatefulWidget {
  const ProfileView({super.key});
  @override
  State<ProfileView> createState() => _ProfileViewState();
}

class _ProfileViewState extends State<ProfileView> {
  late final name = TextEditingController(text: context.read<SessionViewModel>().user!.name);
  late final stats = context.read<Deps>().stats.daily();

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SessionViewModel>();
    final u = s.user!;
    final gp = context.gp;
    return GpPage(title: 'پروفایل', children: [
      SectionCard(
        child: Row(children: [
          CircleAvatar(
            radius: 36,
            backgroundColor: gp.levels[2],
            child: Text(u.name.characters.first, style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: Theme.of(context).colorScheme.primary)),
          ),
          const SizedBox(width: 18),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(u.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              Text(u.email, textDirection: TextDirection.ltr, style: TextStyle(color: gp.muted)),
              Text('عضو از ${fmtDay(dayKey(u.createdAt), year: true)}', style: TextStyle(color: gp.muted, fontSize: 12)),
            ]),
          ),
          OutlinedButton.icon(onPressed: s.logout, icon: const Icon(Icons.logout, size: 18), label: const Text('خروج')),
        ]),
      ),
      FutureBuilder(
        future: stats,
        builder: (c, snap) {
          if (!snap.hasData) return const SizedBox();
          final d = snap.data!;
          final sum = summarize(d.days, d.today);
          final hours = d.days.fold(0, (a, x) => a + x.seconds) ~/ 3600;
          final done = d.days.fold(0, (a, x) => a + x.done);
          return Wrap(spacing: 12, runSpacing: 12, children: [
            for (final (l, v) in [
              ('ساعت ثبت‌شده (یک سال)', '$hours'),
              ('تسک انجام‌شده', '$done'),
              ('مجموع مشارکت', '${sum.total}'),
              ('طولانی‌ترین تداوم', '${sum.longest?.length ?? 0} روز'),
            ])
              SizedBox(
                width: 200,
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(l, style: TextStyle(color: gp.muted, fontSize: 12.5)),
                      Text(v, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: gp.accent)),
                    ]),
                  ),
                ),
              ),
          ]);
        },
      ),
      SectionCard(
        child: Row(children: [
          Expanded(child: TextField(controller: name, decoration: const InputDecoration(labelText: 'نام نمایشی'))),
          const SizedBox(width: 12),
          FilledButton(onPressed: () => run(context, () => s.updateName(name.text.trim()), ok: 'پروفایل ذخیره شد'), child: const Text('ذخیره')),
        ]),
      ),
    ]);
  }
}
