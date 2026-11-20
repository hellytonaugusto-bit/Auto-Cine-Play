package com.autocine.player.ui

import android.media.MediaMetadataRetriever
import android.util.LruCache
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PictureInPictureAlt
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material.icons.rounded.SortByAlpha
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autocine.player.data.FolderEntry
import com.autocine.player.data.VideoFileItem
import com.autocine.player.viewmodel.PlayerUiState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private object VideoThumbnailMemoryCache {
    private val cache = LruCache<String, ImageBitmap>(60)
    fun get(key: String): ImageBitmap? = cache.get(key)
    fun put(key: String, bitmap: ImageBitmap) { cache.put(key, bitmap) }
}

@Composable
private fun VideoListThumbnail(
    item: VideoFileItem,
    isCurrent: Boolean,
    isPlaying: Boolean
) {
    val context = LocalContext.current
    var bitmap by remember(item.id) { mutableStateOf(VideoThumbnailMemoryCache.get(item.id)) }

    LaunchedEffect(item.id) {
        if (bitmap == null) {
            val loaded = withContext(Dispatchers.IO) {
                runCatching {
                    val retriever = MediaMetadataRetriever()
                    try {
                        retriever.setDataSource(context, item.uri)
                        retriever.getScaledFrameAtTime(
                            1_500_000L,
                            MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
                            192,
                            108
                        )?.asImageBitmap()
                    } finally {
                        retriever.release()
                    }
                }.getOrNull()
            }
            if (loaded != null) {
                VideoThumbnailMemoryCache.put(item.id, loaded)
                bitmap = loaded
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
                color = if (isCurrent) Color(0xFF38BDF8) else Color(0x1FFFFFFF),
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
                        .background(Color(0xFF38BDF8))
                ) {
                    Icon(
                        imageVector = if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        contentDescription = null,
                        tint = Color(0xFF07090D),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun SplitScreenLeftPane(
    state: PlayerUiState,
    videoSurface: @Composable () -> Unit,
    onTogglePlayPause: () -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onCycleMode: () -> Unit,
    onCycleAspect: () -> Unit,
    onEnterPip: () -> Unit,
    onPickFolder: () -> Unit,
    onPlayAllFolders: () -> Unit,
    onOpenAllFilter: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        verticalArrangement = Arrangement.SpaceBetween,
        modifier = modifier.background(Color(0xFF0C1018), RoundedCornerShape(18.dp)).padding(14.dp)
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

        Column {
            Text(
                text = state.currentVideo?.name ?: "Nenhum vídeo selecionado",
                color = Color.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Toque no vídeo acima para tela cheia · ${formatMs(state.positionMs)} / ${formatMs(state.durationMs)}",
                color = Color(0xFF94A3B8),
                fontSize = 13.sp
            )
        }

        // Controles rápidos extragrandes abaixo do Mini-Player (otimizados para 9")
        Row(
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            IconButton(onClick = onPrev, modifier = Modifier.size(60.dp)) {
                Icon(Icons.Rounded.SkipPrevious, contentDescription = "Anterior", tint = Color.White, modifier = Modifier.size(36.dp))
            }
            Surface(onClick = onTogglePlayPause, shape = RoundedCornerShape(16.dp), color = Color(0xFF38BDF8), modifier = Modifier.size(64.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        if (state.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        contentDescription = "Play/Pause",
                        tint = Color(0xFF07090D),
                        modifier = Modifier.size(38.dp)
                    )
                }
            }
            IconButton(onClick = onNext, modifier = Modifier.size(60.dp)) {
                Icon(Icons.Rounded.SkipNext, contentDescription = "Próximo", tint = Color.White, modifier = Modifier.size(36.dp))
            }
            IconButton(onClick = onEnterPip, modifier = Modifier.size(56.dp)) {
                Icon(Icons.Rounded.PictureInPictureAlt, contentDescription = "PiP", tint = Color(0xFF38BDF8), modifier = Modifier.size(28.dp))
            }
        }

        // Botões de Todas as Pastas (com filtro manual) vs Escolher Pasta (USB/SD/Interna)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Button(
                onClick = onPlayAllFolders,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (state.isAllFoldersMode) Color(0xFF0284C7) else Color(0xFF1E293B)
                ),
                modifier = Modifier.weight(1f).height(54.dp)
            ) {
                Icon(Icons.Rounded.Layers, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(6.dp))
                Text("Todas", maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Surface(
                onClick = onOpenAllFilter,
                shape = RoundedCornerShape(14.dp),
                color = if (state.selectedAllFolderIds != null) Color(0xFF0369A1) else Color(0xFF1E293B),
                modifier = Modifier.size(54.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.Rounded.Tune,
                        contentDescription = "Escolher pastas de Todas",
                        tint = Color(0xFF38BDF8),
                        modifier = Modifier.size(24.dp)
                    )
                }
            }
            Button(
                onClick = onPickFolder,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (!state.isAllFoldersMode) Color(0xFF1E293B) else Color(0xFF111827)
                ),
                modifier = Modifier.weight(1f).height(54.dp)
            ) {
                Icon(Icons.Rounded.FolderOpen, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(6.dp))
                Text("Pasta USB", maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }

        Row(horizontalArrangement = Arrangement.SpaceEvenly, modifier = Modifier.fillMaxWidth()) {
            TextButton(onClick = onCycleMode) { Text(state.playbackMode.label, color = Color(0xFF38BDF8), fontSize = 15.sp) }
            TextButton(onClick = onCycleAspect) { Text(state.aspectRatio.label, color = Color(0xFFCBD5E1), fontSize = 15.sp) }
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
    onSearchChange: (String) -> Unit,
    onRefresh: () -> Unit,
    onCycleSort: () -> Unit,
    onRequestDelete: (VideoFileItem) -> Unit,
    onConfirmDelete: () -> Unit,
    onCancelDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val listState = rememberLazyListState()

    LaunchedEffect(state.currentVideo?.id, state.visibleVideos.size) {
        val activeIdx = state.visibleVideos.indexOfFirst { it.id == state.currentVideo?.id }
        if (activeIdx >= 0) {
            listState.animateScrollToItem(activeIdx + state.currentSubfolders.size)
        }
    }

    Column(
        modifier = modifier
            .background(Color(0xFF0A0D14))
            .padding(16.dp)
    ) {
        // Cabeçalho da pasta + Filtrar Pastas (no modo Todas) + Ordenar + Atualizar
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
                val subtitle = buildString {
                    if (state.currentSubfolders.isNotEmpty()) {
                        append("${state.currentSubfolders.size} subpastas · ")
                    }
                    append("${state.visibleVideos.size} vídeos")
                }
                Text(
                    text = subtitle,
                    color = Color(0xFF94A3B8),
                    fontSize = 14.sp
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (state.isAllFoldersMode) {
                    Surface(onClick = onOpenAllFilter, shape = RoundedCornerShape(12.dp), color = Color(0xFF0369A1)) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                            Icon(Icons.Rounded.Tune, contentDescription = "Filtrar Pastas", tint = Color.White, modifier = Modifier.size(22.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Filtrar", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                Surface(onClick = onCycleSort, shape = RoundedCornerShape(12.dp), color = Color(0xFF1E293B)) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                        Icon(Icons.Rounded.SortByAlpha, contentDescription = "Ordenar", tint = Color(0xFF38BDF8), modifier = Modifier.size(22.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(state.sortOrder.label, color = Color.White, fontSize = 14.sp)
                    }
                }
                Surface(onClick = onRefresh, shape = RoundedCornerShape(12.dp), color = Color(0xFF1E293B)) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                        Icon(Icons.Rounded.Refresh, contentDescription = "Atualizar", tint = Color(0xFF38BDF8), modifier = Modifier.size(22.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Atualizar", color = Color.White, fontSize = 14.sp)
                    }
                }
            }
        }

        // Barra de Breadcrumbs + botão Voltar quando dentro de subpastas
        if (!state.isAllFoldersMode && state.folderBreadcrumbs.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
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
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Voltar", tint = Color(0xFF38BDF8), modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Voltar", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Spacer(Modifier.width(10.dp))
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
                        color = if (isLast) Color(0xFF38BDF8) else Color(0xFFCBD5E1),
                        fontSize = 14.sp,
                        fontWeight = if (isLast) FontWeight.SemiBold else FontWeight.Normal,
                        modifier = Modifier
                            .clickable { onNavigateBreadcrumb(idx) }
                            .padding(horizontal = 4.dp, vertical = 6.dp)
                    )
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // Campo de Busca Parcial (ignora maiúsculas/minúsculas e acentos)
        OutlinedTextField(
            value = state.searchQuery,
            onValueChange = onSearchChange,
            placeholder = { Text("Pesquisar vídeo (ex: gode, forro)...") },
            leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(10.dp))

        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            // Cards grandes de Subpastas acima da lista de vídeos
            if (!state.isAllFoldersMode && state.currentSubfolders.isNotEmpty()) {
                items(state.currentSubfolders, key = { "sub_${it.id}" }) { sub ->
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
                                .background(Color(0x2638BDF8))
                        ) {
                            Icon(Icons.Rounded.Folder, contentDescription = null, tint = Color(0xFF38BDF8), modifier = Modifier.size(28.dp))
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
                        Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = Color(0xFF38BDF8), modifier = Modifier.size(28.dp))
                    }
                }
            }

            itemsIndexed(state.visibleVideos, key = { _, item -> item.id }) { index, item ->
                val isCurrent = item.id == state.currentVideo?.id
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (isCurrent) Color(0x2638BDF8) else Color.Transparent, RoundedCornerShape(14.dp))
                        .clickable { onSelectVideo(item) }
                        .padding(horizontal = 12.dp, vertical = 10.dp)
                ) {
                    Text(
                        text = "%02d".format(index + 1),
                        color = if (isCurrent) Color(0xFF38BDF8) else Color(0xFF64748B),
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
                                color = Color(0xFF38BDF8),
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
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
                ) {
                    Text("Excluir")
                }
            },
            dismissButton = {
                TextButton(onClick = onCancelDelete) {
                    Text("Cancelar")
                }
            }
        )
    }
}

@Composable
private fun AllFoldersFilterDialog(
    folders: List<FolderEntry>,
    initialSelectedIds: Set<String>?,
    onDismiss: () -> Unit,
    onApply: (Set<String>?) -> Unit
) {
    var draftSelected by remember(folders, initialSelectedIds) {
        mutableStateOf(
            initialSelectedIds ?: folders.map { it.id }.toSet()
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
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
                        Text("Marcar todas", color = Color(0xFF38BDF8))
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
                                colors = CheckboxDefaults.colors(checkedColor = Color(0xFF38BDF8))
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
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7))
            ) {
                Text("Aplicar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        }
    )
}
