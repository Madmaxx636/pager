import QtQuick
import QtMultimedia

// Plays the little sounds (loaded the first time one is needed, so the sound libraries stay out of memory until then).
Item {
    id: root
    // the small made-up sounds are WAV files (SoundEffect); a sound of your own can be any format (MediaPlayer)
    function play(file, volume) {
        const v = Math.max(0, Math.min(1, volume))
        if (/\.wav$/i.test(file)) { fx.source = "file://" + file; fx.volume = v; fx.play() }
        else { out.volume = v; player.source = "file://" + file; player.play() }
    }
    SoundEffect { id: fx }
    MediaPlayer { id: player; audioOutput: AudioOutput { id: out } }
}
