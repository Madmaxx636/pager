plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "app.pager.android"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.pager.android"
        minSdk = 26
        targetSdk = 34
        // One version for every app: the VERSION file at the top of the repo (the release script changes only that).
        val v = rootProject.file("../VERSION").readText().trim()
        val (major, minor, patch) = v.split(".").map { it.toInt() }
        versionCode = major * 10000 + minor * 100 + patch
        versionName = v
        // The encryption library ships a native file for each kind of phone; keep the two that real phones use.
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
    }

    buildFeatures { compose = true }

    buildTypes {
        debug { manifestPlaceholders["cleartext"] = "true" }
        release {
            // Plain HTTP only for local trial builds (-PdebugSign); real releases require HTTPS.
            manifestPlaceholders["cleartext"] = if (project.hasProperty("debugSign")) "true" else "false"
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Local trial builds only: ./gradlew assembleRelease -PdebugSign
            if (project.hasProperty("debugSign")) signingConfig = signingConfigs.getByName("debug")
        }
    }
    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.09.03")
    implementation(composeBom)
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.zxing:core:3.5.3")
    implementation("androidx.profileinstaller:profileinstaller:1.4.1")
    implementation("androidx.fragment:fragment-ktx:1.8.4")
    implementation("androidx.biometric:biometric:1.1.0")
    // End-to-end encryption (Olm/Megolm), the same Rust library the web app uses.
    implementation("org.matrix.rustcomponents:crypto-android:26.05.12")
    implementation("net.java.dev.jna:jna:5.14.0@aar")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
}
