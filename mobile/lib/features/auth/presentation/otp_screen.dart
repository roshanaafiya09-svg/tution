import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../l10n/gen/app_localizations.dart';
import '../../../widgets/widgets.dart';
import '../application/auth_controller.dart';
import '../data/auth_models.dart';

/// 6-digit OTP entry. The role picker and phone field only appear once
/// a bare verify comes back signalling there's no account yet
/// ([AuthState.needsSignup]) — a returning user is never asked to
/// re-enter a phone number just to sign back in. `phone_e164` is still
/// NOT NULL on the backend, so a phone is required exactly once, at
/// account creation, same as the web app's signup step.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _formKey = GlobalKey<FormState>();
  final _codeController = TextEditingController();
  final _phoneController = TextEditingController();
  SignupRole _signupRole = SignupRole.student;

  @override
  void dispose() {
    _codeController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final needsSignup = ref.read(authControllerProvider).needsSignup;
    ref
        .read(authControllerProvider.notifier)
        .verifyOtp(
          _codeController.text.trim(),
          signupRole: needsSignup ? _signupRole : null,
          phoneForSignup: needsSignup ? '+91${_phoneController.text.trim()}' : null,
        );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final authState = ref.watch(authControllerProvider);
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () =>
              ref.read(authControllerProvider.notifier).cancelOtp(),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(DesignTokens.pageGutter),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(l10n.enterCodeTitle, style: theme.textTheme.headlineMedium),
                  const SizedBox(height: 8),
                  Text(
                    l10n.codeSentTo(authState.identifier ?? ''),
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(
                        alpha: 0.7,
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),
                  AppCard(
                    elevated: true,
                    padding: const EdgeInsets.symmetric(
                      horizontal: DesignTokens.spacing4,
                      vertical: DesignTokens.spacing5,
                    ),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          TextFormField(
                            controller: _codeController,
                            keyboardType: TextInputType.number,
                            autofillHints: const [AutofillHints.oneTimeCode],
                            maxLength: 6,
                            textAlign: TextAlign.center,
                            style: theme.textTheme.headlineSmall?.copyWith(
                              letterSpacing: 8,
                            ),
                            decoration: const InputDecoration(
                              counterText: '',
                              border: InputBorder.none,
                            ),
                            validator: (value) {
                              if (value == null || value.trim().length != 6) {
                                return l10n.otpCodeError;
                              }
                              return null;
                            },
                            onFieldSubmitted: (_) => _submit(),
                          ),
                          if (authState.needsSignup) ...[
                            const SizedBox(height: 8),
                            TextFormField(
                              controller: _phoneController,
                              keyboardType: TextInputType.phone,
                              autofillHints: const [
                                AutofillHints.telephoneNumber,
                              ],
                              decoration: InputDecoration(
                                labelText: l10n.signupPhoneLabel,
                                prefixText: '+91  ',
                                hintText: '98765 43210',
                              ),
                              validator: (value) {
                                final digits = value?.trim() ?? '';
                                if (digits.length != 10 ||
                                    int.tryParse(digits) == null) {
                                  return l10n.signupPhoneError;
                                }
                                return null;
                              },
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  if (authState.needsSignup) ...[
                    const SizedBox(height: 20),
                    Text(
                      l10n.newHerePrompt,
                      style: theme.textTheme.bodySmall,
                    ),
                    const SizedBox(height: 8),
                    SegmentedButton<SignupRole>(
                      segments: [
                        ButtonSegment(
                          value: SignupRole.student,
                          label: Text(l10n.roleStudent),
                          icon: const Icon(Icons.school_outlined),
                        ),
                        ButtonSegment(
                          value: SignupRole.tutor,
                          label: Text(l10n.roleTutor),
                          icon: const Icon(Icons.person_outline),
                        ),
                      ],
                      selected: {_signupRole},
                      onSelectionChanged: (selection) =>
                          setState(() => _signupRole = selection.first),
                    ),
                  ],
                  if (authState.error != null) ...[
                    const SizedBox(height: 16),
                    FormErrorBanner(message: authState.error!),
                  ],
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: authState.isSubmitting ? null : _submit,
                    child: authState.isSubmitting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(l10n.verifyAndContinue),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
