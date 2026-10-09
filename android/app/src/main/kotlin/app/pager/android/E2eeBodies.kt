package app.pager.android

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject

/** Tidying of the request bodies the encryption library hands us, so a real homeserver accepts them. (No native code here, so it is easy to test.) */
object E2eeBodies {
    /** The library writes "not there" as null (for example `"device_keys": null`). Synapse refuses nulls, so drop them everywhere. */
    fun stripNulls(e: JsonElement): JsonElement = when (e) {
        is JsonObject -> JsonObject(e.filterValues { it !is JsonNull }.mapValues { stripNulls(it.value) })
        is JsonArray -> JsonArray(e.map { stripNulls(it) })
        else -> e
    }

    /** A to-device request body must look like {"messages": {user: {device: content}}}; the library may hand over just the inner map. */
    fun toDevice(body: JsonElement): JsonElement {
        val clean = stripNulls(body)
        return if (clean is JsonObject && clean.containsKey("messages")) clean else JsonObject(mapOf("messages" to clean))
    }

    /**
     * The library wants a restored backup as a LIST of keys, each saying which room and session it belongs to. A backup holds them as
     * room -> session -> key data, without those two names inside, so put them in.
     */
    fun backupToExport(byRoom: JsonObject): JsonArray = JsonArray(
        byRoom.flatMap { (roomId, sessions) ->
            (sessions as? JsonObject)?.mapNotNull { (sessionId, data) ->
                (data as? JsonObject)?.let { JsonObject(it + mapOf("room_id" to kotlinx.serialization.json.JsonPrimitive(roomId), "session_id" to kotlinx.serialization.json.JsonPrimitive(sessionId))) }
            } ?: emptyList()
        },
    )
}
