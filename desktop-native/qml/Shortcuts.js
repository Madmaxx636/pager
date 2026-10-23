.pragma library
// Every shortcut the app understands, with its default keys. People can change them in Settings.
const ALL = [
  { id: "palette", label: "Command bar: jump to a page or setting", keys: "Ctrl+K" },
  { id: "newChat", label: "New page", keys: "Ctrl+N" },
  { id: "search", label: "Search all messages", keys: "Ctrl+Shift+F" },
  { id: "inChatSearch", label: "Search in this page", keys: "Ctrl+F" },
  { id: "settings", label: "Open settings", keys: "Ctrl+," },
  { id: "prevChat", label: "Previous page", keys: "Alt+Up" },
  { id: "nextChat", label: "Next page", keys: "Alt+Down" },
  { id: "nextUnread", label: "Next unread page", keys: "Alt+Shift+Down" },
  { id: "archive", label: "Archive or unarchive this page", keys: "Ctrl+Shift+A" },
  { id: "markUnread", label: "Mark this page unread", keys: "Ctrl+Shift+U" },
  { id: "mute", label: "Mute or unmute this page", keys: "Ctrl+Shift+M" },
  { id: "pin", label: "Pin or unpin this page", keys: "Ctrl+Shift+P" },
  { id: "snooze", label: "Snooze this page", keys: "Ctrl+Shift+Z" },
  { id: "info", label: "Show or hide page info", keys: "Ctrl+I" },
  { id: "help", label: "Show keyboard shortcuts", keys: "Ctrl+/" },
  { id: "quit", label: "Quit Pager", keys: "Ctrl+Q" }
]
function keysFor(id, custom) { const c = custom && custom[id]; if (c) return c; for (const s of ALL) if (s.id === id) return s.keys; return "" }
/** "Ctrl+Shift+A" from a key event's pieces; empty for a lone modifier. */
function describe(key, modifiers, text) {
  const Qt_Control = 0x04000000, Qt_Shift = 0x02000000, Qt_Alt = 0x08000000, Qt_Meta = 0x10000000
  if ([0x01000020, 0x01000021, 0x01000023, 0x01000022, 0x01000025].indexOf(key) >= 0) return ""
  const names = { 0x01000013: "Up", 0x01000015: "Down", 0x01000012: "Left", 0x01000014: "Right", 0x01000000: "Esc", 0x01000004: "Return", 0x01000005: "Enter", 0x20: "Space", 0x01000001: "Tab", 0x01000003: "Backspace", 0x01000007: "Delete" }
  let name = names[key]
  if (!name) { if (key >= 0x01000030 && key <= 0x0100003b) name = "F" + (key - 0x0100002f); else if (key >= 0x20 && key < 0x7f) name = String.fromCharCode(key).toUpperCase(); else return "" }
  const parts = []
  if (modifiers & Qt_Control) parts.push("Ctrl"); if (modifiers & Qt_Alt) parts.push("Alt"); if (modifiers & Qt_Shift) parts.push("Shift"); if (modifiers & Qt_Meta) parts.push("Meta")
  parts.push(name); return parts.join("+")
}
