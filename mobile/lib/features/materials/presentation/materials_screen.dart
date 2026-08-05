import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/design_tokens.dart';
import '../../../l10n/gen/app_localizations.dart';
import '../../../widgets/widgets.dart';
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
            loading: () => const LoadingView(),
            error: (_, _) => ErrorView(message: l10n.batchesLoadError),
            data: (batches) {
              if (batches.isEmpty) {
                return EmptyStateView(
                  title: l10n.noEnrolledBatches,
                  icon: CupertinoIcons.square_stack_3d_up,
                );
              }
              return materialsAsync.when(
                loading: () => const LoadingView(),
                error: (error, _) => ErrorView(
                  message: error is ApiException ? error.message : l10n.materialsLoadError,
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
                        SectionLabel(l10n.bookmarkedSection),
                        ...bookmarked.map(
                          (m) => _MaterialTile(
                            material: m,
                            isBookmarked: true,
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],
                      for (final batch in batches) ...[
                        SectionLabel(batch.title),
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
      if (mounted) AppSnackbar.error(context, e.message);
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
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context)!;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AppCard(
        padding: EdgeInsets.zero,
        onTap: _opening ? null : _open,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: DesignTokens.spacing4,
            vertical: DesignTokens.spacing3,
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(DesignTokens.radiusMd),
                ),
                child: Icon(_icon, color: theme.colorScheme.primary, size: 20),
              ),
              const SizedBox(width: DesignTokens.spacing3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.material.title,
                      style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(_formatSize(widget.material.sizeBytes), style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
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
                Icon(Icons.download_outlined, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
            ],
          ),
        ),
      ),
    );
  }

  String _formatSize(int bytes) {
    if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
