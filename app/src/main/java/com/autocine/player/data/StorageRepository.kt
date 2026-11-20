package com.autocine.player.data

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.text.Normalizer
import java.util.concurrent.ConcurrentHashMap

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
    val videoCount: Int = -1,
    val documentId: String = ""
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

        private val SAF_CHILD_PROJECTION = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED
        )

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

    // Cache em memória por pasta para navegação instantânea (0 ms) ao entrar/voltar.
    // Só é limpo quando o usuário toca em "Atualizar" ou exclui um arquivo.
    private val directoryCache = ConcurrentHashMap<String, DirectorySnapshot>()
    private val allFoldersCache = ConcurrentHashMap<String, List<VideoFileItem>>()
    private val safDocumentIdCache = ConcurrentHashMap<String, String>()

    private fun buildDirCacheKey(rootUriString: String, relativePath: List<String>): String =
        "$rootUriString::${relativePath.joinToString("/")}"

    /**
     * Retorna instantaneamente o snapshot em cache (0 ms) sem bloquear ou acessar o Pen Drive.
     */
    fun getCachedDirectoryEntries(
        rootUriString: String,
        relativePath: List<String> = emptyList()
    ): DirectorySnapshot? {
        if (rootUriString.isEmpty()) return null
        return directoryCache[buildDirCacheKey(rootUriString, relativePath)]
    }

    fun getCachedAllFolders(
        savedFolderUri: String,
        selectedFolderIds: Set<String>?
    ): List<VideoFileItem>? {
        val key = buildAllCacheKey(savedFolderUri, selectedFolderIds)
        return allFoldersCache[key]
    }

    private fun buildAllCacheKey(savedFolderUri: String, selectedFolderIds: Set<String>?): String {
        val sel = selectedFolderIds?.sorted()?.joinToString(",") ?: "__ALL__"
        return "$savedFolderUri::$sel"
    }

    fun invalidateAllCaches() {
        directoryCache.clear()
        allFoldersCache.clear()
        safDocumentIdCache.clear()
    }

    /**
     * Lista subpastas imediatas + vídeos do diretório atual de forma ultrarrápida:
     * 1) Usa cache em memória (0 ms) quando já visitado (a menos que forceRefresh == true).
     * 2) Prefere acesso físico direto via java.io.File.listFiles() sempre que acessível.
     * 3) No fallback SAF, faz UMA ÚNICA query de cursor (DocumentsContract) em vez de centenas de IPCs do DocumentFile.
     * 4) Nunca roda MediaMetadataRetriever nem conta arquivos dentro de subpastas durante a listagem.
     */
    suspend fun scanDirectoryEntries(
        rootUriString: String,
        relativePath: List<String> = emptyList(),
        knownDocumentId: String? = null,
        forceRefresh: Boolean = false
    ): DirectorySnapshot = withContext(Dispatchers.IO) {
        if (rootUriString.isEmpty()) return@withContext DirectorySnapshot(emptyList(), emptyList())

        val cacheKey = buildDirCacheKey(rootUriString, relativePath)
        if (!forceRefresh) {
            directoryCache[cacheKey]?.let { return@withContext it }
        }

        val snapshot = if (rootUriString.startsWith("content://")) {
            val treeUri = Uri.parse(rootUriString)
            val directDir = tryResolvePhysicalDirectory(treeUri, relativePath)
            if (directDir != null) {
                scanDirectDirectorySnapshot(directDir, relativePath)
            } else {
                scanSafDirectoryFast(treeUri, relativePath, knownDocumentId)
            }
        } else {
            val targetDir = relativePath.fold(File(rootUriString)) { acc, seg -> File(acc, seg) }
            scanDirectDirectorySnapshot(targetDir, relativePath)
        }

        directoryCache[cacheKey] = snapshot
        snapshot
    }

    /**
     * Tenta mapear uma URI SAF (ex: primary:Movies ou XXXX-XXXX:Videos) para o caminho físico
     * java.io.File quando o dispositivo concede leitura direta (muito mais rápido em Pen Drives USB).
     */
    private fun tryResolvePhysicalDirectory(treeUri: Uri, relativePath: List<String>): File? {
        val treeDocId = runCatching { DocumentsContract.getTreeDocumentId(treeUri) }.getOrNull() ?: return null
        val parts = treeDocId.split(":", limit = 2)
        if (parts.isEmpty()) return null
        val volumeId = parts[0]
        val subPath = parts.getOrNull(1).orEmpty().trim('/')

        val candidateRoots = mutableListOf<File>()
        if (volumeId.equals("primary", ignoreCase = true)) {
            Environment.getExternalStorageDirectory()?.let { candidateRoots.add(it) }
        } else if (volumeId.isNotBlank()) {
            candidateRoots.add(File("/storage/$volumeId"))
            candidateRoots.add(File("/mnt/media_rw/$volumeId"))
            candidateRoots.add(File("/mnt/usb_storage/$volumeId"))
            candidateRoots.add(File("/mnt/external_sd/$volumeId"))
        }

        for (base in candidateRoots) {
            var dir = if (subPath.isNotEmpty()) File(base, subPath) else base
            for (seg in relativePath) {
                dir = File(dir, seg)
            }
            if (dir.exists() && dir.isDirectory && dir.canRead() && dir.listFiles() != null) {
                return dir
            }
        }
        return null
    }

    /**
     * Listagem SAF de altíssima performance usando 1 única query de cursor por pasta
     * (evita os 4 IPCs por arquivo da API DocumentFile.listFiles()).
     */
    private fun scanSafDirectoryFast(
        treeUri: Uri,
        relativePath: List<String>,
        knownDocumentId: String?
    ): DirectorySnapshot {
        val targetDocId = resolveSafDocumentIdFast(treeUri, relativePath, knownDocumentId)
            ?: return DirectorySnapshot(emptyList(), emptyList())

        val currentName = relativePath.lastOrNull()
            ?: targetDocId.substringAfterLast('/').substringAfterLast(':').ifBlank { "Pasta USB" }
        val currentFolderId = "saf:" + relativePath.joinToString("/")

        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, targetDocId)
        val subfolders = mutableListOf<FolderEntry>()
        val videos = mutableListOf<VideoFileItem>()

        runCatching {
            context.contentResolver.query(
                childrenUri,
                SAF_CHILD_PROJECTION,
                null,
                null,
                null
            )?.use { cursor ->
                val idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                val nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                val mimeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
                val sizeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
                val modCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)

                while (cursor.moveToNext()) {
                    val docId = if (idCol >= 0) cursor.getString(idCol) else null
                    val name = if (nameCol >= 0) cursor.getString(nameCol) else null
                    if (docId.isNullOrEmpty() || name.isNullOrEmpty() || name.startsWith(".")) continue

                    val mime = if (mimeCol >= 0) cursor.getString(mimeCol) else ""
                    if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                        val childPath = relativePath + name
                        val childKey = buildDirCacheKey(treeUri.toString(), childPath)
                        safDocumentIdCache[childKey] = docId
                        subfolders.add(
                            FolderEntry(
                                id = "saf:" + childPath.joinToString("/"),
                                name = name,
                                relativePath = childPath,
                                sourceLabel = "Pen Drive / Pasta SAF",
                                depth = childPath.size,
                                videoCount = -1,
                                documentId = docId
                            )
                        )
                    } else {
                        val ext = name.substringAfterLast('.', "").lowercase()
                        if (ext in VIDEO_EXTENSIONS) {
                            val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
                            val size = if (sizeCol >= 0 && !cursor.isNull(sizeCol)) cursor.getLong(sizeCol) else 0L
                            val mod = if (modCol >= 0 && !cursor.isNull(modCol)) cursor.getLong(modCol) else 0L
                            videos.add(
                                VideoFileItem(
                                    id = docUri.toString(),
                                    uri = docUri,
                                    name = name,
                                    sizeBytes = size,
                                    lastModified = mod,
                                    isSafDocument = true,
                                    folderName = currentName,
                                    folderId = currentFolderId
                                )
                            )
                        }
                    }
                }
            }
        }

        return DirectorySnapshot(
            subfolders = subfolders.sortedBy { normalizeForSearch(it.name) },
            videos = videos
        )
    }

    private fun resolveSafDocumentIdFast(
        treeUri: Uri,
        relativePath: List<String>,
        knownDocumentId: String?
    ): String? {
        if (!knownDocumentId.isNullOrEmpty()) return knownDocumentId
        val cacheKey = buildDirCacheKey(treeUri.toString(), relativePath)
        safDocumentIdCache[cacheKey]?.let { return it }

        var currentDocId = runCatching { DocumentsContract.getTreeDocumentId(treeUri) }.getOrNull()
            ?: return null
        if (relativePath.isEmpty()) {
            safDocumentIdCache[cacheKey] = currentDocId
            return currentDocId
        }

        val walked = mutableListOf<String>()
        for (segment in relativePath) {
            walked.add(segment)
            val segKey = buildDirCacheKey(treeUri.toString(), walked)
            val cached = safDocumentIdCache[segKey]
            if (cached != null) {
                currentDocId = cached
                continue
            }
            val foundId = findChildDirectoryId(treeUri, currentDocId, segment) ?: return null
            safDocumentIdCache[segKey] = foundId
            currentDocId = foundId
        }
        return currentDocId
    }

    private fun findChildDirectoryId(treeUri: Uri, parentDocId: String, targetName: String): String? {
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE
        )
        return runCatching {
            context.contentResolver.query(childrenUri, projection, null, null, null)?.use { cursor ->
                val idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                val nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                val mimeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
                while (cursor.moveToNext()) {
                    val mime = if (mimeCol >= 0) cursor.getString(mimeCol) else ""
                    val name = if (nameCol >= 0) cursor.getString(nameCol) else null
                    if (mime == DocumentsContract.Document.MIME_TYPE_DIR && name == targetName) {
                        return@use if (idCol >= 0) cursor.getString(idCol) else null
                    }
                }
                null
            }
        }.getOrNull()
    }

    /**
     * Descobre todas as pastas e subpastas disponíveis (acesso direto/SAF + buckets do MediaStore)
     * para o usuário escolher manualmente quais entram no modo "Todas".
     */
    suspend fun discoverSelectableFolders(savedRootUri: String): List<FolderEntry> = withContext(Dispatchers.IO) {
        val entries = mutableListOf<FolderEntry>()

        if (savedRootUri.isNotEmpty()) {
            if (savedRootUri.startsWith("content://")) {
                val treeUri = Uri.parse(savedRootUri)
                val directRoot = tryResolvePhysicalDirectory(treeUri, emptyList())
                if (directRoot != null) {
                    collectDirectFolders(directRoot, emptyList(), 0, entries)
                } else {
                    val rootId = runCatching { DocumentsContract.getTreeDocumentId(treeUri) }.getOrNull()
                    if (rootId != null) {
                        val rootName = DocumentFile.fromTreeUri(context, treeUri)?.name ?: "Pasta Raiz"
                        collectSafFoldersFast(treeUri, rootId, rootName, emptyList(), 0, entries)
                    }
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
     * pelo usuário (ou todas disponíveis quando selectedFolderIds == null), com cache em memória.
     */
    suspend fun scanAllFoldersCombined(
        savedFolderUri: String,
        selectedFolderIds: Set<String>? = null,
        forceRefresh: Boolean = false
    ): List<VideoFileItem> = withContext(Dispatchers.IO) {
        val cacheKey = buildAllCacheKey(savedFolderUri, selectedFolderIds)
        if (!forceRefresh) {
            allFoldersCache[cacheKey]?.let { return@withContext it }
        }

        val uniqueById = LinkedHashMap<String, VideoFileItem>()

        if (savedFolderUri.isNotEmpty()) {
            val fromSaved = if (savedFolderUri.startsWith("content://")) {
                val treeUri = Uri.parse(savedFolderUri)
                val directRoot = tryResolvePhysicalDirectory(treeUri, emptyList())
                if (directRoot != null) {
                    scanDirectDirectory(directRoot, recursive = true)
                } else {
                    scanSafTreeFast(treeUri)
                }
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

        val result = uniqueById.values.toList()
        allFoldersCache[cacheKey] = result
        result
    }

    private fun collectSafFoldersFast(
        treeUri: Uri,
        docId: String,
        displayName: String,
        path: List<String>,
        depth: Int,
        out: MutableList<FolderEntry>
    ) {
        if (depth > 6) return
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId)
        val subDirs = mutableListOf<Pair<String, String>>()
        var directVideos = 0

        runCatching {
            context.contentResolver.query(
                childrenUri,
                arrayOf(
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE
                ),
                null,
                null,
                null
            )?.use { cursor ->
                val idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                val nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                val mimeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
                while (cursor.moveToNext()) {
                    val childId = if (idCol >= 0) cursor.getString(idCol) else null
                    val name = if (nameCol >= 0) cursor.getString(nameCol) else null
                    val mime = if (mimeCol >= 0) cursor.getString(mimeCol) else ""
                    if (childId.isNullOrEmpty() || name.isNullOrEmpty() || name.startsWith(".")) continue
                    if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                        subDirs.add(childId to name)
                    } else if (name.substringAfterLast('.', "").lowercase() in VIDEO_EXTENSIONS) {
                        directVideos++
                    }
                }
            }
        }

        out.add(
            FolderEntry(
                id = "saf:" + path.joinToString("/"),
                name = displayName,
                relativePath = path,
                sourceLabel = "Pen Drive / Pasta SAF",
                depth = depth,
                videoCount = directVideos,
                documentId = docId
            )
        )

        subDirs
            .sortedBy { normalizeForSearch(it.second) }
            .forEach { (subId, subName) ->
                collectSafFoldersFast(treeUri, subId, subName, path + subName, depth + 1, out)
            }
    }

    private fun scanDirectDirectorySnapshot(current: File, relativePath: List<String>): DirectorySnapshot {
        if (!current.exists() || !current.isDirectory) return DirectorySnapshot(emptyList(), emptyList())
        val currentFolderId = "file:" + relativePath.joinToString("/")

        val children = current.listFiles().orEmpty()
        val subfolders = mutableListOf<FolderEntry>()
        val videos = mutableListOf<VideoFileItem>()

        for (child in children) {
            val name = child.name
            if (name.startsWith(".")) continue
            if (child.isDirectory) {
                val childPath = relativePath + name
                subfolders.add(
                    FolderEntry(
                        id = "file:" + childPath.joinToString("/"),
                        name = name,
                        relativePath = childPath,
                        sourceLabel = "Armazenamento Direto",
                        depth = childPath.size,
                        videoCount = -1
                    )
                )
            } else if (child.isFile) {
                val ext = name.substringAfterLast('.', "").lowercase()
                if (ext in VIDEO_EXTENSIONS) {
                    videos.add(
                        VideoFileItem(
                            id = child.absolutePath,
                            uri = Uri.fromFile(child),
                            name = name,
                            sizeBytes = child.length(),
                            lastModified = child.lastModified(),
                            isSafDocument = false,
                            folderName = current.name,
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

    private fun scanSafTreeFast(treeUri: Uri): List<VideoFileItem> {
        val rootId = runCatching { DocumentsContract.getTreeDocumentId(treeUri) }.getOrNull()
            ?: return emptyList()
        val collected = mutableListOf<VideoFileItem>()

        fun walk(docId: String, dirName: String, path: List<String>, depth: Int) {
            if (depth > 8) return
            val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId)
            val folderId = "saf:" + path.joinToString("/")
            val nextDirs = mutableListOf<Pair<String, String>>()

            runCatching {
                context.contentResolver.query(
                    childrenUri,
                    SAF_CHILD_PROJECTION,
                    null,
                    null,
                    null
                )?.use { cursor ->
                    val idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                    val nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                    val mimeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
                    val sizeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
                    val modCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)

                    while (cursor.moveToNext()) {
                        val childId = if (idCol >= 0) cursor.getString(idCol) else null
                        val name = if (nameCol >= 0) cursor.getString(nameCol) else null
                        val mime = if (mimeCol >= 0) cursor.getString(mimeCol) else ""
                        if (childId.isNullOrEmpty() || name.isNullOrEmpty() || name.startsWith(".")) continue
                        if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                            nextDirs.add(childId to name)
                        } else if (name.substringAfterLast('.', "").lowercase() in VIDEO_EXTENSIONS) {
                            val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, childId)
                            val size = if (sizeCol >= 0 && !cursor.isNull(sizeCol)) cursor.getLong(sizeCol) else 0L
                            val mod = if (modCol >= 0 && !cursor.isNull(modCol)) cursor.getLong(modCol) else 0L
                            collected.add(
                                VideoFileItem(
                                    id = docUri.toString(),
                                    uri = docUri,
                                    name = name,
                                    sizeBytes = size,
                                    lastModified = mod,
                                    isSafDocument = true,
                                    folderName = dirName,
                                    folderId = folderId
                                )
                            )
                        }
                    }
                }
            }

            nextDirs.forEach { (subId, subName) ->
                walk(subId, subName, path + subName, depth + 1)
            }
        }

        val rootName = DocumentFile.fromTreeUri(context, treeUri)?.name ?: "Pasta USB"
        walk(rootId, rootName, emptyList(), 0)
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
        val deleted = if (item.isSafDocument) {
            DocumentFile.fromSingleUri(context, item.uri)?.delete() == true
        } else {
            File(item.id).delete()
        }
        if (deleted) {
            invalidateAllCaches()
        }
        deleted
    }
}
