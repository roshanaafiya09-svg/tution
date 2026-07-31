import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/network/providers.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../l10n/gen/app_localizations.dart';
import '../../auth/application/auth_controller.dart';
import '../data/account_api.dart';

final accountApiProvider = Provider<AccountApi>(
  (ref) => AccountApi(ref.watch(apiClientProvider)),
);

/// Blueprint §4 platform requirement: "in-app account deletion + data
/// export (DPDP + Apple requirement)". Mirrors the web dashboard's
/// profile-page "Your data" section.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _exporting = false;
  bool _deleting = false;
  bool _confirmingDelete = false;
  String? _error;

  Future<void> _exportData() async {
    setState(() {
      _exporting = true;
      _error = null;
    });
    try {
      final data = await ref.read(accountApiProvider).exportData();
      final dir = await getApplicationDocumentsDirectory();
      final path =
          '${dir.path}/tuition-app-data-export-${DateTime.now().toIso8601String().split('T').first}.json';
      await File(path).writeAsString(const JsonEncoder.withIndent('  ').convert(data));
      await OpenFilex.open(path);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _deleteAccount() async {
    setState(() {
      _deleting = true;
      _error = null;
    });
    try {
      await ref.read(accountApiProvider).deleteAccount();
      await ref.read(authControllerProvider.notifier).signOut();
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _deleting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(DesignTokens.pageGutter),
          children: [
            ListTile(
              leading: const Icon(Icons.logout),
              title: Text(l10n.signOut),
              onTap: () => ref.read(authControllerProvider.notifier).signOut(),
            ),
            const SizedBox(height: 24),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(DesignTokens.cardPadding),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l10n.accountSectionTitle, style: theme.textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(l10n.accountSectionBody, style: theme.textTheme.bodySmall),
                    const SizedBox(height: 16),
                    OutlinedButton(
                      onPressed: _exporting ? null : _exportData,
                      child: Text(_exporting ? l10n.preparingExport : l10n.exportMyData),
                    ),
                    const SizedBox(height: 8),
                    if (!_confirmingDelete)
                      OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: DesignTokens.error,
                          side: const BorderSide(color: DesignTokens.error),
                        ),
                        onPressed: () => setState(() => _confirmingDelete = true),
                        child: Text(l10n.deleteMyAccount),
                      )
                    else ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: DesignTokens.error.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(DesignTokens.radiusMd),
                        ),
                        child: Text(
                          l10n.deleteAccountWarning,
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: FilledButton(
                              style: FilledButton.styleFrom(
                                backgroundColor: DesignTokens.error,
                              ),
                              onPressed: _deleting ? null : _deleteAccount,
                              child: Text(
                                _deleting ? l10n.deleting : l10n.confirmDeleteAccount,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton(
                            onPressed: _deleting
                                ? null
                                : () => setState(() => _confirmingDelete = false),
                            child: Text(l10n.cancel),
                          ),
                        ],
                      ),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        _error!,
                        style: theme.textTheme.bodySmall?.copyWith(color: DesignTokens.error),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
