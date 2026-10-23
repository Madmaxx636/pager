import QtQuick

// The two sample bubbles at the top of the bubble settings.
Column {
    id: prev
    spacing: 6
    component Sample: Item {
        id: smp
        property bool mine; property string text
        width: parent.width; height: bub.height
        BubbleLook { id: lk; mine: smp.mine }
        Rectangle {
            id: bub
            x: smp.mine ? smp.width - width - 4 : 4
            width: t.implicitWidth + 28; height: t.implicitHeight + 18
            radius: lk.baseRadius; color: lk.bubbleColor
            gradient: lk.fill === "gradient" && lk.mine && lk.customBg === "" ? g : null
            Gradient { id: g; orientation: Gradient.Vertical; GradientStop { position: 0; color: lk.base } GradientStop { position: 1; color: Qt.tint(lk.base, Qt.rgba(0.486, 0.227, 0.929, 0.38)) } }
            border.width: lk.borderStyle !== "none" || lk.shape === "outline" || lk.fill === "glass" ? (lk.borderStyle === "thick" ? 3 : 1.5) : 0
            border.color: lk.borderColorOf
            bottomLeftRadius: !lk.mine && (lk.shape === "curved" || lk.shape === "tail") ? lk.tailRadius : lk.baseRadius
            bottomRightRadius: lk.mine && (lk.shape === "curved" || lk.shape === "tail") ? lk.tailRadius : lk.baseRadius
            Text { id: t; x: 14; y: 9; text: smp.text; color: lk.ink; font.pixelSize: Math.round(15 * look.textScale) }
        }
    }
    Sample { mine: false; text: "Hey! How do you like the new theme?" }
    Sample { mine: true; text: "It looks amazing! 🎨" }
}
