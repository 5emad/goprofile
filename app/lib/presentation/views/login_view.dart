import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme.dart';
import '../viewmodels/session_vm.dart';
import '../widgets/common.dart';

class LoginView extends StatefulWidget {
  const LoginView({super.key});
  @override
  State<LoginView> createState() => _LoginViewState();
}

class _LoginViewState extends State<LoginView> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool register = false;
  bool busy = false;
  String? error;

  Future<void> submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    final s = context.read<SessionViewModel>();
    try {
      register ? await s.register(_name.text.trim(), _email.text.trim(), _pass.text) : await s.login(_email.text.trim(), _pass.text);
    } catch (e) {
      setState(() => error = e.toString());
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final gp = context.gp;
    return Scaffold(
      body: Stack(children: [
        Positioned.fill(
          child: Opacity(
            opacity: 0.5,
            child: Transform.rotate(
              angle: -0.14,
              child: Transform.scale(
                scale: 1.4,
                child: GridView.count(
                  crossAxisCount: 18,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  physics: const NeverScrollableScrollPhysics(),
                  children: List.generate(18 * 14, (i) {
                    const pattern = [0, 0, 1, 0, 2, 0, 3, 1, 0, 4, 2, 0];
                    return DecoratedBox(
                      decoration: BoxDecoration(color: gp.levels[pattern[(i * 7 + (i >> 3)) % 12]], borderRadius: BorderRadius.circular(6)),
                    );
                  }),
                ),
              ),
            ),
          ),
        ),
        Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Card(
                elevation: 12,
                shadowColor: Colors.black26,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22), side: BorderSide(color: gp.border)),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(28, 32, 28, 24),
                  child: Form(
                    key: _form,
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      const Center(child: GpLogo(size: 56)),
                      const SizedBox(height: 14),
                      Text(register ? 'ساخت حساب' : 'خوش برگشتی',
                          textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                      Text('کارهایت را ثبت کن، زمانت را لاگ بزن و رشدت را ببین.', textAlign: TextAlign.center, style: TextStyle(color: gp.muted)),
                      const SizedBox(height: 18),
                      if (register) ...[
                        TextFormField(
                          controller: _name,
                          decoration: const InputDecoration(labelText: 'نام'),
                          validator: (v) => (v ?? '').trim().isEmpty ? 'نام را وارد کنید' : null,
                        ),
                        const SizedBox(height: 12),
                      ],
                      TextFormField(
                        controller: _email,
                        textDirection: TextDirection.ltr,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        decoration: const InputDecoration(labelText: 'ایمیل'),
                        validator: (v) => (v ?? '').contains('@') ? null : 'ایمیل معتبر نیست',
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _pass,
                        obscureText: true,
                        textDirection: TextDirection.ltr,
                        autofillHints: [register ? AutofillHints.newPassword : AutofillHints.password],
                        decoration: InputDecoration(labelText: 'رمز عبور', helperText: register ? 'حداقل ۱۰ کاراکتر' : null),
                        validator: (v) => register && (v ?? '').length < 10 ? 'حداقل ۱۰ کاراکتر' : ((v ?? '').isEmpty ? 'رمز را وارد کنید' : null),
                        onFieldSubmitted: (_) => submit(),
                      ),
                      if (error != null) ...[
                        const SizedBox(height: 12),
                        Text(error!, style: TextStyle(color: gp.danger, fontWeight: FontWeight.w600)),
                      ],
                      const SizedBox(height: 18),
                      FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'لطفاً صبر کنید…' : (register ? 'ثبت‌نام' : 'ورود'))),
                      TextButton(
                        onPressed: () => setState(() => register = !register),
                        child: Text(register ? 'حساب داری؟ وارد شو' : 'حساب نداری؟ ثبت‌نام کن'),
                      ),
                      Text('🔒 همه داده‌ها با رمزنگاری کلید عمومی/خصوصی منتقل می‌شوند',
                          textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, color: gp.muted)),
                    ]),
                  ),
                ),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}
