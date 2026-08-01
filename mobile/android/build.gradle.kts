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

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
