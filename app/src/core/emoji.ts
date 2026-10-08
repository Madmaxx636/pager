/** Emoji for the reaction picker, grouped like every messenger does. */
export const EMOJI_CATEGORIES: [string, string, string[]][] = [
  ["😀", "Smileys", "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 ☺️ 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾".split(" ")],
  ["👋", "People", "👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐 🖖 👋 🤝 🙏 ✍️ 💪 🦾 🙌 👏 🤲 🫶 🫡 🫠 🫣 🫢 🫰 🫵 💅 🤳 🙋 🙆 🙅 🤷 🤦 🙇 💁 🧏".split(" ")],
  ["❤️", "Hearts & more", "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💋 💯 💢 💥 💫 💦 💨 🕳 💬 💭 💤 ✨ 🌟 ⭐ 🔥 🎉 🎊".split(" ")],
  ["🐶", "Nature", "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🐢 🐍 🦎 🐙 🦑 🦀 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐘 🦒 🦘 🐕 🐈 🌵 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🍃 🌸 🌼 🌻 🌹 🥀 🌷 💐 🌈 ☀️ 🌤 ⛅ ☁️ 🌧 ⛈ ❄️ ⛄ 🌊".split(" ")],
  ["🍕", "Food", "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🍆 🥔 🥕 🌽 🌶 🥒 🥦 🍄 🥜 🍞 🥐 🥖 🧀 🍳 🥞 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍮 ☕ 🍵 🥤 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🍾".split(" ")],
  ["⚽", "Activities", "⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🥋 ⛳ 🎣 🎽 🎿 🛷 🎯 🎮 🕹 🎲 🧩 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🏆 🥇 🥈 🥉 🏅 🎖".split(" ")],
  ["🚗", "Travel", "🚗 🚕 🚙 🚌 🚎 🏎 🚓 🚑 🚒 🚚 🚜 🛵 🏍 🚲 ✈️ 🚀 🛸 🚁 ⛵ 🚤 🚢 🏠 🏡 🏢 🏰 🗼 🗽 ⛪ 🕌 🌋 🏖 🏝 ⛺ 🌅 🌄 🌃 🌉 🌍 🗺".split(" ")],
  ["💡", "Objects", "⌚ 📱 💻 ⌨️ 🖥 📷 📸 📹 🎥 📞 ☎️ 📺 📻 🔋 🔌 💡 🔦 💰 💳 💎 🔧 🔨 ⚙️ 🔒 🔓 🔑 🛒 📦 📫 📝 📚 📖 📅 📌 📎 ✂️ 🗑 🎁 🎈 🕯 🧸 🪄".split(" ")],
  ["✅", "Symbols", "✅ ❌ ❎ ✔️ ➕ ➖ ➗ ✖️ ❓ ❗ ‼️ ⁉️ ⚠️ 🚫 ⛔ 📵 🔞 💲 ♻️ ⭕ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🔺 🔻 🔶 🔷 ➡️ ⬅️ ⬆️ ⬇️ ↩️ ↪️ 🔄 🔁 ▶️ ⏸ ⏹ ⏺ 🔊 🔇 🔔 🔕 🏳️ 🏴 🚩".split(" ")],
];

export const NETWORKS: Record<string, { label: string; color: string; glyph: string }> = {
  whatsapp: { label: "WhatsApp", color: "#25d366", glyph: "W" },
  signal: { label: "Signal", color: "#3a76f0", glyph: "S" },
  discord: { label: "Discord", color: "#5865f2", glyph: "D" },
  telegram: { label: "Telegram", color: "#2aabee", glyph: "T" },
  instagram: { label: "Instagram", color: "#e1306c", glyph: "I" },
  messenger: { label: "Messenger", color: "#0a7cff", glyph: "M" },
  gmessages: { label: "Messages", color: "#1a73e8", glyph: "G" },
  matrix: { label: "Matrix", color: "#8a94a6", glyph: "#" },
};
export const networkMeta = (id: string) => NETWORKS[id] ?? { label: id, color: "#8a94a6", glyph: id.slice(0, 1).toUpperCase() };
