package com.autocine.player.data

import android.content.Context
import android.os.Build
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.autocine.player.ui.theme.AppColorTheme
import com.autocine.player.ui.theme.UiScaleLevel
import com.autocine.player.vlc.AspectRatioOption
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "autocine_prefs")

enum class PlaybackMode(val label: String) {
    SEQUENTIAL("Sequencial"),
    SHUFFLE("Aleatório"),
    REPEAT_ONE("Repetir");

    fun next(): PlaybackMode = entries[(ordinal + 1) % entries.size]
}

enum class StorageSlot(val label: String) {
    ALL("Todas"),
    USB("Pen Drive"),
    SD_CARD("Cartão SD"),
    INTERNAL("Interna")
}

/**
 * Snapshot persistido de forma síncrona (SharedPreferences) para retomar automaticamente
 * o último vídeo, pasta/subpasta de origem e posição exata mesmo se o app for fechado abruptamente.
 */
data class LastPlaybackSnapshot(
    val videoId: String = "",
    val videoUri: String = "",
    val videoName: String = "",
    val folderUri: String = "",
    val folderName: String = "",
    val relativePath: List<String> = emptyList(),
    val storageSlot: StorageSlot = StorageSlot.USB,
    val isAllFoldersMode: Boolean = false,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L
)

data class SavedPlayerPrefs(
    val folderUri: String = "",
    val folderDisplayName: String = "Selecione uma pasta (USB / SD / Interna)",
    val activeStorageSlot: StorageSlot = StorageSlot.USB,
    val usbFolderUri: String = "",
    val usbFolderName: String = "Pen Drive",
    val sdFolderUri: String = "",
    val sdFolderName: String = "Cartão SD",
    val playAllFolders: Boolean = false,
    val allFilterCustomized: Boolean = false,
    val selectedAllFolderIds: Set<String> = emptySet(),
    val lastVideoId: String = "",
    val lastPositionMs: Long = 0L,
    val playbackMode: PlaybackMode = PlaybackMode.SEQUENTIAL,
    val aspectRatio: AspectRatioOption = AspectRatioOption.FIT,
    val sortOrder: SortOrder = SortOrder.NAME_ASC,
    val uiScaleLevel: UiScaleLevel = UiScaleLevel.DEFAULT,
    val colorTheme: AppColorTheme = AppColorTheme.AUTOMOTIVE_BLUE,
    val startOnBoot: Boolean = true,
    val volumePercent: Int = 100
)

class PreferencesManager(private val context: Context) {

    companion object {
        private const val RESUME_PREFS_NAME = "autocine_resume_sync"
        private const val PATH_SEPARATOR = "\u001F"

        private const val SYNC_VIDEO_ID = "sync_video_id"
        private const val SYNC_VIDEO_URI = "sync_video_uri"
        private const val SYNC_VIDEO_NAME = "sync_video_name"
        private const val SYNC_FOLDER_URI = "sync_folder_uri"
        private const val SYNC_FOLDER_NAME = "sync_folder_name"
        private const val SYNC_RELATIVE_PATH = "sync_relative_path"
        private const val SYNC_STORAGE_SLOT = "sync_storage_slot"
        private const val SYNC_IS_ALL_MODE = "sync_is_all_mode"
        private const val SYNC_POSITION_MS = "sync_position_ms"
        private const val SYNC_DURATION_MS = "sync_duration_ms"
        private const val SYNC_START_ON_BOOT = "sync_start_on_boot"
        private const val SYNC_VOLUME_PERCENT = "sync_volume_percent"
    }

    private val syncStorageContext: Context = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        context.applicationContext.createDeviceProtectedStorageContext() ?: context.applicationContext
    } else {
        context.applicationContext
    }

    private val resumePrefs = syncStorageContext.getSharedPreferences(
        RESUME_PREFS_NAME,
        Context.MODE_PRIVATE
    )

    private object Keys {
        val FOLDER_URI = stringPreferencesKey("saved_folder_uri")
        val FOLDER_NAME = stringPreferencesKey("saved_folder_name")
        val ACTIVE_STORAGE_SLOT = stringPreferencesKey("active_storage_slot")
        val USB_FOLDER_URI = stringPreferencesKey("usb_folder_uri")
        val USB_FOLDER_NAME = stringPreferencesKey("usb_folder_name")
        val SD_FOLDER_URI = stringPreferencesKey("sd_folder_uri")
        val SD_FOLDER_NAME = stringPreferencesKey("sd_folder_name")
        val PLAY_ALL_FOLDERS = booleanPreferencesKey("play_all_folders")
        val ALL_FILTER_CUSTOMIZED = booleanPreferencesKey("all_filter_customized")
        val SELECTED_ALL_FOLDERS = stringSetPreferencesKey("selected_all_folders")
        val LAST_VIDEO_ID = stringPreferencesKey("last_video_id")
        val LAST_POSITION_MS = longPreferencesKey("last_position_ms")
        val PLAYBACK_MODE = stringPreferencesKey("playback_mode")
        val ASPECT_RATIO = stringPreferencesKey("aspect_ratio")
        val SORT_ORDER = stringPreferencesKey("sort_order")
        val UI_SCALE_LEVEL = stringPreferencesKey("ui_scale_level")
        val COLOR_THEME = stringPreferencesKey("color_theme")
        val START_ON_BOOT = booleanPreferencesKey("start_on_boot")
        val VOLUME_PERCENT = intPreferencesKey("volume_percent")
    }

    val prefsFlow: Flow<SavedPlayerPrefs> = context.dataStore.data.map { prefs ->
        SavedPlayerPrefs(
            folderUri = prefs[Keys.FOLDER_URI].orEmpty(),
            folderDisplayName = prefs[Keys.FOLDER_NAME] ?: "Selecione uma pasta (USB / SD / Interna)",
            activeStorageSlot = prefs[Keys.ACTIVE_STORAGE_SLOT]
                ?.let { runCatching { StorageSlot.valueOf(it) }.getOrNull() }
                ?: StorageSlot.USB,
            usbFolderUri = prefs[Keys.USB_FOLDER_URI].orEmpty(),
            usbFolderName = prefs[Keys.USB_FOLDER_NAME] ?: "Pen Drive",
            sdFolderUri = prefs[Keys.SD_FOLDER_URI].orEmpty(),
            sdFolderName = prefs[Keys.SD_FOLDER_NAME] ?: "Cartão SD",
            playAllFolders = prefs[Keys.PLAY_ALL_FOLDERS] ?: false,
            allFilterCustomized = prefs[Keys.ALL_FILTER_CUSTOMIZED] ?: false,
            selectedAllFolderIds = prefs[Keys.SELECTED_ALL_FOLDERS] ?: emptySet(),
            lastVideoId = prefs[Keys.LAST_VIDEO_ID].orEmpty(),
            lastPositionMs = (prefs[Keys.LAST_POSITION_MS] ?: 0L).coerceAtLeast(0L),
            playbackMode = prefs[Keys.PLAYBACK_MODE]
                ?.let { runCatching { PlaybackMode.valueOf(it) }.getOrNull() }
                ?: PlaybackMode.SEQUENTIAL,
            aspectRatio = prefs[Keys.ASPECT_RATIO]
                ?.let { runCatching { AspectRatioOption.valueOf(it) }.getOrNull() }
                ?: AspectRatioOption.FIT,
            sortOrder = prefs[Keys.SORT_ORDER]
                ?.let { runCatching { SortOrder.valueOf(it) }.getOrNull() }
                ?: SortOrder.NAME_ASC,
            uiScaleLevel = prefs[Keys.UI_SCALE_LEVEL]
                ?.let { runCatching { UiScaleLevel.valueOf(it) }.getOrNull() }
                ?: UiScaleLevel.DEFAULT,
            colorTheme = prefs[Keys.COLOR_THEME]
                ?.let { runCatching { AppColorTheme.valueOf(it) }.getOrNull() }
                ?: AppColorTheme.AUTOMOTIVE_BLUE,
            startOnBoot = prefs[Keys.START_ON_BOOT] ?: resumePrefs.getBoolean(SYNC_START_ON_BOOT, true),
            volumePercent = (prefs[Keys.VOLUME_PERCENT] ?: resumePrefs.getInt(SYNC_VOLUME_PERCENT, 100)).coerceIn(0, 100)
        )
    }

    fun readLastPlaybackSync(): LastPlaybackSnapshot {
        val rawPath = resumePrefs.getString(SYNC_RELATIVE_PATH, "").orEmpty()
        val relPath = if (rawPath.isEmpty()) emptyList() else rawPath.split(PATH_SEPARATOR).filter { it.isNotEmpty() }
        val slot = resumePrefs.getString(SYNC_STORAGE_SLOT, null)
            ?.let { runCatching { StorageSlot.valueOf(it) }.getOrNull() }
            ?: StorageSlot.USB
        return LastPlaybackSnapshot(
            videoId = resumePrefs.getString(SYNC_VIDEO_ID, "").orEmpty(),
            videoUri = resumePrefs.getString(SYNC_VIDEO_URI, "").orEmpty(),
            videoName = resumePrefs.getString(SYNC_VIDEO_NAME, "").orEmpty(),
            folderUri = resumePrefs.getString(SYNC_FOLDER_URI, "").orEmpty(),
            folderName = resumePrefs.getString(SYNC_FOLDER_NAME, "").orEmpty(),
            relativePath = relPath,
            storageSlot = slot,
            isAllFoldersMode = resumePrefs.getBoolean(SYNC_IS_ALL_MODE, false),
            positionMs = resumePrefs.getLong(SYNC_POSITION_MS, 0L).coerceAtLeast(0L),
            durationMs = resumePrefs.getLong(SYNC_DURATION_MS, 0L).coerceAtLeast(0L)
        )
    }

    fun saveLastPlaybackSync(snapshot: LastPlaybackSnapshot, commitImmediately: Boolean = false) {
        val editor = resumePrefs.edit()
            .putString(SYNC_VIDEO_ID, snapshot.videoId)
            .putString(SYNC_VIDEO_URI, snapshot.videoUri)
            .putString(SYNC_VIDEO_NAME, snapshot.videoName)
            .putString(SYNC_FOLDER_URI, snapshot.folderUri)
            .putString(SYNC_FOLDER_NAME, snapshot.folderName)
            .putString(SYNC_RELATIVE_PATH, snapshot.relativePath.joinToString(PATH_SEPARATOR))
            .putString(SYNC_STORAGE_SLOT, snapshot.storageSlot.name)
            .putBoolean(SYNC_IS_ALL_MODE, snapshot.isAllFoldersMode)
            .putLong(SYNC_POSITION_MS, snapshot.positionMs.coerceAtLeast(0L))
            .putLong(SYNC_DURATION_MS, snapshot.durationMs.coerceAtLeast(0L))
        if (commitImmediately) {
            editor.commit()
        } else {
            editor.apply()
        }
    }

    fun saveLastPositionSync(positionMs: Long, durationMs: Long, commitImmediately: Boolean = false) {
        val editor = resumePrefs.edit()
            .putLong(SYNC_POSITION_MS, positionMs.coerceAtLeast(0L))
            .putLong(SYNC_DURATION_MS, durationMs.coerceAtLeast(0L))
        if (commitImmediately) {
            editor.commit()
        } else {
            editor.apply()
        }
    }

    suspend fun saveFolder(uri: String, displayName: String, slot: StorageSlot = StorageSlot.USB) {
        context.dataStore.edit {
            it[Keys.FOLDER_URI] = uri
            it[Keys.FOLDER_NAME] = displayName
            it[Keys.ACTIVE_STORAGE_SLOT] = slot.name
            it[Keys.PLAY_ALL_FOLDERS] = false
            when (slot) {
                StorageSlot.USB -> {
                    it[Keys.USB_FOLDER_URI] = uri
                    it[Keys.USB_FOLDER_NAME] = displayName
                }
                StorageSlot.SD_CARD -> {
                    it[Keys.SD_FOLDER_URI] = uri
                    it[Keys.SD_FOLDER_NAME] = displayName
                }
                else -> Unit
            }
        }
    }

    suspend fun savePlayAllFolders(enabled: Boolean) {
        context.dataStore.edit {
            it[Keys.PLAY_ALL_FOLDERS] = enabled
            if (enabled) {
                it[Keys.ACTIVE_STORAGE_SLOT] = StorageSlot.ALL.name
            }
        }
    }

    suspend fun saveSelectedAllFolders(ids: Set<String>?) {
        context.dataStore.edit {
            if (ids == null) {
                it[Keys.ALL_FILTER_CUSTOMIZED] = false
                it.remove(Keys.SELECTED_ALL_FOLDERS)
            } else {
                it[Keys.ALL_FILTER_CUSTOMIZED] = true
                it[Keys.SELECTED_ALL_FOLDERS] = ids
            }
        }
    }

    suspend fun saveLastVideoId(id: String) {
        context.dataStore.edit { it[Keys.LAST_VIDEO_ID] = id }
    }

    suspend fun saveLastPositionMs(positionMs: Long) {
        context.dataStore.edit { it[Keys.LAST_POSITION_MS] = positionMs.coerceAtLeast(0L) }
    }

    suspend fun savePlaybackMode(mode: PlaybackMode) {
        context.dataStore.edit { it[Keys.PLAYBACK_MODE] = mode.name }
    }

    suspend fun saveAspectRatio(ratio: AspectRatioOption) {
        context.dataStore.edit { it[Keys.ASPECT_RATIO] = ratio.name }
    }

    suspend fun saveSortOrder(order: SortOrder) {
        context.dataStore.edit { it[Keys.SORT_ORDER] = order.name }
    }

    suspend fun saveUiScaleLevel(level: UiScaleLevel) {
        context.dataStore.edit { it[Keys.UI_SCALE_LEVEL] = level.name }
    }

    suspend fun saveColorTheme(theme: AppColorTheme) {
        context.dataStore.edit { it[Keys.COLOR_THEME] = theme.name }
    }

    fun isStartOnBootEnabledSync(): Boolean =
        resumePrefs.getBoolean(SYNC_START_ON_BOOT, true)

    suspend fun saveStartOnBoot(enabled: Boolean) {
        resumePrefs.edit().putBoolean(SYNC_START_ON_BOOT, enabled).commit()
        context.dataStore.edit { it[Keys.START_ON_BOOT] = enabled }
    }

    fun readVolumePercentSync(): Int =
        resumePrefs.getInt(SYNC_VOLUME_PERCENT, 100).coerceIn(0, 100)

    fun saveVolumePercentSync(percent: Int) {
        resumePrefs.edit().putInt(SYNC_VOLUME_PERCENT, percent.coerceIn(0, 100)).apply()
    }

    suspend fun saveVolumePercent(percent: Int) {
        val clamped = percent.coerceIn(0, 100)
        resumePrefs.edit().putInt(SYNC_VOLUME_PERCENT, clamped).apply()
        context.dataStore.edit { it[Keys.VOLUME_PERCENT] = clamped }
    }
}
