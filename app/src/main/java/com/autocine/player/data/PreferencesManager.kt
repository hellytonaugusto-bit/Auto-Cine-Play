package com.autocine.player.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
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

data class SavedPlayerPrefs(
    val folderUri: String = "",
    val folderDisplayName: String = "Selecione uma pasta (USB / SD / Interna)",
    val playAllFolders: Boolean = false,
    val allFilterCustomized: Boolean = false,
    val selectedAllFolderIds: Set<String> = emptySet(),
    val lastVideoId: String = "",
    val playbackMode: PlaybackMode = PlaybackMode.SEQUENTIAL,
    val aspectRatio: AspectRatioOption = AspectRatioOption.FIT,
    val sortOrder: SortOrder = SortOrder.NAME_ASC
)

class PreferencesManager(private val context: Context) {

    private object Keys {
        val FOLDER_URI = stringPreferencesKey("saved_folder_uri")
        val FOLDER_NAME = stringPreferencesKey("saved_folder_name")
        val PLAY_ALL_FOLDERS = booleanPreferencesKey("play_all_folders")
        val ALL_FILTER_CUSTOMIZED = booleanPreferencesKey("all_filter_customized")
        val SELECTED_ALL_FOLDERS = stringSetPreferencesKey("selected_all_folders")
        val LAST_VIDEO_ID = stringPreferencesKey("last_video_id")
        val PLAYBACK_MODE = stringPreferencesKey("playback_mode")
        val ASPECT_RATIO = stringPreferencesKey("aspect_ratio")
        val SORT_ORDER = stringPreferencesKey("sort_order")
    }

    val prefsFlow: Flow<SavedPlayerPrefs> = context.dataStore.data.map { prefs ->
        SavedPlayerPrefs(
            folderUri = prefs[Keys.FOLDER_URI].orEmpty(),
            folderDisplayName = prefs[Keys.FOLDER_NAME] ?: "Selecione uma pasta (USB / SD / Interna)",
            playAllFolders = prefs[Keys.PLAY_ALL_FOLDERS] ?: false,
            allFilterCustomized = prefs[Keys.ALL_FILTER_CUSTOMIZED] ?: false,
            selectedAllFolderIds = prefs[Keys.SELECTED_ALL_FOLDERS] ?: emptySet(),
            lastVideoId = prefs[Keys.LAST_VIDEO_ID].orEmpty(),
            playbackMode = prefs[Keys.PLAYBACK_MODE]
                ?.let { runCatching { PlaybackMode.valueOf(it) }.getOrNull() }
                ?: PlaybackMode.SEQUENTIAL,
            aspectRatio = prefs[Keys.ASPECT_RATIO]
                ?.let { runCatching { AspectRatioOption.valueOf(it) }.getOrNull() }
                ?: AspectRatioOption.FIT,
            sortOrder = prefs[Keys.SORT_ORDER]
                ?.let { runCatching { SortOrder.valueOf(it) }.getOrNull() }
                ?: SortOrder.NAME_ASC
        )
    }

    suspend fun saveFolder(uri: String, displayName: String) {
        context.dataStore.edit {
            it[Keys.FOLDER_URI] = uri
            it[Keys.FOLDER_NAME] = displayName
            it[Keys.PLAY_ALL_FOLDERS] = false
        }
    }

    suspend fun savePlayAllFolders(enabled: Boolean) {
        context.dataStore.edit { it[Keys.PLAY_ALL_FOLDERS] = enabled }
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

    suspend fun savePlaybackMode(mode: PlaybackMode) {
        context.dataStore.edit { it[Keys.PLAYBACK_MODE] = mode.name }
    }

    suspend fun saveAspectRatio(ratio: AspectRatioOption) {
        context.dataStore.edit { it[Keys.ASPECT_RATIO] = ratio.name }
    }

    suspend fun saveSortOrder(order: SortOrder) {
        context.dataStore.edit { it[Keys.SORT_ORDER] = order.name }
    }
}
