allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// file_picker skips applying the Kotlin plugin on AGP 9+, assuming built-in Kotlin
// is enabled. This project keeps android.builtInKotlin=false (other plugins still
// apply KGP explicitly, which AGP 9 rejects when built-in Kotlin is on), so without
// this its Kotlin sources compile to an empty jar.
subprojects {
    if (project.name == "file_picker") {
        project.plugins.apply("org.jetbrains.kotlin.android")
    }
}

// sentry_flutter 8.14.2's own android/build.gradle hardcodes two stale
// values that conflict with the rest of this project once evaluated
// together:
//  1. kotlinOptions { languageVersion = "1.6" }, which this project's
//     Kotlin Gradle Plugin (2.3.20) hard-rejects at compile time
//     ("Language version 1.6 is no longer supported; use version 2.0 or
//     greater instead").
//  2. compileSdkVersion 34, while package_info_plus's AAR metadata
//     requires consumers to compile against API 36+ (Flutter's own
//     default compileSdkVersion — see FlutterExtension.kt), so AGP's
//     AAR-metadata check fails the build.
// Override both after the plugin's own build script has configured the
// project so our values win.
subprojects {
    if (project.name == "sentry_flutter") {
        afterEvaluate {
            tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
                compilerOptions.languageVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_2_0)
                compilerOptions.apiVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_2_0)
            }
            extensions.getByType<com.android.build.gradle.LibraryExtension>().compileSdk = 36
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
