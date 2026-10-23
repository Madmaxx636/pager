import QtQuick

// Mouse-wheel and touchpad scrolling that is quick and eases to a stop (put it inside a ListView or Flickable).
WheelHandler {
    id: h
    required property Flickable view
    property real notch: 0.9            // pixels per wheel unit: one click of a normal wheel (120 units) moves about 108 px
    property real goal: 0
    acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
    onWheel: (e) => {
        if (!view) return
        const lo = view.originY, hi = Math.max(lo, view.originY + view.contentHeight - view.height)
        if (hi <= lo) return
        const touchpad = e.pixelDelta.y !== 0
        const dy = touchpad ? e.pixelDelta.y : e.angleDelta.y * notch * (e.inverted ? -1 : 1)
        const from = glide.running ? goal : view.contentY
        goal = Math.max(lo, Math.min(hi, from - dy))
        glide.stop()
        if (touchpad) view.contentY = goal                     // fingers already move smoothly
        else { glide.to = goal; glide.restart() }
    }
    property NumberAnimation glide: NumberAnimation { target: h.view; property: "contentY"; duration: 140; easing.type: Easing.OutCubic }
}
