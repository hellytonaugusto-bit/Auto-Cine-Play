package com.autocine.player.ui

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.os.Build
import android.util.LruCache
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PictureInPictureAlt
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.SdCard
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material.icons.rounded.SortByAlpha
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Usb
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autocine.player.data.FolderEntry
import com.autocine.player.data.StorageSlot
import com.autocine.player.data.VideoFileItem
import com.autocine.player.ui.theme.AppColorTheme
import com.autocine.player.ui.theme.LocalAutoCinePalette
import com.autocine.player.ui.theme.UiScaleLevel
import com.autocine.player.viewmodel.PlayerUiState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.util.Collections

private object VideoThumbnailMemoryCache {
    private val cache = LruCache<String, ImageBitmap>(60)
    private val failedKeys = Collections.synchronizedSet(HashSet<String>())
    val decodeSemaphore = Semaphore(2)

    fun get(key: String): ImageBitmap? = cache.get(key)
    fun hasFailed(key: String): Boolean = failedKeys.contains(key)
    fun put(key: String, bitmap: ImageBitmap) {
        cache.put(key, bitmap)
    }
    fun markFailed(key: String) {
        if (failedKeys.size > 300) failedKeys.clear()
        failedKeys.add(key)
    }
}

@Composable
private fun VideoListThumbnail(
    item: VideoFileItem,
    isCurrent: Boolean,
    isPlaying: Boolean
) {
    val palette = LocalAutoCinePalette.current
    val context = LocalContext.current
    var bitmap by remember(item.id) { mutableStateOf(VideoThumbnailMemoryCache.get(item.id)) }

    LaunchedEffect(item.id) {
        if (bitmap == null && !VideoThumbnailMemoryCache.hasFailed(item.id)) {
            val loaded = withContext(Dispatchers.IO) {
                VideoThumbnailMemoryCache.decodeSemaphore.withPermit {
                    VideoThumbnailMemoryCache.get(item.id)?.let { return@withPermit it }
                    runCatching {
                        val retriever = MediaMetadataRetriever()
                        try {
                            retriever.setDataSource(context, item.uri)
                            val frame = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                                retriever.getScaledFrameAtTime(
                                    1_500_000L,
                                    MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
                                    192,
                                    108
                                )
                            } else {
                                retriever.getFrameAtTime(
                                    1_500_000L,
                                    MediaMetadataRetriever.OPTION_CLOSEST_SYNC
                                )?.let { full ->
                                    val scaled = Bitmap.createScaledBitmap(full, 192, 108, true)
                                    if (scaled != full) full.recycle()
                                    scaled
                                }
                            }
                            frame?.asImageBitmap()
                        } finally {
                            retriever.release()
                        }
                    }.getOrNull()
                }
            }
            if (loaded != null) {
                VideoThumbnailMemoryCache.put(item.id, loaded)
                bitmap = loaded
            } else {
                VideoThumbnailMemoryCache.markFailed(item.id)
            }
        }
    }

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .width(96.dp)
            .height(54.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0xFF0F172A))
            .border(
                width = if (isCurrent) 2.dp else 1.dp,
                color = if (isCurrent) palette.accent else Color(0x1FFFFFFF),
                shape = RoundedCornerShape(10.dp)
            )
    ) {
        val bmp = bitmap
        if (bmp != null) {
            Image(
                bitmap = bmp,
                contentDescription = "Miniatura de ${item.name}",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            Icon(
                imageVector = Icons.Rounded.Movie,
                contentDescription = null,
                tint = Color(0xFF475569),
                modifier = Modifier.size(24.dp)
            )
        }

        if (isCurrent) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0x59000000))
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(30.dp)
                        .clip(CircleShape)
                        .background(palette.accent)
                ) {
                    Icon(
                        imageVector = if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        contentDescription = null,
                        tint = palette.onAccent,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun SplitScreenLeftPane(
    isPlaying: Boolean,
    activeStorageSlot: StorageSlot,
    hasCustomAllFilter: Boolean,
    videoSurface: @Composable () -> Unit,
    onTogglePlayPause: () -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onEnterPip: () -> Unit,
    onSelectStorageSlot: (StorageSlot) -> Unit,
    onOpenAllFilter: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalAutoCinePalette.current

    Column(
        modifier = modifier
            .background(Color(0xFF0C1018), RoundedCornerShape(18.dp))
            .padding(12.dp)
    ) {
        // Quadro do Mini-Player (tocar aqui volta imediatamente para Tela Cheia)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .background(Color.Black, RoundedCornerShape(14.dp))
        ) {
            videoSurface()
        }

        Spacer(Modifier.height(12.dp))

        // Conteúdo abaixo do vídeo com rolagem vertical para nunca cortar em telas menores
        Column(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
        ) {
            // Controles principais: Anterior, Play/Pause, Próximo, PiP
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Surface(
                    onClick = onPrev,
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFF1A2234),
                    border = BorderStroke(1.dp, Color(0x1FFFFFFF)),
                    modifier = Modifier.weight(1f).height(58.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Rounded.SkipPrevious,
                            contentDescription = "Anterior",
                            tint = Color.White,
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }

                Surface(
                    onClick = onTogglePlayPause,
                    shape = RoundedCornerShape(14.dp),
                    color = palette.accent,
                    modifier = Modifier.weight(1.35f).height(58.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            contentDescription = "Play/Pause",
                            tint = palette.onAccent,
                            modifier = Modifier.size(36.dp)
                        )
                    }
                }

                Surface(
                    onClick = onNext,
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFF1A2234),
                    border = BorderStroke(1.dp, Color(0x1FFFFFFF)),
                    modifier = Modifier.weight(1f).height(58.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Rounded.SkipNext,
                            contentDescription = "Próximo",
                            tint = Color.White,
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }

                Surface(
                    onClick = onEnterPip,
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFF1A2234),
                    border = BorderStroke(1.dp, Color(0x1FFFFFFF)),
                    modifier = Modifier.width(56.dp).height(58.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Rounded.PictureInPictureAlt,
                            contentDescription = "PiP",
                            tint = palette.accent,
                            modifier = Modifier.size(26.dp)
                        )
                    }
                }
            }

            HorizontalDivider(color = Color(0x18FFFFFF))

            // Seção Armazenamento: Todas (+ filtro), Pen Drive, Cartão SD, Interna
            Text(
                text = "Armazenamento",
                color = Color(0xFFCBD5E1),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
            )

            // Linha 1: Todas + Botão Filtro | Pen Drive
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    StorageOptionButton(
                        label = "Todas",
                        icon = Icons.Rounded.Layers,
                        selected = activeStorageSlot == StorageSlot.ALL,
                        onClick = { onSelectStorageSlot(StorageSlot.ALL) },
                        modifier = Modifier.weight(1f)
                    )
                    Surface(
                        onClick = onOpenAllFilter,
                        shape = RoundedCornerShape(14.dp),
                        color = if (hasCustomAllFilter) palette.accentContainer else Color(0xFF1A2234),
                        border = BorderStroke(
                            1.dp,
                            if (hasCustomAllFilter) palette.accent else Color(0x26FFFFFF)
                        ),
                        modifier = Modifier.width(46.dp).height(54.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Rounded.Tune,
                                contentDescription = "Escolher pastas de Todas",
                                tint = if (hasCustomAllFilter) Color.White else palette.accent,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }
                }

                StorageOptionButton(
                    label = "Pen Drive",
                    icon = Icons.Rounded.Usb,
                    selected = activeStorageSlot == StorageSlot.USB,
                    onClick = { onSelectStorageSlot(StorageSlot.USB) },
                    modifier = Modifier.weight(1f)
                )
            }

            // Linha 2: Cartão SD | Interna
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                StorageOptionButton(
                    label = "Cartão SD",
                    icon = Icons.Rounded.SdCard,
                    selected = activeStorageSlot == StorageSlot.SD_CARD,
                    onClick = { onSelectStorageSlot(StorageSlot.SD_CARD) },
                    modifier = Modifier.weight(1f)
                )

                StorageOptionButton(
                    label = "Interna",
                    icon = Icons.Rounded.Storage,
                    selected = activeStorageSlot == StorageSlot.INTERNAL,
                    onClick = { onSelectStorageSlot(StorageSlot.INTERNAL) },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun StorageOptionButton(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalAutoCinePalette.current
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(14.dp),
        color = if (selected) palette.accentDark else Color(0xFF1A2234),
        border = BorderStroke(
            width = if (selected) 1.5.dp else 1.dp,
            color = if (selected) palette.accent else Color(0x26FFFFFF)
        ),
        modifier = modifier.height(54.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
            modifier = Modifier.padding(horizontal = 10.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (selected) Color.White else palette.accent,
                modifier = Modifier.size(20.dp)
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = label,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
fun SplitScreenFileList(
    state: PlayerUiState,
    onSelectVideo: (VideoFileItem) -> Unit,
    onOpenSubfolder: (FolderEntry) -> Unit,
    onNavigateUp: () -> Unit,
    onNavigateBreadcrumb: (Int) -> Unit,
    onOpenAllFilter: () -> Unit,
    onDismissAllFilter: () -> Unit,
    onApplyAllFilter: (Set<String>?) -> Unit,
    onOpenSettings: () -> Unit,
    onDismissSettings: () -> Unit,
    onSelectUiScale: (UiScaleLevel) -> Unit,
    onSelectColorTheme: (AppColorTheme) -> Unit,
    onSearchChange: (String) -> Unit,
    onRefresh: () -> Unit,
    onCycleSort: () -> Unit,
    onRequestDelete: (VideoFileItem) -> Unit,
    onConfirmDelete: () -> Unit,
    onCancelDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalAutoCinePalette.current
    val listState = rememberLazyListState()

    val activeVideoIndex by remember(state.currentVideo?.id, state.visibleVideos) {
        derivedStateOf {
            state.visibleVideos.indexOfFirst { it.id == state.currentVideo?.id }
        }
    }

    val subtitleText by remember(state.currentSubfolders.size, state.visibleVideos.size) {
        derivedStateOf {
            buildString {
                if (state.currentSubfolders.isNotEmpty()) {
                    append("${state.currentSubfolders.size} subpastas · ")
                }
                append("${state.visibleVideos.size} vídeos")
            }
        }
    }

    LaunchedEffect(activeVideoIndex, state.currentSubfolders.size) {
        if (activeVideoIndex >= 0) {
            listState.animateScrollToItem(activeVideoIndex + state.currentSubfolders.size)
        }
    }

    Column(
        modifier = modifier
            .background(Color(0xFF0A0D14))
            .padding(14.dp)
    ) {
        // Cabeçalho da pasta + Filtrar (modo Todas) + Ordenar + Atualizar + Configurações (engrenagem)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = state.folderName,
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = subtitleText,
                    color = Color(0xFF94A3B8),
                    fontSize = 14.sp
                )
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (state.isAllFoldersMode) {
                    Surface(
                        onClick = onOpenAllFilter,
                        shape = RoundedCornerShape(12.dp),
                        color = palette.accentContainer
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp)
                        ) {
                            Icon(Icons.Rounded.Tune, contentDescription = "Filtrar Pastas", tint = Color.White, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Filtrar", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                Surface(
                    onClick = onCycleSort,
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFF1E293B)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp)
                    ) {
                        Icon(Icons.Rounded.SortByAlpha, contentDescription = "Ordenar", tint = palette.accent, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(state.sortOrder.label, color = Color.White, fontSize = 14.sp)
                    }
                }
                Surface(
                    onClick = onRefresh,
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFF1E293B)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp)
                    ) {
                        Icon(Icons.Rounded.Refresh, contentDescription = "Atualizar", tint = palette.accent, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Atualizar", color = Color.White, fontSize = 14.sp)
                    }
                }
                Surface(
                    onClick = onOpenSettings,
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFF1E293B),
                    border = BorderStroke(1.dp, Color(0x26FFFFFF)),
                    modifier = Modifier.size(46.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Rounded.Settings,
                            contentDescription = "Configurações",
                            tint = palette.accent,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                }
            }
        }

        // Barra de Breadcrumbs + botão Voltar fixo quando dentro de subpastas
        if (!state.isAllFoldersMode && state.folderBreadcrumbs.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Surface(
                    onClick = onNavigateUp,
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xFF1E293B)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Voltar", tint = palette.accent, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Voltar", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Spacer(Modifier.width(10.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .weight(1f)
                        .horizontalScroll(rememberScrollState())
                ) {
                    Text(
                        text = state.rootFolderName,
                        color = Color(0xFF94A3B8),
                        fontSize = 14.sp,
                        modifier = Modifier
                            .clickable { onNavigateBreadcrumb(-1) }
                            .padding(horizontal = 4.dp, vertical = 6.dp)
                    )
                    state.folderBreadcrumbs.forEachIndexed { idx, segment ->
                        Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(18.dp))
                        val isLast = idx == state.folderBreadcrumbs.lastIndex
                        Text(
                            text = segment,
                            color = if (isLast) palette.accent else Color(0xFFCBD5E1),
                            fontSize = 14.sp,
                            fontWeight = if (isLast) FontWeight.SemiBold else FontWeight.Normal,
                            modifier = Modifier
                                .clickable { onNavigateBreadcrumb(idx) }
                                .padding(horizontal = 4.dp, vertical = 6.dp)
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // Campo de Busca Parcial (ignora maiúsculas/minúsculas e acentos)
        OutlinedTextField(
            value = state.searchQuery,
            onValueChange = onSearchChange,
            placeholder = { Text("Pesquisar vídeo (ex: gode, forro)...") },
            leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.accent) },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = palette.accent,
                unfocusedBorderColor = Color(0x33FFFFFF),
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                cursorColor = palette.accent
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(10.dp))

        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            // Cards grandes de Subpastas acima da lista de vídeos
            if (!state.isAllFoldersMode && state.currentSubfolders.isNotEmpty()) {
                items(
                    items = state.currentSubfolders,
                    key = { "sub_${it.id}" },
                    contentType = { "subfolder" }
                ) { sub ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(Color(0xFF111827))
                            .border(1.dp, Color(0x1FFFFFFF), RoundedCornerShape(14.dp))
                            .clickable { onOpenSubfolder(sub) }
                            .padding(horizontal = 14.dp, vertical = 14.dp)
                    ) {
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(palette.accentSoft)
                        ) {
                            Icon(Icons.Rounded.Folder, contentDescription = null, tint = palette.accent, modifier = Modifier.size(28.dp))
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = sub.name,
                                color = Color.White,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = if (sub.videoCount > 0) "${sub.videoCount} vídeos diretos · Toque para abrir" else "Pasta com subpastas · Toque para abrir",
                                color = Color(0xFF94A3B8),
                                fontSize = 13.sp
                            )
                        }
                        Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = palette.accent, modifier = Modifier.size(28.dp))
                    }
                }
            }

            itemsIndexed(
                items = state.visibleVideos,
                key = { _, item -> item.id },
                contentType = { _, _ -> "video" }
            ) { index, item ->
                val isCurrent = item.id == state.currentVideo?.id
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (isCurrent) palette.accentSoft else Color.Transparent, RoundedCornerShape(14.dp))
                        .clickable { onSelectVideo(item) }
                        .padding(horizontal = 12.dp, vertical = 10.dp)
                ) {
                    Text(
                        text = "%02d".format(index + 1),
                        color = if (isCurrent) palette.accent else Color(0xFF64748B),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.width(30.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    VideoListThumbnail(
                        item = item,
                        isCurrent = isCurrent,
                        isPlaying = state.isPlaying
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = item.name,
                            color = if (isCurrent) Color.White else Color(0xFFE2E8F0),
                            fontSize = 16.sp,
                            fontWeight = if (isCurrent) FontWeight.SemiBold else FontWeight.Normal,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (state.isAllFoldersMode && item.folderName.isNotEmpty()) {
                            Text(
                                text = item.folderName,
                                color = palette.accent,
                                fontSize = 12.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    IconButton(onClick = { onRequestDelete(item) }, modifier = Modifier.size(52.dp)) {
                        Icon(
                            Icons.Rounded.Delete,
                            contentDescription = "Excluir ${item.name}",
                            tint = Color(0xFF94A3B8)
                        )
                    }
                }
                HorizontalDivider(color = Color(0x14FFFFFF))
            }
        }
    }

    // Modal de Configurações (Tamanho da Interface + Tema de Cores)
    if (state.isSettingsOpen) {
        SettingsDialog(
            currentScale = state.uiScaleLevel,
            currentTheme = state.colorTheme,
            onSelectScale = onSelectUiScale,
            onSelectTheme = onSelectColorTheme,
            onDismiss = onDismissSettings
        )
    }

    // Diálogo manual de seleção de pastas para o modo "Todas"
    if (state.isAllFilterDialogOpen) {
        AllFoldersFilterDialog(
            folders = state.selectableAllFolders,
            initialSelectedIds = state.selectedAllFolderIds,
            onDismiss = onDismissAllFilter,
            onApply = onApplyAllFilter
        )
    }

    // Janela de confirmação de exclusão direta
    val toDelete = state.pendingDeleteItem
    if (toDelete != null) {
        AlertDialog(
            onDismissRequest = onCancelDelete,
            title = { Text("Excluir arquivo?") },
            text = { Text("Deseja apagar permanentemente \"${toDelete.name}\" do armazenamento?") },
            confirmButton = {
                Button(
                    onClick = onConfirmDelete,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFEF4444),
                        contentColor = Color.White
                    )
                ) {
                    Text("Excluir")
                }
            },
            dismissButton = {
                TextButton(onClick = onCancelDelete) {
                    Text("Cancelar", color = Color(0xFFCBD5E1))
                }
            }
        )
    }
}

@Composable
private fun SettingsDialog(
    currentScale: UiScaleLevel,
    currentTheme: AppColorTheme,
    onSelectScale: (UiScaleLevel) -> Unit,
    onSelectTheme: (AppColorTheme) -> Unit,
    onDismiss: () -> Unit
) {
    val palette = LocalAutoCinePalette.current

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF0E1420),
        titleContentColor = Color.White,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Rounded.Settings,
                    contentDescription = null,
                    tint = palette.accent,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = "Configurações",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 360.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                // 1. Tamanho da Interface (4 níveis fixos)
                Text(
                    text = "Tamanho da Interface",
                    color = Color(0xFFCBD5E1),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold
                )

                val scaleRows = remember { UiScaleLevel.entries.chunked(2) }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    scaleRows.forEach { rowLevels ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            rowLevels.forEach { level ->
                                val selected = level == currentScale
                                Surface(
                                    onClick = { onSelectScale(level) },
                                    shape = RoundedCornerShape(12.dp),
                                    color = if (selected) palette.accentDark else Color(0xFF1A2234),
                                    border = BorderStroke(
                                        width = if (selected) 1.5.dp else 1.dp,
                                        color = if (selected) palette.accent else Color(0x26FFFFFF)
                                    ),
                                    modifier = Modifier.weight(1f).height(48.dp)
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.Center,
                                        modifier = Modifier.padding(horizontal = 8.dp)
                                    ) {
                                        if (selected) {
                                            Icon(
                                                Icons.Rounded.Check,
                                                contentDescription = null,
                                                tint = Color.White,
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Spacer(Modifier.width(4.dp))
                                        }
                                        Text(
                                            text = level.label,
                                            color = Color.White,
                                            fontSize = 13.sp,
                                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                HorizontalDivider(color = Color(0x18FFFFFF))

                // 2. Tema de Cores (6 conjuntos pré-definidos)
                Text(
                    text = "Tema de Cores",
                    color = Color(0xFFCBD5E1),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold
                )

                val themeRows = remember { AppColorTheme.entries.chunked(2) }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    themeRows.forEach { rowThemes ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            rowThemes.forEach { theme ->
                                val selected = theme == currentTheme
                                Surface(
                                    onClick = { onSelectTheme(theme) },
                                    shape = RoundedCornerShape(12.dp),
                                    color = if (selected) theme.accentSoft else Color(0xFF1A2234),
                                    border = BorderStroke(
                                        width = if (selected) 1.5.dp else 1.dp,
                                        color = if (selected) theme.accent else Color(0x26FFFFFF)
                                    ),
                                    modifier = Modifier.weight(1f).height(48.dp)
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(horizontal = 10.dp)
                                    ) {
                                        Box(
                                            contentAlignment = Alignment.Center,
                                            modifier = Modifier
                                                .size(20.dp)
                                                .clip(CircleShape)
                                                .background(theme.accent)
                                        ) {
                                            if (selected) {
                                                Icon(
                                                    Icons.Rounded.Check,
                                                    contentDescription = null,
                                                    tint = theme.onAccent,
                                                    modifier = Modifier.size(14.dp)
                                                )
                                            }
                                        }
                                        Spacer(Modifier.width(8.dp))
                                        Text(
                                            text = theme.label,
                                            color = Color.White,
                                            fontSize = 12.sp,
                                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(
                    containerColor = palette.accent,
                    contentColor = palette.onAccent
                )
            ) {
                Text("Concluir", fontWeight = FontWeight.Bold)
            }
        }
    )
}

@Composable
private fun AllFoldersFilterDialog(
    folders: List<FolderEntry>,
    initialSelectedIds: Set<String>?,
    onDismiss: () -> Unit,
    onApply: (Set<String>?) -> Unit
) {
    val palette = LocalAutoCinePalette.current
    var draftSelected by remember(folders, initialSelectedIds) {
        mutableStateOf(
            initialSelectedIds ?: folders.map { it.id }.toSet()
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF0E1420),
        titleContentColor = Color.White,
        title = {
            Text(
                text = "Selecionar Pastas para \"Todas\"",
                fontSize = 19.sp,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    TextButton(onClick = { draftSelected = folders.map { it.id }.toSet() }) {
                        Text("Marcar todas", color = palette.accent)
                    }
                    TextButton(onClick = { draftSelected = emptySet() }) {
                        Text("Limpar", color = Color(0xFF94A3B8))
                    }
                }
                LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 280.dp)) {
                    items(folders, key = { it.id }) { folder ->
                        val checked = folder.id in draftSelected
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    draftSelected = if (checked) draftSelected - folder.id else draftSelected + folder.id
                                }
                                .padding(start = (folder.depth * 18).dp, top = 6.dp, bottom = 6.dp, end = 6.dp)
                        ) {
                            Checkbox(
                                checked = checked,
                                onCheckedChange = { isChecked ->
                                    draftSelected = if (isChecked) draftSelected + folder.id else draftSelected - folder.id
                                },
                                colors = CheckboxDefaults.colors(checkedColor = palette.accent)
                            )
                            Spacer(Modifier.width(6.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = folder.name,
                                    color = Color.White,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = "${folder.sourceLabel} · ${folder.videoCount} vídeos",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val allIds = folders.map { it.id }.toSet()
                    val normalized = if (draftSelected == allIds) null else draftSelected
                    onApply(normalized)
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = palette.accentDark,
                    contentColor = Color.White
                )
            ) {
                Text("Aplicar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar", color = Color(0xFFCBD5E1))
            }
        }
    )
}
