import QtQuick

// A QR code drawn from the engine's module grid.
Item {
    id: qr
    property string payload: ""
    property int px: 240
    readonly property var grid: payload.length ? core.qr(payload) : ({ "size": 0, "rows": [] })
    width: px; height: px
    Rectangle { anchors.fill: parent; color: "white"; radius: 8 }
    Canvas {
        anchors.fill: parent; anchors.margins: 10
        onPaint: {
            const ctx = getContext("2d"); ctx.reset()
            const n = qr.grid.size; if (!n) return
            const cell = width / n
            ctx.fillStyle = "#000000"
            for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.grid.rows[y][x] === "1") ctx.fillRect(Math.floor(x * cell), Math.floor(y * cell), Math.ceil(cell), Math.ceil(cell))
        }
        Component.onCompleted: requestPaint()
        onWidthChanged: requestPaint()
    }
}
