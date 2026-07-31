import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/assignments/presentation/assignments_screen.dart';
import '../../features/auth/application/auth_controller.dart';
import '../../features/materials/presentation/materials_screen.dart';
import '../../features/progress/presentation/progress_screen.dart';
import '../../features/today/presentation/today_screen.dart';

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

    return Scaffold(
      body: IndexedStack(index: _index, children: _tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.today_outlined),
            selectedIcon: Icon(Icons.today),
            label: 'Today',
          ),
          NavigationDestination(
            icon: Icon(Icons.folder_outlined),
            selectedIcon: Icon(Icons.folder),
            label: 'Materials',
          ),
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            selectedIcon: Icon(Icons.assignment),
            label: 'Homework',
          ),
          NavigationDestination(
            icon: Icon(Icons.insights_outlined),
            selectedIcon: Icon(Icons.insights),
            label: 'Progress',
          ),
        ],
      ),
    );
  }
}
