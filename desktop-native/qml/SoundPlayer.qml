import QtQuick
import QtMultimedia

// Plays the little sounds (loaded the first time one is needed, so the sound libraries stay out of memory until then).
Item {
    id: root
    function play(file, volume) { fx.source = "file://" + file; fx.volume = Math.max(0, Math.min(1, volume)); fx.play() }
    SoundEffect { id: fx }
}
