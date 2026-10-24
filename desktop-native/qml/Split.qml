import QtQuick

// A round swatch half one colour, half another (the web app's ready-made looks): a circle cut on the diagonal, with an edge in a third colour.
Canvas {
    id: c
    property color first: "white"; property color second: "black"; property color edge: "gray"; property real edgeWidth: 2
    implicitWidth: 28; implicitHeight: 28
    onFirstChanged: requestPaint(); onSecondChanged: requestPaint(); onEdgeChanged: requestPaint(); onWidthChanged: requestPaint()
    onPaint: {
        const ctx = getContext("2d"); ctx.reset()
        const r = width / 2, e = edgeWidth
        ctx.beginPath(); ctx.arc(r, r, r, 0, 2 * Math.PI); ctx.fillStyle = c.edge; ctx.fill()
        const ri = r - e
        ctx.save(); ctx.beginPath(); ctx.arc(r, r, ri, 0, 2 * Math.PI); ctx.clip()
        ctx.fillStyle = c.first; ctx.fillRect(0, 0, width, height)
        ctx.beginPath(); ctx.moveTo(width, 0); ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fillStyle = c.second; ctx.fill()   // lower-right half, the diagonal runs from top-right to bottom-left
        ctx.restore()
    }
}
