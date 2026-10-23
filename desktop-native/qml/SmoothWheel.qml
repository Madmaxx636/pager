import QtQuick

// Mouse-wheel and touchpad scrolling that glides like a browser's: each click pushes a target and the view eases toward it a little every frame, so quick spins build up speed instead of restarting.
WheelHandler {
    id: h
    required property Flickable view
    property real notch: 0.9            // pixels per wheel unit: one click of a normal wheel (120 units) moves about 108 px
    property real settle: 0.095         // seconds the view takes to cover most of the distance to where it is heading
    property real goal: 0
    acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
    function bounds() { const lo = view.originY; return [lo, Math.max(lo, view.originY + view.contentHeight - view.height)] }
    onWheel: (e) => {
        if (!view) return
        const b = bounds(), lo = b[0], hi = b[1]
        if (hi <= lo) return
        const touchpad = e.pixelDelta.y !== 0
        const dy = touchpad ? e.pixelDelta.y : e.angleDelta.y * notch * (e.inverted ? -1 : 1)
        if (touchpad) { view.cancelFlick(); view.contentY = Math.max(lo, Math.min(hi, view.contentY - dy)); goal = view.contentY; frames.running = false; return }     // fingers already move smoothly
        const from = frames.running ? goal : view.contentY
        goal = Math.max(lo, Math.min(hi, from - dy))
        view.cancelFlick()
        frames.running = true
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
