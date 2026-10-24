import QtQuick
import QtQuick.Controls.Basic as B

B.DialogButtonBox {
    id: control
    spacing: 8; padding: 24; topPadding: 14; alignment: Qt.AlignRight
    delegate: Button { highlighted: DialogButtonBox.buttonRole === DialogButtonBox.AcceptRole || DialogButtonBox.buttonRole === DialogButtonBox.YesRole; flat: DialogButtonBox.buttonRole === DialogButtonBox.RejectRole || DialogButtonBox.buttonRole === DialogButtonBox.DestructiveRole }
    background: Item { }
}
