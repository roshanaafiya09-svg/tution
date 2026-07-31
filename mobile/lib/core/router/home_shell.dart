import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/assignments/presentation/assignments_screen.dart';
import '../../features/auth/application/auth_controller.dart';
import '../../features/materials/presentation/materials_screen.dart';
import '../../features/progress/presentation/progress_screen.dart';
import '../../features/today/presentation/today_screen.dart';
import '../../l10n/gen/app_localizations.dart';

/// Students get bottom-nav tabs across the Phase 1 mobile surfaces
/// (blueprint §3). Tutors see the bare Today screen — the mobile app is
/// a lightweight companion for them, not their primary work surface
/// (that's the web dashboard, blueprint §2).
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  static const _tabs = [
    TodayScreen(),
    MaterialsScreen(),
    AssignmentsScreen(),
    ProgressScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    final isStudent = ref.watch(authControllerProvider).user?.isStudent == true;

    if (!isStudent) {
      return const TodayScreen();
    }

    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      body: IndexedStack(index: _index, children: _tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.today_outlined),
            selectedIcon: const Icon(Icons.today),
            label: l10n.navToday,
          ),
          NavigationDestination(
            icon: const Icon(Icons.folder_outlined),
            selectedIcon: const Icon(Icons.folder),
            label: l10n.navMaterials,
          ),
          NavigationDestination(
            icon: const Icon(Icons.assignment_outlined),
            selectedIcon: const Icon(Icons.assignment),
            label: l10n.navHomework,
          ),
          NavigationDestination(
            icon: const Icon(Icons.insights_outlined),
            selectedIcon: const Icon(Icons.insights),
            label: l10n.navProgress,
          ),
        ],
      ),
    );
  }
}
