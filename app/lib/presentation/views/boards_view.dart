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
import 'task_sheet.dart';

const _swatches = ['#4f6a32', '#6f8f45', '#8aa665', '#3d5a6c', '#7a5c3a', '#8a4b4b', '#5b4a7a', '#2f3a24'];

class BoardsView extends StatefulWidget {
  const BoardsView({super.key});
  @override
  State<BoardsView> createState() => _BoardsViewState();
}

class _BoardsViewState extends State<BoardsView> {
  int? open;

  @override
  Widget build(BuildContext context) {
    if (open != null) return BoardView(boardId: open!, onBack: () => setState(() => open = null));
    return Reloading<BoardsViewModel>(
      create: (d) => BoardsViewModel(d.boards),
      builder: (context, vm) => GpPage(
        title: 'کارتابل‌ها',
        sub: 'هر کارتابل وضعیت‌ها، فازها، Epicها و دسته‌بندی‌های خودش را دارد',
        actions: [FilledButton.icon(onPressed: () => _create(context, vm), icon: const Icon(Icons.add, size: 18), label: const Text('کارتابل جدید'))],
        children: [
          Wrap(spacing: 14, runSpacing: 14, children: [
            for (final b in vm.boards)
              SizedBox(
                width: 280,
                child: Card(
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => setState(() => open = b.id),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Container(height: 4, color: hexColor(b.color, context.gp.accent)),
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(b.key, textDirection: TextDirection.ltr, style: TextStyle(color: context.gp.muted, fontWeight: FontWeight.w800, fontSize: 12)),
                          Text(b.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                          const SizedBox(height: 8),
                          Text('${b.openCount} باز · ${b.taskCount - b.openCount} انجام‌شده · ${b.epics.length} Epic · ${b.phases.length} فاز',
                              style: TextStyle(color: context.gp.muted, fontSize: 12)),
                          const SizedBox(height: 10),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(99),
                            child: LinearProgressIndicator(
                              minHeight: 6,
                              value: b.taskCount == 0 ? 0 : (b.taskCount - b.openCount) / b.taskCount,
                              color: context.gp.levels[3],
                              backgroundColor: context.gp.levels[0],
                            ),
                          ),
                        ]),
                      ),
                    ]),
                  ),
                ),
              ),
          ]),
        ],
      ),
    );
  }

  Future<void> _create(BuildContext context, BoardsViewModel vm) async {
    final name = TextEditingController();
    final key = TextEditingController();
    var color = _swatches.first;
    final b = await showDialog<Board>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => AlertDialog(
          title: const Text('کارتابل جدید'),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            TextField(controller: name, autofocus: true, decoration: const InputDecoration(labelText: 'نام کارتابل')),
            const SizedBox(height: 12),
            TextField(
              controller: key,
              textDirection: TextDirection.ltr,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'کلید', helperText: 'مثل WEB → WEB-12'),
            ),
            const SizedBox(height: 12),
            Wrap(spacing: 8, children: [
              for (final s in _swatches)
                GestureDetector(
                  onTap: () => set(() => color = s),
                  child: Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: hexColor(s, Colors.green),
                      borderRadius: BorderRadius.circular(9),
                      border: Border.all(color: color == s ? Theme.of(c).colorScheme.onSurface : Colors.transparent, width: 2),
                    ),
                  ),
                ),
            ]),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c), child: const Text('انصراف')),
            FilledButton(
              onPressed: () => run(c, () async {
                final b = await vm.create(name.text.trim(), key.text.trim().toUpperCase(), color);
                if (c.mounted) Navigator.pop(c, b);
              }),
              child: const Text('ساخت'),
            ),
          ],
        ),
      ),
    );
    if (b != null) setState(() => open = b.id);
  }
}

class BoardView extends StatelessWidget {
  const BoardView({super.key, required this.boardId, required this.onBack});
  final int boardId;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final jira = context.watch<SessionViewModel>().jira;
    return Reloading<BoardViewModel>(
      create: (d) => BoardViewModel(boardId, d.boards, d.tasks),
      builder: (context, vm) {
        final b = vm.board!;
        return DefaultTabController(
          length: 2,
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 12, 16, 0),
              child: Row(children: [
                IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_forward)),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(b.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                    Text('${vm.tasks.length} تسک · کلید ${b.key}', style: TextStyle(color: context.gp.muted, fontSize: 12)),
                  ]),
                ),
                FilledButton.icon(onPressed: () => showTaskCreate(context, boardId: b.id), icon: const Icon(Icons.add, size: 18), label: const Text('تسک')),
              ]),
            ),
            const TabBar(tabs: [Tab(text: 'کارتابل'), Tab(text: 'دسته‌بندی‌ها')]),
            Expanded(
              child: TabBarView(children: [
                _Kanban(vm: vm, jira: jira),
                _MetaEditor(vm: vm),
              ]),
            ),
          ]),
        );
      },
    );
  }
}

class _Kanban extends StatelessWidget {
  const _Kanban({required this.vm, required this.jira});
  final BoardViewModel vm;
  final bool jira;

  @override
  Widget build(BuildContext context) {
    final b = vm.board!;
    final gp = context.gp;
    final desktop = MediaQuery.sizeOf(context).width >= 860;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
        child: Wrap(spacing: 10, runSpacing: 10, children: [
          SizedBox(
            width: 260,
            child: TextField(
              onChanged: (v) => vm.setFilter(q: v),
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search, size: 18), hintText: 'جستجو در عنوان یا شماره…'),
            ),
          ),
          for (final (label, list, value, apply) in [
            ('همه Epicها', b.epics, vm.epic, (int? v) => vm.setFilter(clear: true, epic: v, phase: vm.phase, category: vm.category)),
            ('همه فازها', b.phases, vm.phase, (int? v) => vm.setFilter(clear: true, epic: vm.epic, phase: v, category: vm.category)),
            ('همه دسته‌ها', b.categories, vm.category, (int? v) => vm.setFilter(clear: true, epic: vm.epic, phase: vm.phase, category: v)),
          ])
            SizedBox(
              width: 170,
              child: DropdownButtonFormField<int?>(
                initialValue: value,
                isExpanded: true,
                items: [DropdownMenuItem(value: null, child: Text(label)), for (final m in list) DropdownMenuItem(value: m.id, child: Text(m.name))],
                onChanged: apply,
              ),
            ),
        ]),
      ),
      Expanded(
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.all(12),
          children: [
            for (final s in b.statuses)
              DragTarget<Task>(
                onAcceptWithDetails: (d) => run(context, () async {
                  await vm.move(d.data, s.id, null);
                  if (context.mounted) context.read<SessionViewModel>().bump();
                }),
                builder: (context, cand, _) {
                  final tasks = vm.column(s.id);
                  return Container(
                    width: 290,
                    margin: const EdgeInsets.symmetric(horizontal: 6),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: cand.isNotEmpty ? gp.levels[1].withValues(alpha: 0.5) : gp.surface2,
                      border: Border.all(color: cand.isNotEmpty ? gp.levels[3] : gp.border),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(6, 2, 6, 10),
                        child: Row(children: [
                          if (s.isDone) Icon(Icons.check, size: 16, color: gp.accent),
                          Expanded(child: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w700))),
                          Text('${tasks.length}', style: TextStyle(color: gp.muted)),
                        ]),
                      ),
                      Expanded(
                        child: tasks.isEmpty
                            ? Center(child: Text('تسکی اینجا نیست', style: TextStyle(color: gp.muted, fontSize: 12)))
                            : ListView(children: [
                                for (final t in tasks)
                                  desktop
                                      ? Draggable<Task>(data: t, feedback: _feedback(context, t), childWhenDragging: Opacity(opacity: 0.4, child: _TaskCard(t, b, jira)), child: _TaskCard(t, b, jira))
                                      : LongPressDraggable<Task>(data: t, feedback: _feedback(context, t), childWhenDragging: Opacity(opacity: 0.4, child: _TaskCard(t, b, jira)), child: _TaskCard(t, b, jira)),
                              ]),
                      ),
                    ]),
                  );
                },
              ),
          ],
        ),
      ),
    ]);
  }

  Widget _feedback(BuildContext context, Task t) => Material(
        elevation: 8,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(width: 270, child: _TaskCard(t, vm.board!, jira)),
      );
}

class _TaskCard extends StatelessWidget {
  const _TaskCard(this.t, this.board, this.jira);
  final Task t;
  final Board board;
  final bool jira;

  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    final epic = board.epics.where((e) => e.id == t.epicId).firstOrNull;
    final cat = board.categories.where((e) => e.id == t.categoryId).firstOrNull;
    final phase = board.phases.where((e) => e.id == t.phaseId).firstOrNull;
    final prio = switch (t.priority) { 4 => gp.danger, 3 => const Color(0xFFC49A3A), 2 => gp.levels[1], _ => gp.levels[0] };
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: t.running ? gp.levels[3] : gp.border, width: t.running ? 2 : 1),
      ),
      child: InkWell(
        onTap: () => showTaskEditor(context, t.id),
        child: Container(
          decoration: BoxDecoration(border: BorderDirectional(start: BorderSide(color: prio, width: 3))),
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [KeyChip(t.label(jira)), const Spacer(), TimerButton(taskId: t.id)]),
            const SizedBox(height: 6),
            Text(t.title, style: const TextStyle(fontWeight: FontWeight.w500)),
            const SizedBox(height: 6),
            Wrap(spacing: 6, runSpacing: 4, children: [
              if (epic != null) MetaChip(epic, icon: Icons.layers_outlined),
              if (cat != null) MetaChip(cat, icon: Icons.sell_outlined),
              if (phase != null) MetaChip(phase),
            ]),
            if (t.loggedSeconds > 0)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  '⏱ ${fmtDuration(t.loggedSeconds, short: true)}${t.estimateMinutes > 0 ? ' / ${fmtDuration(t.estimateMinutes * 60, short: true)}' : ''}',
                  style: TextStyle(color: gp.accent, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}

class _MetaEditor extends StatelessWidget {
  const _MetaEditor({required this.vm});
  final BoardViewModel vm;

  static const _labels = {
    MetaKind.statuses: 'وضعیت‌ها (ستون‌ها)',
    MetaKind.phases: 'فازها',
    MetaKind.epics: 'Epicها',
    MetaKind.categories: 'دسته‌بندی‌ها',
  };

  @override
  Widget build(BuildContext context) {
    final b = vm.board!;
    final repo = context.read<Deps>().boards;
    final gp = context.gp;
    Future<void> apply(Future<Board> f) => run(context, () async {
          await vm.setBoard(f);
          if (context.mounted) context.read<SessionViewModel>().bump();
        });
    return ListView(padding: const EdgeInsets.all(16), children: [
      Wrap(spacing: 14, runSpacing: 14, children: [
        for (final kind in MetaKind.values)
          SizedBox(
            width: 340,
            child: SectionCard(
              title: _labels[kind],
              child: Column(children: [
                for (final m in b.of(kind))
                  Row(children: [
                    if (kind == MetaKind.epics || kind == MetaKind.categories)
                      PopupMenuButton<String>(
                        tooltip: 'رنگ',
                        onSelected: (c) => apply(repo.updateMeta(b.id, kind, m.id, color: c)),
                        itemBuilder: (_) => [
                          for (final s in _swatches) PopupMenuItem(value: s, child: Container(width: 60, height: 20, color: hexColor(s, Colors.green))),
                        ],
                        child: Container(width: 22, height: 22, decoration: BoxDecoration(color: hexColor(m.color, gp.muted), borderRadius: BorderRadius.circular(6))),
                      ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextFormField(
                        initialValue: m.name,
                        decoration: const InputDecoration(border: InputBorder.none, enabledBorder: InputBorder.none, filled: false),
                        onFieldSubmitted: (v) => v.trim().isNotEmpty && v != m.name ? apply(repo.updateMeta(b.id, kind, m.id, name: v.trim())) : null,
                      ),
                    ),
                    if (kind == MetaKind.statuses)
                      Tooltip(
                        message: 'تسک‌های این ستون انجام‌شده حساب شوند',
                        child: Checkbox(value: m.isDone, onChanged: (v) => apply(repo.updateMeta(b.id, kind, m.id, isDone: v))),
                      ),
                    IconButton(icon: Icon(Icons.delete_outline, size: 18, color: gp.danger), onPressed: () => apply(repo.removeMeta(b.id, kind, m.id))),
                  ]),
                _AddMeta(onAdd: (name) => apply(repo.addMeta(b.id, kind, name))),
              ]),
            ),
          ),
      ]),
    ]);
  }
}

class _AddMeta extends StatefulWidget {
  const _AddMeta({required this.onAdd});
  final Future<void> Function(String) onAdd;
  @override
  State<_AddMeta> createState() => _AddMetaState();
}

class _AddMetaState extends State<_AddMeta> {
  final c = TextEditingController();
  Future<void> add() async {
    if (c.text.trim().isEmpty) return;
    await widget.onAdd(c.text.trim());
    c.clear();
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Row(children: [
          Expanded(child: TextField(controller: c, decoration: const InputDecoration(hintText: 'افزودن…'), onSubmitted: (_) => add())),
          const SizedBox(width: 8),
          IconButton.filledTonal(onPressed: add, icon: const Icon(Icons.add)),
        ]),
      );
}
