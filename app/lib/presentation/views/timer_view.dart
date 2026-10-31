import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme.dart';
import '../../di.dart';
import '../../domain/dates.dart';
import '../../domain/entities.dart';
import '../../domain/report.dart';
import '../viewmodels/session_vm.dart';
import '../widgets/common.dart';
import 'task_sheet.dart';

/// Focus screen for the running timer, or a task picker to start one.
class TimerView extends StatelessWidget {
  const TimerView({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SessionViewModel>();
    return s.timer == null ? const _Idle() : _Running(timer: s.timer!);
  }
}

/// Opens the timer as a full page (used from the timer bar on wide layouts).
Future<void> openTimer(BuildContext context) =>
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => Scaffold(appBar: AppBar(), body: const SafeArea(child: TimerView()))));

class _Running extends StatefulWidget {
  const _Running({required this.timer});
  final Worklog timer;
  @override
  State<_Running> createState() => _RunningState();
}

class _RunningState extends State<_Running> {
  final _note = TextEditingController();
  bool busy = false;

  Future<void> stop({required bool complete}) async {
    if (busy) return;
    setState(() => busy = true);
    await run(context, () => context.read<SessionViewModel>().stopTimer(note: _note.text.trim(), complete: complete),
        ok: complete ? 'لاگ ثبت و تسک تکمیل شد' : 'زمان کار ثبت شد');
    if (mounted) setState(() => busy = false);
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.timer;
    final gp = context.gp;
    final cs = Theme.of(context).colorScheme;
    final jira = context.watch<SessionViewModel>().jira;
    return LayoutBuilder(builder: (context, box) {
      final ring = math.min(280.0, math.min(box.maxWidth - 64, box.maxHeight * 0.45));
      return SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(children: [
              Text('فعالیت جاری', style: TextStyle(color: gp.muted, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              Text(t.label(jira), textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 0.5)),
              const SizedBox(height: 2),
              Text(t.taskTitle, textAlign: TextAlign.center, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
              Text(t.boardName, style: TextStyle(color: gp.muted, fontSize: 12)),
              const SizedBox(height: 28),
              Elapsed(
                start: t.startedAt,
                builder: (context, sec) => SizedBox.square(
                  dimension: ring,
                  child: CustomPaint(
                    painter: _RingPainter((sec % 3600) / 3600, gp.levels[0], gp.levels[3]),
                    child: Center(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Text(fmtClock(sec),
                            textDirection: TextDirection.ltr,
                            style: TextStyle(fontSize: ring * 0.17, fontWeight: FontWeight.w800, fontFeatures: const [FontFeature.tabularFigures()])),
                        Text('شروع ${fmtTime(t.startedAt)}', style: TextStyle(color: gp.muted, fontSize: 12)),
                      ]),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _note,
                maxLength: 1000,
                decoration: const InputDecoration(hintText: 'توضیح کاری که انجام شد (اختیاری)', counterText: ''),
              ),
              const SizedBox(height: 16),
              Row(children: [
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: gp.danger, foregroundColor: Colors.white, minimumSize: const Size(0, 54), shape: const StadiumBorder()),
                    onPressed: busy ? null : () => stop(complete: false),
                    child: const Text('توقف', style: TextStyle(fontSize: 16)),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: cs.primary, foregroundColor: cs.onPrimary, minimumSize: const Size(0, 54), shape: const StadiumBorder()),
                    onPressed: busy ? null : () => stop(complete: true),
                    child: const Text('تکمیل', style: TextStyle(fontSize: 16)),
                  ),
                ),
              ]),
              const SizedBox(height: 10),
              Text('«توقف» زمان را ثبت می‌کند؛ «تکمیل» علاوه بر ثبت زمان، تسک را به وضعیت انجام‌شده می‌برد.',
                  textAlign: TextAlign.center, style: TextStyle(color: gp.muted, fontSize: 11.5)),
              TextButton(onPressed: () => showTaskEditor(context, t.taskId), child: const Text('جزئیات و لاگ‌های این تسک')),
            ]),
          ),
        ),
      );
    });
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.value, this.track, this.color);
  final double value;
  final Color track;
  final Color color;

  @override
  void paint(Canvas c, Size s) {
    final stroke = s.width * 0.035;
    final rect = Rect.fromCircle(center: s.center(Offset.zero), radius: s.width / 2 - stroke);
    c.drawArc(rect, 0, math.pi * 2, false, Paint()
      ..color = track
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke);
    c.drawArc(rect, -math.pi / 2, math.pi * 2 * value, false, Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = stroke);
  }

  @override
  bool shouldRepaint(_RingPainter o) => o.value != value || o.color != color;
}

/// No timer running: pick an open task to start, or log time by hand.
class _Idle extends StatefulWidget {
  const _Idle();
  @override
  State<_Idle> createState() => _IdleState();
}

class _IdleState extends State<_Idle> {
  late Future<List<Task>> tasks;
  int? _version;
  String q = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final v = context.watch<SessionViewModel>().version;
    if (_version != v) tasks = context.read<Deps>().tasks.list(openOnly: true);
    _version = v;
  }

  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    final s = context.watch<SessionViewModel>();
    return FutureBuilder<List<Task>>(
      future: tasks,
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(snap.error.toString(), style: TextStyle(color: gp.danger)),
              TextButton(onPressed: () => setState(() => tasks = context.read<Deps>().tasks.list(openOnly: true)), child: const Text('تلاش دوباره')),
            ]),
          );
        }
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final today = dayKey(DateTime.now());
        final list = snap.data!
            .where((t) => q.isEmpty || t.title.contains(q) || t.key.toLowerCase().contains(q.toLowerCase()) || t.jiraKey.toLowerCase().contains(q.toLowerCase()))
            .toList()
          ..sort((a, b) {
            int rank(Task t) => switch (dueState(t, today)) { DueState.overdue => 0, DueState.today || DueState.soon => 1, _ => 2 };
            return rank(a) != rank(b) ? rank(a) - rank(b) : b.priority - a.priority;
          });
        return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 40), children: [
          const Text('ثبت فعالیت', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          Text('تایمر را روی یک تسک شروع کنید یا زمان را دستی ثبت کنید.', style: TextStyle(color: gp.muted)),
          const SizedBox(height: 14),
          TextField(
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'جستجوی تسک'),
            onChanged: (v) => setState(() => q = v.trim()),
          ),
          const SizedBox(height: 12),
          if (list.isEmpty)
            Padding(padding: const EdgeInsets.all(24), child: Text('کار بازی پیدا نشد.', textAlign: TextAlign.center, style: TextStyle(color: gp.muted))),
          for (final t in list)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: BorderSide(color: dueColor(context, t) ?? gp.border, width: dueColor(context, t) == null ? 1 : 1.5),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [KeyChip(t.label(s.jira)), DueChip(t)]),
                      const SizedBox(height: 4),
                      Text(t.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                      Text('${t.boardName} · ${fmtDuration(t.loggedSeconds, short: true)}', style: TextStyle(color: gp.muted, fontSize: 12)),
                    ]),
                  ),
                  IconButton(tooltip: 'ثبت دستی', icon: Icon(Icons.edit_calendar_outlined, color: gp.muted), onPressed: () => showTaskEditor(context, t.id, logs: true)),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 40), shape: const StadiumBorder()),
                    onPressed: () => run(context, () => s.startTimer(t.id), ok: 'تایمر شروع شد'),
                    icon: const Icon(Icons.play_arrow_rounded, size: 18),
                    label: const Text('شروع'),
                  ),
                ]),
              ),
            ),
        ]);
      },
    );
  }
}
