package com.autocine.player.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
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
    val colorTheme: AppColorTheme = AppColorTheme.AUTOMOTIVE_BLUE
)

class PreferencesManager(private val context: Context) {

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
                ?: AppColorTheme.AUTOMOTIVE_BLUE
        )
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
}
