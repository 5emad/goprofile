import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme.dart';
import '../../di.dart';
import '../../domain/dates.dart';
import '../../domain/entities.dart';
import '../viewmodels/screen_vms.dart';
import '../viewmodels/session_vm.dart';
import '../widgets/common.dart';
import 'dashboard_view.dart';

Future<void> _sheet(BuildContext context, Widget child) {
  final wide = MediaQuery.sizeOf(context).width >= 860;
  if (wide) {
    return showDialog(
      context: context,
      builder: (_) => Dialog(
        insetPadding: const EdgeInsets.all(24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 820, maxHeight: 760), child: child),
      ),
    );
  }
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => FractionallySizedBox(heightFactor: 0.94, child: child),
  );
}

Future<void> showTaskCreate(BuildContext context, {int? boardId}) => _sheet(context, _CreateTask(boardId: boardId));

Future<void> showTaskEditor(BuildContext context, int taskId) => _sheet(context, _EditTask(taskId: taskId));

class _CreateTask extends StatefulWidget {
  const _CreateTask({this.boardId});
  final int? boardId;
  @override
  State<_CreateTask> createState() => _CreateTaskState();
}

class _CreateTaskState extends State<_CreateTask> {
  List<Board>? boards;

  @override
  void initState() {
    super.initState();
    context.read<Deps>().boards.list().then((b) => mounted ? setState(() => boards = b) : null);
  }

  @override
  Widget build(BuildContext context) {
    if (boards == null) return const SizedBox(height: 200, child: Center(child: CircularProgressIndicator()));
    return _Scaffolded(
      title: 'ایجاد تسک',
      child: TaskForm(
        boards: boards!,
        draft: TaskDraft(boardId: widget.boardId ?? (boards!.isEmpty ? null : boards!.first.id)),
        submitLabel: 'ساخت تسک',
        onSubmit: (d) async {
          final t = await context.read<Deps>().tasks.create(d);
          if (!context.mounted) return;
          context.read<SessionViewModel>().bump();
          Navigator.pop(context);
          toast(context, 'تسک ${t.key} ساخته شد');
        },
      ),
    );
  }
}

class _Scaffolded extends StatelessWidget {
  const _Scaffolded({required this.title, required this.child, this.actions = const []});
  final String title;
  final Widget child;
  final List<Widget> actions;
  @override
  Widget build(BuildContext context) => Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 12, 8),
          child: Row(children: [
            Expanded(child: Text(title, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
            ...actions,
            IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
          ]),
        ),
        Divider(height: 1, color: context.gp.border),
        Expanded(child: SingleChildScrollView(padding: const EdgeInsets.all(20), child: child)),
      ]);
}

class TaskForm extends StatefulWidget {
  const TaskForm({super.key, required this.boards, required this.draft, required this.onSubmit, required this.submitLabel, this.lockBoard = false});
  final List<Board> boards;
  final TaskDraft draft;
  final Future<void> Function(TaskDraft) onSubmit;
  final String submitLabel;
  final bool lockBoard;
  @override
  State<TaskForm> createState() => _TaskFormState();
}

class _TaskFormState extends State<TaskForm> {
  late final d = widget.draft;
  late final _title = TextEditingController(text: d.title);
  late final _desc = TextEditingController(text: d.description);
  late final _jira = TextEditingController(text: d.jiraKey);
  late final _est = TextEditingController(text: d.estimateMinutes == 0 ? '' : '${d.estimateMinutes}');
  bool busy = false;
  String? error;

  Board? get board => widget.boards.where((b) => b.id == d.boardId).firstOrNull;

  Widget _drop(String label, int? value, List<Meta> items, String empty, void Function(int?) set) => DropdownButtonFormField<int?>(
        key: ValueKey('$label${d.boardId}'),
        initialValue: items.any((m) => m.id == value) ? value : null,
        isExpanded: true,
        decoration: InputDecoration(labelText: label),
        items: [DropdownMenuItem(value: null, child: Text(empty)), for (final m in items) DropdownMenuItem(value: m.id, child: Text(m.name))],
        onChanged: (v) => setState(() => set(v)),
      );

  Future<void> submit() async {
    d
      ..title = _title.text.trim()
      ..description = _desc.text
      ..jiraKey = _jira.text.trim()
      ..estimateMinutes = int.tryParse(_est.text) ?? 0;
    if (d.boardId == null || d.title.isEmpty) return setState(() => error = 'کارتابل و عنوان را وارد کنید');
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.onSubmit(d);
    } catch (e) {
      error = e.toString();
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final jira = context.watch<SessionViewModel>().jira;
    final b = board;
    Widget pair(Widget a, Widget c) => Row(children: [Expanded(child: a), const SizedBox(width: 12), Expanded(child: c)]);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      pair(
        DropdownButtonFormField<int>(
          initialValue: d.boardId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'کارتابل'),
          items: [for (final b in widget.boards) DropdownMenuItem(value: b.id, child: Text('${b.name} (${b.key})'))],
          onChanged: widget.lockBoard
              ? null
              : (v) => setState(() => d
                ..boardId = v
                ..statusId = null
                ..phaseId = null
                ..epicId = null
                ..categoryId = null),
        ),
        jira
            ? TextField(controller: _jira, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'شماره تسک جیرا', hintText: 'PROJ-123'))
            : const SizedBox(),
      ),
      const SizedBox(height: 14),
      TextField(controller: _title, maxLength: 300, decoration: const InputDecoration(labelText: 'عنوان تسک', counterText: '')),
      const SizedBox(height: 14),
      TextField(controller: _desc, minLines: 4, maxLines: 10, decoration: const InputDecoration(labelText: 'توضیحات', alignLabelWithHint: true)),
      const SizedBox(height: 14),
      pair(_drop('وضعیت', d.statusId, b?.statuses ?? [], 'پیش‌فرض', (v) => d.statusId = v), _drop('فاز', d.phaseId, b?.phases ?? [], 'بدون فاز', (v) => d.phaseId = v)),
      const SizedBox(height: 14),
      pair(_drop('Epic', d.epicId, b?.epics ?? [], 'بدون Epic', (v) => d.epicId = v),
          _drop('دسته‌بندی', d.categoryId, b?.categories ?? [], 'بدون دسته', (v) => d.categoryId = v)),
      const SizedBox(height: 14),
      pair(
        DropdownButtonFormField<int>(
          initialValue: d.priority,
          decoration: const InputDecoration(labelText: 'اولویت'),
          items: [for (var i = 0; i < priorities.length; i++) DropdownMenuItem(value: i, child: Text(priorities[i]))],
          onChanged: (v) => setState(() => d.priority = v ?? 2),
        ),
        TextField(controller: _est, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'تخمین (دقیقه)')),
      ),
      const SizedBox(height: 14),
      OutlinedButton.icon(
        icon: const Icon(Icons.event_outlined, size: 18),
        label: Text(d.dueOn == null || d.dueOn!.isEmpty ? 'موعد: ندارد' : 'موعد: ${fmtDay(d.dueOn!, year: true)}'),
        onPressed: () async {
          final v = await pickJalaliDate(context, d.dueOn);
          if (v != null) setState(() => d.dueOn = v.isEmpty ? null : v);
        },
      ),
      if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: TextStyle(color: context.gp.danger))),
      const SizedBox(height: 18),
      Align(alignment: AlignmentDirectional.centerEnd, child: FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'در حال ذخیره…' : widget.submitLabel))),
    ]);
  }
}

class _EditTask extends StatelessWidget {
  const _EditTask({required this.taskId});
  final int taskId;

  @override
  Widget build(BuildContext context) {
    final jira = context.watch<SessionViewModel>().jira;
    return Reloading<TaskEditorViewModel>(
      create: (d) => TaskEditorViewModel(taskId, d.tasks, d.worklogs),
      builder: (context, vm) {
        final t = vm.task!;
        return DefaultTabController(
          length: 2,
          child: _Scaffolded(
            title: '${t.label(jira)} · ${t.title}',
            actions: [
              TimerButton(taskId: t.id),
              IconButton(
                tooltip: 'حذف تسک',
                icon: Icon(Icons.delete_outline, color: context.gp.danger),
                onPressed: () async {
                  final ok = await showDialog<bool>(
                    context: context,
                    builder: (c) => AlertDialog(
                      content: const Text('این تسک و همه لاگ‌هایش حذف شود؟'),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('انصراف')),
                        FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('حذف')),
                      ],
                    ),
                  );
                  if (ok != true || !context.mounted) return;
                  await run(context, () async {
                    await vm.remove();
                    if (!context.mounted) return;
                    context.read<SessionViewModel>().bump();
                    Navigator.pop(context);
                  }, ok: 'تسک حذف شد');
                },
              ),
            ],
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              TabBar(tabs: [const Tab(text: 'جزئیات'), Tab(text: 'لاگ زمان (${fmtDuration(t.loggedSeconds, short: true)})')]),
              const SizedBox(height: 16),
              SizedBox(
                height: 640,
                child: TabBarView(children: [
                  SingleChildScrollView(
                    child: _BoardsLoader(
                      builder: (boards) => TaskForm(
                        key: ValueKey(t.loggedSeconds ^ t.title.hashCode),
                        boards: boards,
                        lockBoard: true,
                        draft: TaskDraft.of(t),
                        submitLabel: 'ذخیره تغییرات',
                        onSubmit: (d) async {
                          await vm.save(d);
                          if (context.mounted) {
                            context.read<SessionViewModel>().bump();
                            toast(context, 'تسک ذخیره شد');
                          }
                        },
                      ),
                    ),
                  ),
                  SingleChildScrollView(child: _Logs(vm: vm)),
                ]),
              ),
            ]),
          ),
        );
      },
    );
  }
}

class _BoardsLoader extends StatelessWidget {
  const _BoardsLoader({required this.builder});
  final Widget Function(List<Board>) builder;
  @override
  Widget build(BuildContext context) => FutureBuilder(
        future: context.read<Deps>().boards.list(),
        builder: (c, s) => s.hasData ? builder(s.data!) : const Center(child: CircularProgressIndicator()),
      );
}

class _Logs extends StatefulWidget {
  const _Logs({required this.vm});
  final TaskEditorViewModel vm;
  @override
  State<_Logs> createState() => _LogsState();
}

class _LogsState extends State<_Logs> {
  String day = dayKey(DateTime.now());
  TimeOfDay time = const TimeOfDay(hour: 9, minute: 0);
  final _h = TextEditingController(text: '1');
  final _m = TextEditingController(text: '0');
  final _note = TextEditingController();

  Future<void> add() async {
    final minutes = (int.tryParse(_h.text) ?? 0) * 60 + (int.tryParse(_m.text) ?? 0);
    if (minutes < 1) return toast(context, 'مدت زمان را وارد کنید', error: true);
    final d = parseKey(day);
    await run(context, () async {
      await widget.vm.addLog(DateTime(d.year, d.month, d.day, time.hour, time.minute), minutes, _note.text.trim());
      _note.clear();
      if (mounted) context.read<SessionViewModel>().bump();
    }, ok: 'زمان ثبت شد');
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.vm.task!;
    final gp = context.gp;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: gp.surface2, border: Border.all(color: gp.border), borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('ثبت دستی زمان', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          Wrap(spacing: 10, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
            OutlinedButton.icon(
              icon: const Icon(Icons.event_outlined, size: 18),
              label: Text(fmtDay(day, year: true)),
              onPressed: () async {
                final v = await pickJalaliDate(context, day);
                if (v != null && v.isNotEmpty) setState(() => day = v);
              },
            ),
            OutlinedButton.icon(
              icon: const Icon(Icons.schedule, size: 18),
              label: Text(time.format(context)),
              onPressed: () async {
                final v = await showTimePicker(context: context, initialTime: time);
                if (v != null) setState(() => time = v);
              },
            ),
            SizedBox(width: 80, child: TextField(controller: _h, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'ساعت'))),
            SizedBox(width: 80, child: TextField(controller: _m, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'دقیقه'))),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: TextField(controller: _note, decoration: const InputDecoration(hintText: 'توضیح کاری که انجام شد (اختیاری)'))),
            const SizedBox(width: 10),
            FilledButton(onPressed: add, child: const Text('ثبت لاگ')),
          ]),
        ]),
      ),
      if (t.estimateMinutes > 0) ...[
        const SizedBox(height: 14),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(minHeight: 10, value: (t.loggedSeconds / 60 / t.estimateMinutes).clamp(0, 1), color: gp.levels[3], backgroundColor: gp.levels[0]),
        ),
        Text('${fmtDuration(t.loggedSeconds)} از ${fmtDuration(t.estimateMinutes * 60)}', style: TextStyle(color: gp.muted, fontSize: 12)),
      ],
      const SizedBox(height: 14),
      if (t.worklogs.isEmpty) Text('هنوز لاگی ثبت نشده است.', style: TextStyle(color: gp.muted)),
      for (final l in t.worklogs.reversed)
        Container(
          margin: const EdgeInsets.only(bottom: 6),
          decoration: BoxDecoration(
            border: Border.all(color: l.running ? gp.levels[3] : gp.border),
            borderRadius: BorderRadius.circular(10),
            color: l.running ? gp.levels[1].withValues(alpha: 0.3) : null,
          ),
          child: ListTile(
            leading: Icon(l.source == 'timer' ? Icons.timer_outlined : Icons.edit_outlined, color: gp.accent),
            title: Text(l.running ? 'در حال اجرا…' : fmtDuration(l.seconds), style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(
              '${fmtDayLong(dayKey(l.startedAt))} · ${fmtTime(l.startedAt)}${l.endedAt != null ? ' تا ${fmtTime(l.endedAt!)}' : ''}${l.note.isNotEmpty ? '\n${l.note}' : ''}',
              style: TextStyle(color: gp.muted, fontSize: 12),
            ),
            trailing: l.running
                ? null
                : IconButton(
                    icon: Icon(Icons.delete_outline, color: gp.danger),
                    onPressed: () => run(context, () async {
                      await widget.vm.removeLog(l.id);
                      if (context.mounted) context.read<SessionViewModel>().bump();
                    }),
                  ),
          ),
        ),
    ]);
  }
}
