import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../l10n/gen/app_localizations.dart';
import '../../../widgets/widgets.dart';
import '../application/auth_controller.dart';

/// Phone entry — India-only at launch (blueprint §0/§1: Chennai/Tamil
/// Nadu), so the +91 prefix is fixed rather than a generic country picker.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final phoneE164 = '+91${_phoneController.text.trim()}';
    ref.read(authControllerProvider.notifier).requestOtp(phoneE164);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final authState = ref.watch(authControllerProvider);
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0, -0.6),
                  radius: 1.1,
                  colors: [
                    (isDark ? DesignTokens.brand900 : DesignTokens.brand50)
                        .withValues(alpha: isDark ? 0.5 : 0.7),
                    theme.colorScheme.surface,
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(DesignTokens.pageGutter),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const SizedBox(height: 32),
                      Text(
                        'Scholar',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.displayMedium?.copyWith(
                          color: theme.colorScheme.primary,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        l10n.appTagline,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyLarge?.copyWith(
                          color: theme.colorScheme.onSurface.withValues(
                            alpha: 0.7,
                          ),
                        ),
                      ),
                      const SizedBox(height: 48),
                      Form(
                        key: _formKey,
                        child: TextFormField(
                          controller: _phoneController,
                          keyboardType: TextInputType.phone,
                          autofillHints: const [AutofillHints.telephoneNumber],
                          style: theme.textTheme.bodyLarge,
                          decoration: InputDecoration(
                            labelText: l10n.mobileNumberLabel,
                            prefixText: '+91  ',
                            hintText: '98765 43210',
                          ),
                          validator: (value) {
                            final digits = value?.trim() ?? '';
                            if (digits.length != 10 ||
                                int.tryParse(digits) == null) {
                              return l10n.mobileNumberError;
                            }
                            return null;
                          },
                          onFieldSubmitted: (_) => _submit(),
                        ),
                      ),
                      if (authState.error != null) ...[
                        const SizedBox(height: 12),
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
                            : Text(l10n.sendOtp),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        l10n.otpDeliveryNote,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface.withValues(
                            alpha: 0.6,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
