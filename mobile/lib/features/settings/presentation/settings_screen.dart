import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/network/providers.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../l10n/gen/app_localizations.dart';
import '../../../widgets/widgets.dart';
import '../../auth/application/auth_controller.dart';
import '../data/account_api.dart';
import '../data/parent_links_api.dart';

final accountApiProvider = Provider<AccountApi>(
  (ref) => AccountApi(ref.watch(apiClientProvider)),
);

final parentLinksApiProvider = Provider<ParentLinksApi>(
  (ref) => ParentLinksApi(ref.watch(apiClientProvider)),
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
  bool _generatingInvite = false;
  String? _error;
  String? _inviteError;

  Future<void> _generateParentInvite() async {
    final l10n = AppLocalizations.of(context)!;
    setState(() {
      _generatingInvite = true;
      _inviteError = null;
    });
    String? token;
    String? error;
    try {
      token = await ref.read(parentLinksApiProvider).createInvite();
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      if (mounted) setState(() => _generatingInvite = false);
    }
    if (!mounted) return;
    if (error != null) {
      setState(() => _inviteError = error);
      return;
    }

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.parentInviteDialogTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SelectableText(
              token!,
              style: Theme.of(
                dialogContext,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Text(l10n.parentInviteDialogBody),
          ],
        ),
        actions: [
          TextButton.icon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: token!));
              if (dialogContext.mounted) {
                ScaffoldMessenger.of(
                  dialogContext,
                ).showSnackBar(SnackBar(content: Text(l10n.codeCopied)));
              }
            },
            icon: const Icon(CupertinoIcons.doc_on_clipboard, size: 16),
            label: Text(l10n.copyCode),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(l10n.close),
          ),
        ],
      ),
    );
  }

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

  Future<void> _confirmAndDeleteAccount() async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        icon: Container(
          width: 44,
          height: 44,
          decoration: const BoxDecoration(
            color: DesignTokens.errorBg,
            shape: BoxShape.circle,
          ),
          child: const Icon(
            CupertinoIcons.exclamationmark_triangle,
            color: DesignTokens.error,
          ),
        ),
        title: Text(l10n.deleteMyAccount),
        content: Text(l10n.deleteAccountWarning),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: DesignTokens.error),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(l10n.confirmDeleteAccount),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() {
      _deleting = true;
      _error = null;
    });
    try {
      await ref.read(accountApiProvider).deleteAccount();
      await ref.read(authControllerProvider.notifier).signOut();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _deleting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final theme = Theme.of(context);
    final isStudent = ref.watch(authControllerProvider).user?.isStudent ?? false;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(DesignTokens.pageGutter),
          children: [
            AppCard(
              padding: EdgeInsets.zero,
              onTap: () => ref.read(authControllerProvider.notifier).signOut(),
              child: ListTile(
                leading: const Icon(Icons.logout),
                title: Text(l10n.signOut),
                trailing: const Icon(Icons.chevron_right, size: 18),
              ),
            ),
            if (isStudent) ...[
              const SizedBox(height: 24),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.inviteParentSectionTitle,
                      style: theme.textTheme.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(l10n.inviteParentSectionBody, style: theme.textTheme.bodySmall),
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      onPressed: _generatingInvite ? null : _generateParentInvite,
                      icon: _generatingInvite
                          ? const SizedBox(
                              height: 14,
                              width: 14,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(CupertinoIcons.person_add, size: 16),
                      label: Text(
                        _generatingInvite
                            ? l10n.generatingCode
                            : l10n.generateParentInviteCode,
                      ),
                    ),
                    if (_inviteError != null) ...[
                      const SizedBox(height: 12),
                      FormErrorBanner(message: _inviteError!),
                    ],
                  ],
                ),
              ),
            ],
            const SizedBox(height: 24),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l10n.accountSectionTitle, style: theme.textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(l10n.accountSectionBody, style: theme.textTheme.bodySmall),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: _exporting ? null : _exportData,
                    icon: _exporting
                        ? const SizedBox(
                            height: 14,
                            width: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(CupertinoIcons.arrow_down_doc, size: 16),
                    label: Text(_exporting ? l10n.preparingExport : l10n.exportMyData),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: DesignTokens.error,
                      side: const BorderSide(color: DesignTokens.error),
                    ),
                    onPressed: _deleting ? null : _confirmAndDeleteAccount,
                    icon: _deleting
                        ? const SizedBox(
                            height: 14,
                            width: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(CupertinoIcons.trash, size: 16),
                    label: Text(_deleting ? l10n.deleting : l10n.deleteMyAccount),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    FormErrorBanner(message: _error!),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
