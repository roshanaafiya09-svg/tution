import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../l10n/gen/app_localizations.dart';
import '../application/assignments_controller.dart';
import '../data/assignment.dart';

/// Blueprint §3: "assignment submit". Photo capture or a PDF pick,
/// uploaded straight to storage, then recorded — no separate detail
/// screen needed for a Phase-1 submit flow this small.
class AssignmentsScreen extends ConsumerWidget {
  const AssignmentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final assignmentsAsync = ref.watch(assignmentsControllerProvider);
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.homeworkTitle)),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => ref.read(assignmentsControllerProvider.notifier).refresh(),
          child: assignmentsAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => ListView(
              padding: const EdgeInsets.all(DesignTokens.pageGutter),
              children: [
                const SizedBox(height: 64),
                Center(
                  child: Text(
                    error is ApiException ? error.message : l10n.homeworkLoadError,
                  ),
                ),
              ],
            ),
            data: (assignments) {
              if (assignments.isEmpty) {
                return ListView(
                  padding: const EdgeInsets.all(DesignTokens.pageGutter),
                  children: [
                    const SizedBox(height: 64),
                    Center(child: Text(l10n.noHomeworkYet)),
                  ],
                );
              }
              return ListView(
                padding: const EdgeInsets.all(DesignTokens.pageGutter),
                children: assignments
                    .map((a) => _AssignmentCard(assignment: a))
                    .toList(),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _AssignmentCard extends ConsumerStatefulWidget {
  const _AssignmentCard({required this.assignment});

  final Assignment assignment;

  @override
  ConsumerState<_AssignmentCard> createState() => _AssignmentCardState();
}

class _AssignmentCardState extends ConsumerState<_AssignmentCard> {
  bool _submitting = false;

  Future<void> _pickAndSubmit() async {
    final l10n = AppLocalizations.of(context)!;
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: Text(l10n.takePhoto),
              onTap: () => Navigator.pop(context, 'camera'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(l10n.chooseFromGallery),
              onTap: () => Navigator.pop(context, 'gallery'),
            ),
            ListTile(
              leading: const Icon(Icons.picture_as_pdf_outlined),
              title: Text(l10n.choosePdf),
              onTap: () => Navigator.pop(context, 'pdf'),
            ),
          ],
        ),
      ),
    );
    if (choice == null) return;

    List<int>? bytes;
    String mime = 'image/jpeg';

    if (choice == 'camera' || choice == 'gallery') {
      final file = await ImagePicker().pickImage(
        source: choice == 'camera' ? ImageSource.camera : ImageSource.gallery,
        imageQuality: 85,
      );
      if (file == null) return;
      bytes = await file.readAsBytes();
      mime = 'image/jpeg';
    } else {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf'],
        withData: true,
      );
      if (result == null || result.files.single.bytes == null) return;
      bytes = result.files.single.bytes;
      mime = 'application/pdf';
    }

    if (bytes == null || !mounted) return;
    setState(() => _submitting = true);
    try {
      await ref
          .read(assignmentsControllerProvider.notifier)
          .submitHomework(
            assignmentId: widget.assignment.id,
            bytes: bytes,
            mime: mime,
          );
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context)!;
    final a = widget.assignment;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(DesignTokens.cardPadding),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(a.title, style: theme.textTheme.titleMedium),
                ),
                _StatusChip(status: a.status),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              l10n.assignmentDueLine(
                a.batchTitle,
                DateFormat.yMMMd().add_jm().format(a.dueAtLocal),
              ),
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
            if (a.instructions != null) ...[
              const SizedBox(height: 8),
              Text(a.instructions!, style: theme.textTheme.bodyMedium),
            ],
            if (a.status == AssignmentStatus.graded) ...[
              const SizedBox(height: 8),
              Text(
                l10n.gradeLabel(a.grade ?? ''),
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            if (a.status == AssignmentStatus.pending) ...[
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: _submitting ? null : _pickAndSubmit,
                child: _submitting
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(l10n.submitHomework),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final AssignmentStatus status;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final (label, color) = switch (status) {
      AssignmentStatus.pending => (l10n.statusPending, DesignTokens.warning),
      AssignmentStatus.submitted => (l10n.statusSubmitted, DesignTokens.info),
      AssignmentStatus.graded => (l10n.statusGraded, DesignTokens.success),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(DesignTokens.radiusSm),
      ),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}
