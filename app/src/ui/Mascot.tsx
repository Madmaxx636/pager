/**
 * Pager's mascot: a little pager that is going off and smiling. One drawing, three moods:
 * idle (bobbing, waves pulsing), ring (shaking, it just got a message) and sleep (waiting).
 * The animations are plain CSS (see styles.css) and switch off with "Reduce motion".
 */
export type MascotMood = "idle" | "ring" | "sleep";

export function Mascot({ size = 120, mood = "idle", className = "" }: { size?: number; mood?: MascotMood; className?: string }) {
  const sleeping = mood === "sleep";
  return (
    <svg className={`mascot ${mood} ${className}`} width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Pager" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mc-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#c9f4ec" /></linearGradient>
        <linearGradient id="mc-screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#14706a" /><stop offset="1" stopColor="#0a3a37" /></linearGradient>
      </defs>
      {!sleeping && (
        <g className="m-waves" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round">
          <g className="m-wave w1"><path d="M92 198q-30 58 0 116" /><path d="M420 198q30 58 0 116" /></g>
          <g className="m-wave w2" opacity=".65"><path d="M62 172q-44 84 0 168" /><path d="M450 172q44 84 0 168" /></g>
        </g>
      )}
      <ellipse className="m-shadow" cx="256" cy="436" rx="96" ry="12" fill="currentColor" opacity=".18" />
      <g className="m-body" stroke="#0e6b63" strokeLinejoin="round" strokeLinecap="round">
        <ellipse cx="210" cy="408" rx="28" ry="15" fill="#fff" strokeWidth="8" />
        <ellipse cx="302" cy="408" rx="28" ry="15" fill="#fff" strokeWidth="8" />
        <g className="m-arm left">
          <path d="M150 262q-26-6-30-34" fill="none" strokeWidth="22" />
          <path d="M150 262q-26-6-30-34" fill="none" strokeWidth="10" stroke="#fff" />
          <circle cx="118" cy="222" r="19" fill="#fff" strokeWidth="8" />
        </g>
        <g className="m-arm right">
          <path d="M362 262q26-6 30-34" fill="none" strokeWidth="22" />
          <path d="M362 262q26-6 30-34" fill="none" strokeWidth="10" stroke="#fff" />
          <circle cx="394" cy="222" r="19" fill="#fff" strokeWidth="8" />
        </g>
        <g className="m-antenna">
          <path d="M256 120V86" fill="none" strokeWidth="10" />
          <circle cx="256" cy="72" r="16" fill="#ff6f8e" strokeWidth="8" />
          <circle cx="251" cy="67" r="4.5" fill="#fff" stroke="none" opacity=".9" />
        </g>
        <rect x="146" y="116" width="220" height="284" rx="64" fill="url(#mc-body)" strokeWidth="10" />
        <rect x="174" y="148" width="164" height="136" rx="36" fill="url(#mc-screen)" strokeWidth="8" />
        <path d="M196 170q20-10 44-8" fill="none" stroke="#7ff5e3" strokeWidth="7" opacity=".35" />
        <g className="m-eyes" fill="none" stroke="#8ff7e6" strokeWidth="12">
          {sleeping ? <><path d="M204 214q17 20 34 0" /><path d="M274 214q17 20 34 0" /></> : <><path d="M204 216q17-28 34 0" /><path d="M274 216q17-28 34 0" /></>}
        </g>
        <ellipse cx="196" cy="240" rx="15" ry="9" fill="#ff7b9c" opacity=".75" stroke="none" />
        <ellipse cx="316" cy="240" rx="15" ry="9" fill="#ff7b9c" opacity=".75" stroke="none" />
        {sleeping
          ? <path d="M240 246q16 10 32 0" fill="none" stroke="#ff9db3" strokeWidth="7" />
          : <><path d="M236 236q20 38 40 0z" fill="#8a1236" stroke="#8a1236" strokeWidth="5" /><ellipse cx="256" cy="253" rx="9" ry="5.5" fill="#ff9db3" stroke="none" /></>}
        <circle cx="208" cy="338" r="15" fill="#ff6f8e" strokeWidth="7" />
        <circle cx="256" cy="338" r="15" fill="#ffc83d" strokeWidth="7" />
        <circle cx="304" cy="338" r="15" fill="#2dd4bf" strokeWidth="7" />
        <path d="M180 372h152" fill="none" strokeWidth="7" opacity=".35" />
      </g>
      {sleeping
        ? <g className="m-z" fill="currentColor" fontFamily="Inter, system-ui, sans-serif" fontWeight="800"><text x="352" y="96" fontSize="44">z</text><text x="388" y="62" fontSize="34">z</text><text x="414" y="36" fontSize="26">z</text></g>
        : <g className="m-ring" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round"><path d="M300 60l16-16" /><path d="M322 80l22-6" /><path d="M212 60l-16-16" /><path d="M190 80l-22-6" /></g>}
    </svg>
  );
}
