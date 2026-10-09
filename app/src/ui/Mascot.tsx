/**
 * Pager's mascot: a classic black pager with a green screen, going off and smiling. One drawing, three moods:
 * idle (bobbing, waves pulsing), ring (shaking, it just got a message) and sleep (waiting).
 * The animations are plain CSS (see styles.css) and switch off with "Reduce motion".
 * Same geometry as brand/make-brand.py, which draws the app icons.
 */
export type MascotMood = "idle" | "ring" | "sleep";

const INK = "#0a0b0c", RIM = "#6b7a85", BEZEL = "#0b0c0d", FACE = "#0b4a22", KEY = "#2b3035";

export function Mascot({ size = 120, mood = "idle", className = "" }: { size?: number; mood?: MascotMood; className?: string }) {
  const sleeping = mood === "sleep";
  return (
    <svg className={`mascot ${mood} ${className}`} width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Pager" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mc-body" gradientUnits="userSpaceOnUse" x1="0" y1="150" x2="0" y2="382"><stop offset="0" stopColor="#3a4046" /><stop offset="1" stopColor="#14161a" /></linearGradient>
        <linearGradient id="mc-lcd" gradientUnits="userSpaceOnUse" x1="0" y1="184" x2="0" y2="290"><stop offset="0" stopColor="#8ceb99" /><stop offset="1" stopColor="#37a552" /></linearGradient>
      </defs>
      {!sleeping && (
        <g className="m-waves" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round">
          <g className="m-wave w1"><path d="M52 200Q22 266 52 332" /><path d="M460 200Q490 266 460 332" /></g>
          <g className="m-wave w2" opacity=".65"><path d="M28 176Q-8 266 28 356" /><path d="M484 176Q520 266 484 356" /></g>
        </g>
      )}
      <ellipse className="m-shadow" cx="256" cy="424" rx="150" ry="12" fill="currentColor" opacity=".18" />
      <g className="m-body" strokeLinejoin="round" strokeLinecap="round">
        <ellipse cx="190" cy="396" rx="30" ry="15" fill="#fff" stroke={INK} strokeWidth="7" />
        <ellipse cx="322" cy="396" rx="30" ry="15" fill="#fff" stroke={INK} strokeWidth="7" />
        <rect x="76" y="150" width="360" height="232" rx="56" fill="url(#mc-body)" stroke={RIM} strokeWidth="6" />
        <rect x="96" y="168" width="262" height="152" rx="28" fill={BEZEL} />
        <rect x="112" y="184" width="230" height="106" rx="14" fill="url(#mc-lcd)" />
        <path d="M128 198Q162 190 202 192" fill="none" stroke="#e3ffe8" strokeWidth="6" opacity=".5" />
        <g className="m-eyes" fill="none" stroke={FACE} strokeWidth="11">
          {sleeping ? <><path d="M168 224Q185 246 202 224" /><path d="M252 224Q269 246 286 224" /></> : <><path d="M168 234Q185 206 202 234" /><path d="M252 234Q269 206 286 234" /></>}
        </g>
        <ellipse cx="160" cy="254" rx="13" ry="7" fill="#ff7a9c" opacity=".6" />
        <ellipse cx="294" cy="254" rx="13" ry="7" fill="#ff7a9c" opacity=".6" />
        {sleeping ? <path d="M215 254Q227 260 239 254" fill="none" stroke={FACE} strokeWidth="7" /> : <path d="M211 246Q227 276 243 246Z" fill={FACE} stroke={FACE} strokeWidth="5" />}
        <rect x="366" y="168" width="48" height="152" rx="24" fill={BEZEL} />
        <path d="M390 196L379 222H401Z" fill="#fff" stroke="none" /><path d="M379 266H401L390 292Z" fill="#fff" stroke="none" />
        <path d="M372 244H408" fill="none" stroke={KEY} strokeWidth="3" />
        <path d="M132 305L148 296V314Z" fill="#fff" stroke="none" /><path d="M192 296L208 305L192 314Z" fill="#fff" stroke="none" />
        <path d="M164 296V314M226 296V314" fill="none" stroke={KEY} strokeWidth="3" />
        <circle className="m-led" cx="262" cy="305" r="9" fill="#ec3b36" stroke="none" />
        <rect x="366" y="340" width="56" height="32" rx="16" fill={BEZEL} stroke={RIM} strokeWidth="4" />
        <path d="M380 356H408" fill="none" stroke="#a6e35b" strokeWidth="6" />
      </g>
      {sleeping
        ? <g className="m-z" fill="currentColor" fontFamily="Inter, system-ui, sans-serif" fontWeight="800"><text x="352" y="118" fontSize="44">z</text><text x="388" y="84" fontSize="34">z</text><text x="414" y="58" fontSize="26">z</text></g>
        : <g className="m-ring" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round"><path d="M300 116l16-16" /><path d="M322 134l22-6" /><path d="M212 116l-16-16" /><path d="M190 134l-22-6" /></g>}
    </svg>
  );
}
