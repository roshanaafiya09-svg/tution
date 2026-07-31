import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../l10n/gen/app_localizations.dart';
import '../../batches/application/batches_provider.dart';
import '../application/materials_controller.dart';
import '../data/material_item.dart';

/// Blueprint §4: "materials with offline reading cache on mobile".
/// Blueprint §3: bookmarks — local-only, shown as a section up top.
class MaterialsScreen extends ConsumerWidget {
  const MaterialsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final batchesAsync = ref.watch(enrolledBatchesProvider);
    final materialsAsync = ref.watch(materialsControllerProvider);
    final bookmarksAsync = ref.watch(bookmarksStreamProvider);
    final bookmarkedIds = bookmarksAsync.value?.map((b) => b.materialId).toSet() ?? {};
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.materialsTitle)),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => ref.read(materialsControllerProvider.notifier).refresh(),
          child: batchesAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, _) => _CenteredMessage(l10n.batchesLoadError),
            data: (batches) {
              if (batches.isEmpty) {
                return _CenteredMessage(l10n.noEnrolledBatches);
              }
              return materialsAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => _CenteredMessage(
                  error is ApiException ? error.message : l10n.materialsLoadError,
                ),
                data: (byBatch) {
                  final bookmarked = byBatch.values
                      .expand((list) => list)
                      .where((m) => bookmarkedIds.contains(m.id))
                      .toList();

                  return ListView(
                    padding: const EdgeInsets.all(DesignTokens.pageGutter),
                    children: [
                      if (bookmarked.isNotEmpty) ...[
                        _SectionLabel(l10n.bookmarkedSection),
                        ...bookmarked.map(
                          (m) => _MaterialTile(
                            material: m,
                            isBookmarked: true,
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],
                      for (final batch in batches) ...[
                        _SectionLabel(batch.title),
                        if ((byBatch[batch.id] ?? []).isEmpty)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 16),
                            child: Text(
                              l10n.noMaterialsYet,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          )
                        else
                          ...byBatch[batch.id]!.map(
                            (m) => _MaterialTile(
                              material: m,
                              isBookmarked: bookmarkedIds.contains(m.id),
                            ),
                          ),
                        const SizedBox(height: 8),
                      ],
                    ],
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 8),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _CenteredMessage extends StatelessWidget {
  const _CenteredMessage(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(DesignTokens.pageGutter),
      children: [
        const SizedBox(height: 64),
        Center(child: Text(message, textAlign: TextAlign.center)),
      ],
    );
  }
}

class _MaterialTile extends ConsumerStatefulWidget {
  const _MaterialTile({required this.material, required this.isBookmarked});

  final MaterialItem material;
  final bool isBookmarked;

  @override
  ConsumerState<_MaterialTile> createState() => _MaterialTileState();
}

class _MaterialTileState extends ConsumerState<_MaterialTile> {
  bool _opening = false;

  Future<void> _open() async {
    setState(() => _opening = true);
    try {
      await ref
          .read(materialsControllerProvider.notifier)
          .openMaterial(widget.material);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  IconData get _icon =>
      widget.material.mime == 'application/pdf'
          ? Icons.picture_as_pdf_outlined
          : Icons.image_outlined;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(_icon, color: Theme.of(context).colorScheme.primary),
        title: Text(widget.material.title),
        subtitle: Text(_formatSize(widget.material.sizeBytes)),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: Icon(
                widget.isBookmarked ? Icons.star : Icons.star_border,
                color: widget.isBookmarked ? DesignTokens.accent500 : null,
              ),
              tooltip: widget.isBookmarked ? l10n.removeBookmark : l10n.addBookmark,
              onPressed: () => ref
                  .read(materialsControllerProvider.notifier)
                  .toggleBookmark(widget.material),
            ),
            if (_opening)
              const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            else
              const Icon(Icons.download_outlined),
          ],
        ),
        onTap: _opening ? null : _open,
      ),
    );
  }

  String _formatSize(int bytes) {
    if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
