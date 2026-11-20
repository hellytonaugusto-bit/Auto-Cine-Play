export interface AndroidProjectFile {
  path: string;
  category: 'github' | 'gradle' | 'manifest' | 'core' | 'ui' | 'resources';
  language: 'yaml' | 'kotlin' | 'xml' | 'properties' | 'markdown';
  summary: string;
  executable?: boolean;
  content: string;
}

export const BUILD_AND_MANIFEST_FILES: AndroidProjectFile[] = [
  {
    path: '.github/workflows/build-apk.yml',
    category: 'github',
    language: 'yaml',
    summary: 'Workflow GitHub Actions com JDK 17 e ./gradlew assembleDebug + Artifact app-debug.apk',
    content: `name: Build Android Debug APK

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build-apk:
    name: Compilar AutoCine Player (Debug APK)
    runs-on: ubuntu-latest

    steps:
      - name: Checkout do repositório
        uses: actions/checkout@v4

      - name: Configurar JDK 17 (Temurin)
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Configurar cache e Gradle 8.10.2
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.10.2'

      - name: Garantir Gradle Wrapper executável
        run: |
          if [ ! -f ./gradlew ] || [ ! -f ./gradle/wrapper/gradle-wrapper.jar ]; then
            gradle wrapper --gradle-version 8.10.2
          fi
          chmod +x ./gradlew

      - name: Aceitar licenças do Android SDK (se necessário)
        run: yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null 2>&1 || true

      - name: Compilar APK de depuração
        run: ./gradlew assembleDebug --stacktrace

      - name: Publicar APKs de depuração nos Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: autocine-player-debug-apks
          path: app/build/outputs/apk/debug/*.apk
          if-no-files-found: error
          retention-days: 30
`,
  },
  {
    path: 'settings.gradle.kts',
    category: 'gradle',
    language: 'kotlin',
    summary: 'Configuração de repositórios (Google + Maven Central para libVLC) e módulo :app',
    content: `pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\\\.android.*")
                includeGroupByRegex("com\\\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "AutoCinePlayer"
include(":app")
`,
  },
  {
    path: 'build.gradle.kts',
    category: 'gradle',
    language: 'kotlin',
    summary: 'Gradle raiz com Android Gradle Plugin 8.7.3, Kotlin 2.0.21 e Compose Compiler Plugin',
    content: `plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
}
`,
  },
  {
    path: 'gradle.properties',
    category: 'gradle',
    language: 'properties',
    summary: 'Otimizações de memória JVM e AndroidX para compilação rápida no CI',
    content: `org.gradle.jvmargs=-Xmx3072m -Dfile.encoding=UTF-8
org.gradle.parallel=true
org.gradle.caching=true
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`,
  },
  {
    path: 'gradle/wrapper/gradle-wrapper.properties',
    category: 'gradle',
    language: 'properties',
    summary: 'Gradle Wrapper 8.10.2 compatível com AGP 8.7.3 e JDK 17',
    content: `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.10.2-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`,
  },
  {
    path: 'app/build.gradle.kts',
    category: 'gradle',
    language: 'kotlin',
    summary: 'Android 15+ (minSdk=35, targetSdk=35), Jetpack Compose, libvlc-all, DataStore e DocumentFile',
    content: `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.autocine.player"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.autocine.player"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        vectorDrawables {
            useSupportLibrary = true
        }
    }

    splits {
        abi {
            isEnable = true
            reset()
            include("armeabi-v7a", "arm64-v8a")
            isUniversalApk = false
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isDebuggable = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.activity:activity-compose:1.9.3")

    // Jetpack Compose UI leve e responsiva
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // libVLC completa (H.264, H.265/HEVC, VP9, MPEG-4, AC3, DTS, AAC, MP3, MKV, AVI, MOV, WMV, FLV, TS, 3GP)
    implementation("org.videolan.android:libvlc-all:3.6.0")

    // MediaSession & Notification controls para Foreground Service automotivo
    implementation("androidx.media:media:1.7.0")

    // Storage Access Framework (USB OTG / SD Card) e persistência de pasta
    implementation("androidx.documentfile:documentfile:1.0.1")
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // Coroutines para varredura assíncrona sem travar a UI
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
`,
  },
  {
    path: 'app/src/main/AndroidManifest.xml',
    category: 'manifest',
    language: 'xml',
    summary: 'Paisagem fixa, PiP habilitado, permissões Android 15 (SAF/MANAGE_EXTERNAL_STORAGE/READ_MEDIA_VIDEO) e ForegroundService mediaPlayback',
    content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <!-- Acesso a vídeos e armazenamento externo no Android 7 ao 12 (API 24-32) -->
    <uses-permission
        android:name="android.permission.READ_EXTERNAL_STORAGE"
        android:maxSdkVersion="32" />
    <uses-permission
        android:name="android.permission.WRITE_EXTERNAL_STORAGE"
        android:maxSdkVersion="32" />

    <!-- Acesso moderno Android 13+ / 15+ a vídeos e armazenamento externo (USB OTG / SD Card) -->
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission
        android:name="android.permission.MANAGE_EXTERNAL_STORAGE"
        tools:ignore="ScopedStorage" />

    <!-- Execução contínua em segundo plano (Câmera de Ré / troca de app / PiP) -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <application
        android:allowBackup="true"
        android:hardwareAccelerated="true"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.AutoCinePlayer">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask"
            android:resizeableActivity="true"
            android:screenOrientation="sensorLandscape"
            android:supportsPictureInPicture="true"
            android:configChanges="screenSize|smallestScreenSize|screenLayout|orientation|keyboardHidden|keyboard|navigation"
            android:theme="@style/Theme.AutoCinePlayer">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Foreground Service dedicado à reprodução contínua em segundo plano -->
        <service
            android:name=".service.VideoPlaybackService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="mediaPlayback" />
    </application>

</manifest>
`,
  },
  {
    path: 'app/src/main/res/values/strings.xml',
    category: 'resources',
    language: 'xml',
    summary: 'Strings em português do aplicativo automotivo',
    content: `<resources>
    <string name="app_name">AutoCine Player</string>
    <string name="pip_action_prev">Anterior</string>
    <string name="pip_action_play">Reproduzir</string>
    <string name="pip_action_pause">Pausar</string>
    <string name="pip_action_next">Próximo</string>
    <string name="notification_channel_name">Reprodução de Vídeo Automotivo</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values/themes.xml',
    category: 'resources',
    language: 'xml',
    summary: 'Tema escuro sem ActionBar com suporte nativo a tela cheia imersiva (edge-to-edge)',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.AutoCinePlayer" parent="android:Theme.Material.NoActionBar">
        <item name="android:windowBackground">#07090D</item>
        <item name="android:statusBarColor">@android:color/transparent</item>
        <item name="android:navigationBarColor">@android:color/transparent</item>
    </style>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-v28/themes.xml',
    category: 'resources',
    language: 'xml',
    summary: 'Recorte de tela (shortEdges) exclusivo para Android 9+ (API 28+)',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.AutoCinePlayer" parent="android:Theme.Material.NoActionBar">
        <item name="android:windowBackground">#07090D</item>
        <item name="android:statusBarColor">@android:color/transparent</item>
        <item name="android:navigationBarColor">@android:color/transparent</item>
        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>
    </style>
</resources>
`,
  },
  {
    path: 'app/src/main/res/drawable/ic_launcher_background.xml',
    category: 'resources',
    language: 'xml',
    summary: 'Fundo vetorial escuro automotivo do Adaptive Icon',
    content: `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#070B14" android:pathData="M0,0h108v108h-108z" />
    <path android:fillColor="#0C1628" android:pathData="M54,54m-46,0a46,46 0,1 1,92 0a46,46 0,1 1,-92 0" />
    <path android:fillColor="#11223C" android:pathData="M54,54m-35,0a35,35 0,1 1,70 0a35,35 0,1 1,-70 0" />
    <path android:fillColor="#00000000" android:pathData="M54,54m-40,0a40,40 0,1 1,80 0a40,40 0,1 1,-80 0" android:strokeWidth="1.2" android:strokeColor="#2638BDF8" />
</vector>
`,
  },
  {
    path: 'app/src/main/res/drawable/ic_launcher_foreground.xml',
    category: 'resources',
    language: 'xml',
    summary: 'Símbolo vetorial de play/cinema automotivo azul do Adaptive Icon',
    content: `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#0F172A" android:pathData="M31,33h46c4.42,0 8,3.58 8,8v24c0,4.42 -3.58,8 -8,8H31c-4.42,0 -8,-3.58 -8,-8V41c0,-4.42 3.58,-8 8,-8z" android:strokeWidth="2.8" android:strokeColor="#38BDF8" />
    <path android:fillColor="#2938BDF8" android:pathData="M32,36h44c2.76,0 5,2.24 5,5v5H27v-5c0,-2.76 2.24,-5 5,-5z" />
    <path android:fillColor="#0284C7" android:pathData="M54,53m-13.5,0a13.5,13.5 0,1 1,27 0a13.5,13.5 0,1 1,-27 0" />
    <path android:fillColor="#38BDF8" android:pathData="M54,53m-12,0a12,12 0,1 1,24 0a12,12 0,1 1,-24 0" />
    <path android:fillColor="#070B14" android:pathData="M50.2,46.4L61.2,53L50.2,59.6z" />
    <path android:fillColor="#38BDF8" android:pathData="M39,77.5h30c1.1,0 2,0.9 2,2s-0.9,2 -2,2H39c-1.1,0 -2,-0.9 -2,-2s0.9,-2 2,-2z" />
</vector>
`,
  },
  {
    path: 'app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
    category: 'resources',
    language: 'xml',
    summary: 'Adaptive Icon principal para Android 8+',
    content: `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`,
  },
  {
    path: 'app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
    category: 'resources',
    language: 'xml',
    summary: 'Adaptive Icon redondo para Android 8+',
    content: `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`,
  },
  {
    path: 'app/proguard-rules.pro',
    category: 'gradle',
    language: 'properties',
    summary: 'Regras ProGuard preservando JNI/classes da libVLC no build release',
    content: `-keep class org.videolan.libvlc.** { *; }
-dontwarn org.videolan.libvlc.**
`,
  },
  {
    path: 'README.md',
    category: 'resources',
    language: 'markdown',
    summary: 'Guia rápido de compilação no Android Studio e GitHub Actions + nota sobre Mudo na Ré',
    content: `# AutoCine Player — Central Multimídia Android (Kotlin + Jetpack Compose + libVLC)

Reprodutor de vídeo nativo ultraleve projetado especificamente para **Centrais Multimídia Automotivas Android 15+ (\`minSdk = 35\`, \`targetSdk = 35\`)**.

## Recursos Principais
- **100% Paisagem & Tela Cheia Imersiva**: Oculta status bar e barra de navegação automaticamente.
- **Compatibilidade Universal (\`libvlc-all\`)**: Reproduz \`.mp4\`, \`.mkv\`, \`.avi\`, \`.mov\`, \`.wmv\`, \`.flv\`, \`.webm\`, \`.ts\`, \`.mpg\`, \`.3gp\` (H.264, H.265/HEVC, VP9, MPEG-4, AC3, DTS, AAC, MP3) com aceleração por hardware + fallback automático para software.
- **Segundo Plano (Foreground Service) + Câmera de Ré**: A reprodução nunca pausa no \`onPause()\`/\`onStop()\`.
- **Foco de Áudio Inteligente (\`AudioFocusRequest\`)**: Faz *ducking* (abaixa volume) em comandos de voz do Waze/Google Maps e pausa apenas quando outro app assume foco exclusivo (Spotify, YouTube, chamada telefônica).
- **Picture-in-Picture (PiP) Automático**: Entra em janela flutuante ao pressionar Home ou abrir o Waze/Maps, com botões rápidos de Anterior, Play/Pause e Próximo.
- **Navegação por Gestos**:
  - Deslizar na **horizontal** (esquerda/direita): Avançar/Retroceder vídeo.
  - Deslizar na **vertical (lado esquerdo)**: Controlar brilho da tela.
  - Deslizar na **vertical (lado direito)**: Controlar volume de mídia.
- **Split-Screen (Mini-Player + Lista Lateral)**: Toque em Pastas/Lista sem interromper o vídeo; toque no quadro do vídeo para voltar à tela cheia.
- **Armazenamento USB OTG / SD Card / Memória Interna + Persistência (DataStore)**: Lembra a última pasta mesmo após fechar/reiniciar a central.
- **Busca Parcial sem Acentos**: Pesquisar \`"gode"\` encontra \`"pagode e forró.mp4"\`. Inclui Atualizar (Refresh), Ordenar (A–Z, Z–A, Mais recentes) e Exclusão Direta com confirmação.

## Nota sobre Câmera de Ré ("Mudo na Ré")
Em diversas centrais multimídia Android, o MCU/sistema operacional silencia o amplificador via hardware ao engatar a marcha ré (opção *"Mudo na ré"* ou *"Reverse Mute"* nas configurações da central). O AutoCine Player mantém a reprodução e o progresso rodando normalmente em segundo plano; ao desengatar a ré, o som retorna exatamente do ponto atual sem pausar a faixa.

## Como compilar o APK via GitHub Actions
1. Suba esta pasta para um repositório no GitHub.
2. Acesse a aba **Actions** → **Build Android Debug APK**.
3. Baixe o arquivo **\`app-debug.apk\`** gerado automaticamente em **Artifacts**.
`,
  },
];
