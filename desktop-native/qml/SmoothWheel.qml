import QtQuick

// Wheel and touchpad scrolling that feels like a browser's.
//  - A mouse wheel pushes a target and the view eases toward it a little every frame (quick spins build up).
//  - A touchpad moves the view with your fingers, and when they lift the view keeps going and slows down on its own (a flick).
WheelHandler {
    id: h
    required property Flickable view
    property real notch: 0.9            // pixels per wheel unit: one click of a normal wheel (120 units) moves about 108 px
    property real settle: 0.075         // seconds the wheel glide takes to cover most of the distance to where it is heading
    property real goal: 0
    property var samples: []            // recent finger movements of a touchpad: [time, pixels]
    acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
    function bounds() { const lo = view.originY; return [lo, Math.max(lo, view.originY + view.contentHeight - view.height)] }
    onWheel: (e) => {
        if (!view) return
        const b = bounds(), lo = b[0], hi = b[1]
        if (hi <= lo) return
        // a touchpad reports pixels, or small steps that are not whole wheel clicks
        const touchpad = e.pixelDelta.y !== 0 || (e.angleDelta.y % 120 !== 0)
        const dy = e.pixelDelta.y !== 0 ? e.pixelDelta.y : e.angleDelta.y * (touchpad ? 1.0 : notch) * (e.inverted ? -1 : 1)
        if (touchpad) {
            frames.running = false; view.cancelFlick(); lift.stop()
            view.contentY = Math.max(lo, Math.min(hi, view.contentY - dy)); goal = view.contentY
            const now = Date.now(); samples.push([now, dy]); while (samples.length && now - samples[0][0] > 120) samples.shift()
            lift.restart()
            return
        }
        const from = frames.running ? goal : view.contentY
        goal = Math.max(lo, Math.min(hi, from - dy))
        view.cancelFlick()
        frames.running = true
    }
    // the fingers lifted: carry on at the speed they had
    property Timer lift: Timer {
        id: lift; interval: 55
        onTriggered: {
            const s = h.samples, now = Date.now(); h.samples = []
            if (s.length < 2) return
            const span = Math.max(30, now - s[0][0]); let sum = 0; for (const x of s) sum += x[1]
            const v = sum / span * 1000                                // pixels per second (positive: the view moves toward its start)
            if (Math.abs(v) > 200) h.view.flick(0, v * 1.15)           // (Flickable's own slowing down takes over)
        }
    }
    property FrameAnimation frames: FrameAnimation {
        id: frames
        onTriggered: {
            const b = h.bounds(), g = Math.max(b[0], Math.min(b[1], h.goal))
            const left = g - h.view.contentY
            if (Math.abs(left) < 0.4) { h.view.contentY = g; running = false; return }
            h.view.contentY += left * (1 - Math.exp(-frameTime / h.settle))       // the same speed whatever the frame rate
        }
    }
}
