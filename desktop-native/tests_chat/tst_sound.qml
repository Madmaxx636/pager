import QtQuick
import QtTest
import QtMultimedia
Item { width: 200; height: 100
  SoundEffect { id: fx }
  TestCase { name: "Sound"; when: windowShown
    function test_a_made_sound_loads() {
      const f = files.soundFile("chime"); verify(f.length > 0)
      fx.source = "file://" + f; tryVerify(function () { return fx.status === SoundEffect.Ready || fx.status === SoundEffect.Error }, 5000)
      compare(fx.status, SoundEffect.Ready)
    }
    function test_the_alert_tones_load() {
      for (const k of ["ring", "nudge"]) { const f = files.tone(k); verify(f.length > 0); fx.source = "file://" + f; tryVerify(function () { return fx.status !== SoundEffect.Loading }, 5000); compare(fx.status, SoundEffect.Ready) }
    } } }
