import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    // Absent until the Firebase project handoff lands (needs
    // android/app/google-services.json) — push registration degrades to
    // a no-op via push_registration.dart's own try/catch until then.
    await Firebase.initializeApp();
  } catch (_) {
    // Swallow: local dev without google-services.json must still boot.
  }
  runApp(const ProviderScope(child: TuitionApp()));
}
