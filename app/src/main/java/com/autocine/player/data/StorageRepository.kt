package com.autocine.player.data

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.text.Normalizer

enum class SortOrder(val label: String) {
    NAME_ASC("Nome (A–Z)"),
    NAME_DESC("Nome (Z–A)"),
    DATE_DESC("Mais recentes");

    fun next(): SortOrder = entries[(ordinal + 1) % entries.size]
}

data class VideoFileItem(
    val id: String,
    val uri: Uri,
    val name: String,
    val sizeBytes: Long,
    val lastModified: Long,
    val isSafDocument: Boolean,
    val folderName: String = "",
    val folderId: String = ""
)

data class FolderEntry(
    val id: String,
    val name: String,
    val relativePath: List<String>,
    val sourceLabel: String,
    val depth: Int = 0,
    val videoCount: Int = 0
)

data class DirectorySnapshot(
    val subfolders: List<FolderEntry>,
    val videos: List<VideoFileItem>
)

class StorageRepository(private val context: Context) {

    companion object {
        private val VIDEO_EXTENSIONS = setOf(
            "mp4", "mkv", "avi", "mov", "wmv", "flv",
            "webm", "ts", "mpg", "mpeg", "3gp", "m4v", "vob"
        )

        private val DIACRITICS_REGEX = Regex("\\p{InCombiningDiacriticalMarks}+")

        /**
         * Normaliza texto removendo acentos e ignorando maiúsculas/minúsculas.
         * Ex.: "pagode e forró.mp4" -> "pagode e forro.mp4" (encontrado por "gode" ou "forro").
         */
        fun normalizeForSearch(input: String): String {
            val nfd = Normalizer.normalize(input, Normalizer.Form.NFD)
            return DIACRITICS_REGEX.replace(nfd, "").lowercase().trim()
        }

        fun filterBySubstring(items: List<VideoFileItem>, query: String): List<VideoFileItem> {
            val normalizedQuery = normalizeForSearch(query)
            if (normalizedQuery.isEmpty()) return items
            return items.filter { normalizeForSearch(it.name).contains(normalizedQuery) }
        }

        fun sortItems(items: List<VideoFileItem>, sortOrder: SortOrder): List<VideoFileItem> =
            when (sortOrder) {
                SortOrder.NAME_ASC -> items.sortedBy { normalizeForSearch(it.name) }
                SortOrder.NAME_DESC -> items.sortedByDescending { normalizeForSearch(it.name) }
                SortOrder.DATE_DESC -> items.sortedByDescending { it.lastModified }
            }
    }

    /**
     * Lista subpastas imediatas + vídeos do diretório atual (suporta subpastas em múltiplos níveis
     * sem precisar reabrir o seletor SAF do sistema).
     */
    suspend fun scanDirectoryEntries(
        rootUriString: String,
        relativePath: List<String> = emptyList()
    ): DirectorySnapshot = withContext(Dispatchers.IO) {
        if (rootUriString.isEmpty()) return@withContext DirectorySnapshot(emptyList(), emptyList())
        if (rootUriString.startsWith("content://")) {
            scanSafDirectory(Uri.parse(rootUriString), relativePath)
        } else {
            scanDirectDirectorySnapshot(File(rootUriString), relativePath)
        }
    }

    /**
     * Descobre todas as pastas e subpastas disponíveis (SAF USB/SD + buckets do MediaStore)
     * para o usuário escolher manualmente quais entram no modo "Todas".
     */
    suspend fun discoverSelectableFolders(savedRootUri: String): List<FolderEntry> = withContext(Dispatchers.IO) {
        val entries = mutableListOf<FolderEntry>()

        if (savedRootUri.isNotEmpty()) {
            if (savedRootUri.startsWith("content://")) {
                val root = DocumentFile.fromTreeUri(context, Uri.parse(savedRootUri))
                if (root != null) {
                    collectSafFolders(root, emptyList(), 0, entries)
                }
            } else {
                val rootDir = File(savedRootUri)
                if (rootDir.exists() && rootDir.isDirectory) {
                    collectDirectFolders(rootDir, emptyList(), 0, entries)
                }
            }
        }

        val mediaStoreByFolder = queryMediaStoreVideos().groupBy { it.folderId }
        mediaStoreByFolder.forEach { (folderId, items) ->
            val displayName = items.firstOrNull()?.folderName ?: "Armazenamento"
            entries.add(
                FolderEntry(
                    id = folderId,
                    name = displayName,
                    relativePath = emptyList(),
                    sourceLabel = "Armazenamento do Dispositivo",
                    depth = 0,
                    videoCount = items.size
                )
            )
        }

        entries
    }

    /**
     * Modo "Todas as Pastas": combina vídeos das pastas e subpastas escolhidas manualmente
     * pelo usuário (ou todas disponíveis quando selectedFolderIds == null).
     */
    suspend fun scanAllFoldersCombined(
        savedFolderUri: String,
        selectedFolderIds: Set<String>? = null
    ): List<VideoFileItem> = withContext(Dispatchers.IO) {
        val uniqueById = LinkedHashMap<String, VideoFileItem>()

        if (savedFolderUri.isNotEmpty()) {
            val fromSaved = if (savedFolderUri.startsWith("content://")) {
                scanSafTree(Uri.parse(savedFolderUri), recursive = true)
            } else {
                scanDirectDirectory(File(savedFolderUri), recursive = true)
            }
            fromSaved
                .filter { selectedFolderIds == null || it.folderId in selectedFolderIds }
                .forEach { uniqueById[it.id] = it }
        }

        queryMediaStoreVideos()
            .filter { selectedFolderIds == null || it.folderId in selectedFolderIds }
            .forEach { item ->
                val duplicateByNameAndSize = uniqueById.values.any {
                    it.name == item.name && it.sizeBytes == item.sizeBytes
                }
                if (!duplicateByNameAndSize) {
                    uniqueById[item.id] = item
                }
            }

        uniqueById.values.toList()
    }

    private fun resolveSafTarget(treeUri: Uri, relativePath: List<String>): DocumentFile? {
        var current = DocumentFile.fromTreeUri(context, treeUri) ?: return null
        for (segment in relativePath) {
            current = current.listFiles().firstOrNull { it.isDirectory && it.name == segment }
                ?: return null
        }
        return current
    }

    private fun scanSafDirectory(treeUri: Uri, relativePath: List<String>): DirectorySnapshot {
        val current = resolveSafTarget(treeUri, relativePath)
            ?: return DirectorySnapshot(emptyList(), emptyList())
        val currentName = current.name ?: "Pasta USB"
        val currentFolderId = "saf:" + relativePath.joinToString("/")

        val subfolders = mutableListOf<FolderEntry>()
        val videos = mutableListOf<VideoFileItem>()

        for (doc in current.listFiles()) {
            val name = doc.name ?: continue
            if (doc.isDirectory) {
                val childPath = relativePath + name
                subfolders.add(
                    FolderEntry(
                        id = "saf:" + childPath.joinToString("/"),
                        name = name,
                        relativePath = childPath,
                        sourceLabel = "Pen Drive / Pasta SAF",
                        depth = childPath.size,
                        videoCount = countSafVideosQuick(doc)
                    )
                )
            } else if (doc.isFile) {
                val ext = name.substringAfterLast('.', "").lowercase()
                if (ext in VIDEO_EXTENSIONS) {
                    videos.add(
                        VideoFileItem(
                            id = doc.uri.toString(),
                            uri = doc.uri,
                            name = name,
                            sizeBytes = doc.length(),
                            lastModified = doc.lastModified(),
                            isSafDocument = true,
                            folderName = currentName,
                            folderId = currentFolderId
                        )
                    )
                }
            }
        }

        return DirectorySnapshot(
            subfolders = subfolders.sortedBy { normalizeForSearch(it.name) },
            videos = videos
        )
    }

    private fun countSafVideosQuick(dir: DocumentFile): Int =
        dir.listFiles().count { doc ->
            doc.isFile && doc.name?.substringAfterLast('.', "")?.lowercase().orEmpty() in VIDEO_EXTENSIONS
        }

    private fun collectSafFolders(
        dir: DocumentFile,
        path: List<String>,
        depth: Int,
        out: MutableList<FolderEntry>
    ) {
        if (depth > 6) return
        val children = dir.listFiles()
        val directVideos = children.count { doc ->
            doc.isFile && doc.name?.substringAfterLast('.', "")?.lowercase().orEmpty() in VIDEO_EXTENSIONS
        }
        out.add(
            FolderEntry(
                id = "saf:" + path.joinToString("/"),
                name = dir.name ?: "Pasta Raiz",
                relativePath = path,
                sourceLabel = "Pen Drive / Pasta SAF",
                depth = depth,
                videoCount = directVideos
            )
        )
        children
            .filter { it.isDirectory && !it.name.isNullOrBlank() }
            .sortedBy { normalizeForSearch(it.name.orEmpty()) }
            .forEach { sub ->
                collectSafFolders(sub, path + sub.name!!, depth + 1, out)
            }
    }

    private fun scanDirectDirectorySnapshot(rootDir: File, relativePath: List<String>): DirectorySnapshot {
        val current = relativePath.fold(rootDir) { acc, seg -> File(acc, seg) }
        if (!current.exists() || !current.isDirectory) return DirectorySnapshot(emptyList(), emptyList())
        val currentFolderId = "file:" + relativePath.joinToString("/")

        val children = current.listFiles().orEmpty()
        val subfolders = children
            .filter { it.isDirectory && !it.name.startsWith(".") }
            .sortedBy { normalizeForSearch(it.name) }
            .map { sub ->
                val childPath = relativePath + sub.name
                val directCount = sub.listFiles().orEmpty().count {
                    it.isFile && it.extension.lowercase() in VIDEO_EXTENSIONS
                }
                FolderEntry(
                    id = "file:" + childPath.joinToString("/"),
                    name = sub.name,
                    relativePath = childPath,
                    sourceLabel = "Armazenamento Direto",
                    depth = childPath.size,
                    videoCount = directCount
                )
            }

        val videos = children
            .filter { it.isFile && it.extension.lowercase() in VIDEO_EXTENSIONS }
            .map { file ->
                VideoFileItem(
                    id = file.absolutePath,
                    uri = Uri.fromFile(file),
                    name = file.name,
                    sizeBytes = file.length(),
                    lastModified = file.lastModified(),
                    isSafDocument = false,
                    folderName = current.name,
                    folderId = currentFolderId
                )
            }

        return DirectorySnapshot(subfolders = subfolders, videos = videos)
    }

    private fun collectDirectFolders(
        dir: File,
        path: List<String>,
        depth: Int,
        out: MutableList<FolderEntry>
    ) {
        if (depth > 6) return
        val children = dir.listFiles().orEmpty()
        val directVideos = children.count { it.isFile && it.extension.lowercase() in VIDEO_EXTENSIONS }
        out.add(
            FolderEntry(
                id = "file:" + path.joinToString("/"),
                name = dir.name.ifBlank { "Raiz" },
                relativePath = path,
                sourceLabel = "Armazenamento Direto",
                depth = depth,
                videoCount = directVideos
            )
        )
        children
            .filter { it.isDirectory && !it.name.startsWith(".") }
            .sortedBy { normalizeForSearch(it.name) }
            .forEach { sub ->
                collectDirectFolders(sub, path + sub.name, depth + 1, out)
            }
    }

    private fun scanSafTree(treeUri: Uri, recursive: Boolean): List<VideoFileItem> {
        val root = DocumentFile.fromTreeUri(context, treeUri) ?: return emptyList()
        val collected = mutableListOf<VideoFileItem>()

        fun walk(dir: DocumentFile, path: List<String>, depth: Int) {
            if (depth > 8) return
            val dirName = dir.name ?: "Pasta USB"
            val folderId = "saf:" + path.joinToString("/")
            for (doc in dir.listFiles()) {
                if (doc.isDirectory && recursive && !doc.name.isNullOrBlank()) {
                    walk(doc, path + doc.name!!, depth + 1)
                } else if (doc.isFile) {
                    val ext = doc.name?.substringAfterLast('.', "")?.lowercase().orEmpty()
                    if (ext in VIDEO_EXTENSIONS) {
                        collected.add(
                            VideoFileItem(
                                id = doc.uri.toString(),
                                uri = doc.uri,
                                name = doc.name ?: "video.mp4",
                                sizeBytes = doc.length(),
                                lastModified = doc.lastModified(),
                                isSafDocument = true,
                                folderName = dirName,
                                folderId = folderId
                            )
                        )
                    }
                }
            }
        }

        walk(root, emptyList(), 0)
        return collected
    }

    private fun scanDirectDirectory(dir: File, recursive: Boolean): List<VideoFileItem> {
        if (!dir.exists() || !dir.isDirectory) return emptyList()
        val sequence = if (recursive) dir.walkTopDown().maxDepth(8) else dir.listFiles().orEmpty().asSequence()
        return sequence
            .filter { it.isFile && it.extension.lowercase() in VIDEO_EXTENSIONS }
            .map { file ->
                val relDir = file.parentFile?.relativeToOrNull(dir)?.path.orEmpty()
                val folderId = "file:" + if (relDir == ".") "" else relDir
                VideoFileItem(
                    id = file.absolutePath,
                    uri = Uri.fromFile(file),
                    name = file.name,
                    sizeBytes = file.length(),
                    lastModified = file.lastModified(),
                    isSafDocument = false,
                    folderName = file.parentFile?.name ?: "Armazenamento",
                    folderId = folderId
                )
            }
            .toList()
    }

    private fun queryMediaStoreVideos(): List<VideoFileItem> {
        val results = mutableListOf<VideoFileItem>()
        val projection = arrayOf(
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.SIZE,
            MediaStore.Video.Media.DATE_MODIFIED,
            MediaStore.Video.Media.BUCKET_ID,
            MediaStore.Video.Media.BUCKET_DISPLAY_NAME
        )
        runCatching {
            context.contentResolver.query(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                "${MediaStore.Video.Media.DISPLAY_NAME} ASC"
            )?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
                val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
                val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)
                val modCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_MODIFIED)
                val bucketIdCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_ID)
                val bucketCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_DISPLAY_NAME)
                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idCol)
                    val name = cursor.getString(nameCol) ?: continue
                    val bucketId = cursor.getString(bucketIdCol) ?: "default"
                    val contentUri = ContentUris.withAppendedId(
                        MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                        id
                    )
                    results.add(
                        VideoFileItem(
                            id = contentUri.toString(),
                            uri = contentUri,
                            name = name,
                            sizeBytes = cursor.getLong(sizeCol),
                            lastModified = cursor.getLong(modCol) * 1000L,
                            isSafDocument = true,
                            folderName = cursor.getString(bucketCol) ?: "Dispositivo",
                            folderId = "bucket:$bucketId"
                        )
                    )
                }
            }
        }
        return results
    }

    suspend fun deleteVideo(item: VideoFileItem): Boolean = withContext(Dispatchers.IO) {
        if (item.isSafDocument) {
            DocumentFile.fromSingleUri(context, item.uri)?.delete() == true
        } else {
            File(item.id).delete()
        }
    }
}
