# AutoCine Player — Central Multimídia Android (Kotlin + Jetpack Compose + libVLC)

Reprodutor de vídeo nativo ultraleve projetado especificamente para **Centrais Multimídia Automotivas Android 15+ (`minSdk = 35`, `targetSdk = 35`)**.

## Recursos Principais
- **100% Paisagem & Tela Cheia Imersiva**: Oculta status bar e barra de navegação automaticamente.
- **Compatibilidade Universal (`libvlc-all`)**: Reproduz `.mp4`, `.mkv`, `.avi`, `.mov`, `.wmv`, `.flv`, `.webm`, `.ts`, `.mpg`, `.3gp` (H.264, H.265/HEVC, VP9, MPEG-4, AC3, DTS, AAC, MP3) com aceleração por hardware + fallback automático para software.
- **Segundo Plano (Foreground Service) + Câmera de Ré**: A reprodução nunca pausa no `onPause()`/`onStop()`.
- **Foco de Áudio Inteligente (`AudioFocusRequest`)**: Faz *ducking* (abaixa volume) em comandos de voz do Waze/Google Maps e pausa apenas quando outro app assume foco exclusivo (Spotify, YouTube, chamada telefônica).
- **Picture-in-Picture (PiP) Automático**: Entra em janela flutuante ao pressionar Home ou abrir o Waze/Maps, com botões rápidos de Anterior, Play/Pause e Próximo.
- **Navegação por Gestos**:
  - Deslizar na **horizontal** (esquerda/direita): Avançar/Retroceder vídeo.
  - Deslizar na **vertical (lado esquerdo)**: Controlar brilho da tela.
  - Deslizar na **vertical (lado direito)**: Controlar volume de mídia.
- **Split-Screen (Mini-Player + Lista Lateral)**: Toque em Pastas/Lista sem interromper o vídeo; toque no quadro do vídeo para voltar à tela cheia.
- **Armazenamento USB OTG / SD Card / Memória Interna + Persistência (DataStore)**: Lembra a última pasta mesmo após fechar/reiniciar a central.
- **Busca Parcial sem Acentos**: Pesquisar `"gode"` encontra `"pagode e forró.mp4"`. Inclui Atualizar (Refresh), Ordenar (A–Z, Z–A, Mais recentes) e Exclusão Direta com confirmação.

## Nota sobre Câmera de Ré ("Mudo na Ré")
Em diversas centrais multimídia Android, o MCU/sistema operacional silencia o amplificador via hardware ao engatar a marcha ré (opção *"Mudo na ré"* ou *"Reverse Mute"* nas configurações da central). O AutoCine Player mantém a reprodução e o progresso rodando normalmente em segundo plano; ao desengatar a ré, o som retorna exatamente do ponto atual sem pausar a faixa.

## Como compilar o APK via GitHub Actions
1. Suba esta pasta para um repositório no GitHub.
2. Acesse a aba **Actions** → **Build Android Debug APK**.
3. Baixe o arquivo **`app-debug.apk`** gerado automaticamente em **Artifacts**.
