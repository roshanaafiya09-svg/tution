import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/design_tokens.dart';
import '../../batches/application/batches_provider.dart';
import '../application/materials_controller.dart';
import '../data/material_item.dart';

/// Blueprint §4: "materials with offline reading cache on mobile".
class MaterialsScreen extends ConsumerWidget {
  const MaterialsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final batchesAsync = ref.watch(enrolledBatchesProvider);
    final materialsAsync = ref.watch(materialsControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Materials')),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => ref.read(materialsControllerProvider.notifier).refresh(),
          child: batchesAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, _) => const _CenteredMessage('Could not load your batches.'),
            data: (batches) {
              if (batches.isEmpty) {
                return const _CenteredMessage(
                  "You're not enrolled in any batches yet.",
                );
              }
              return materialsAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => _CenteredMessage(
                  error is ApiException ? error.message : 'Could not load materials.',
                ),
                data: (byBatch) => ListView(
                  padding: const EdgeInsets.all(DesignTokens.pageGutter),
                  children: [
                    for (final batch in batches) ...[
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8, top: 8),
                        child: Text(
                          batch.title,
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                      if ((byBatch[batch.id] ?? []).isEmpty)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: Text(
                            'No materials yet.',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        )
                      else
                        ...byBatch[batch.id]!.map(
                          (m) => _MaterialTile(material: m),
                        ),
                      const SizedBox(height: 8),
                    ],
                  ],
                ),
              );
            },
          ),
        ),
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
  const _MaterialTile({required this.material});

  final MaterialItem material;

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
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(_icon, color: Theme.of(context).colorScheme.primary),
        title: Text(widget.material.title),
        subtitle: Text(_formatSize(widget.material.sizeBytes)),
        trailing: _opening
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.download_outlined),
        onTap: _opening ? null : _open,
      ),
    );
  }

  String _formatSize(int bytes) {
    if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
