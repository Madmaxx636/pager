import QtQuick
import Pager.Items

// A picture that lives on the server (an mxc:// address): fetched small, shown when it arrives.
Item {
    id: root
    property string mxc: ""
    property int fetchSize: 256
    property int radius: 0
    property string path: ""
    function load() { path = mxc.length ? core.thumbPath(mxc, fetchSize) : "" }
    onMxcChanged: load()
    Component.onCompleted: load()
    Connections { target: core; function onMediaReady(key) { if (root.mxc.length && key === "th" + root.fetchSize + ":" + root.mxc) root.load() } }
    Image { anchors.fill: parent; source: root.path.length ? "file://" + root.path : ""; fillMode: Image.PreserveAspectFit; asynchronous: true; cache: false; sourceSize.width: root.fetchSize }
}
