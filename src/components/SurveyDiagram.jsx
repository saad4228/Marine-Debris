export default function SurveyDiagram({ className = '' }) {
  return (
    <svg
      viewBox="0 0 800 440"
      role="img"
      aria-label="Diagram of a side-scan sonar survey. A vessel at the surface tows a sonar fish on a cable. Two amber fans of sound spread from the fish down to the seabed on port and starboard. Directly below the fish a narrow red wedge marks the nadir, which the sonar cannot see. Two small objects on the seabed each cast a black acoustic shadow away from the fish."
      className={className}
      fontFamily="IBM Plex Mono, ui-monospace, monospace"
      fontSize="11"
    >
      <defs>
        <linearGradient id="fan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2a93b" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f2a93b" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <rect x="0" y="62" width="800" height="378" fill="#062231" opacity="0.55" />
      <path d="M0 372 C 60 362, 110 384, 170 376 S 290 358, 350 372 S 470 392, 540 378 S 660 356, 720 372 S 780 384, 800 378 L 800 440 L 0 440 Z" fill="#03070c" />
      <path d="M0 372 C 60 362, 110 384, 170 376 S 290 358, 350 372 S 470 392, 540 378 S 660 356, 720 372 S 780 384, 800 378" fill="none" stroke="#93aab0" strokeWidth="1.2" />
      <polygon points="520,150 110,372 500,376" fill="url(#fan)" stroke="#f2a93b" strokeOpacity="0.6" strokeWidth="1" />
      <polygon points="520,150 540,376 790,372" fill="url(#fan)" stroke="#f2a93b" strokeOpacity="0.6" strokeWidth="1" />
      <polygon points="520,150 500,376 540,376" fill="#e4572e" fillOpacity="0.35" stroke="#e4572e" strokeWidth="1" />
      <polygon points="262,368 262,372 196,374 196,366" fill="#03070c" />
      <rect x="254" y="362" width="10" height="10" fill="#e9f3f2" />
      <polygon points="690,366 690,374 760,375 760,365" fill="#03070c" />
      <rect x="680" y="362" width="10" height="9" fill="#e9f3f2" />
      <path d="M0 62 Q 20 56 40 62 T 80 62 T 120 62 T 160 62 T 200 62 T 240 62 T 280 62 T 320 62 T 360 62 T 400 62 T 440 62 T 480 62 T 520 62 T 560 62 T 600 62 T 640 62 T 680 62 T 720 62 T 760 62 T 800 62" fill="none" stroke="#8fd8db" strokeWidth="1.5" />
      <path d="M300 62 L 316 48 L 384 48 L 400 62 L 392 72 L 308 72 Z" fill="#e9f3f2" />
      <rect x="336" y="36" width="26" height="12" fill="#e9f3f2" />
      <path d="M392 66 C 430 80, 480 120, 516 148" fill="none" stroke="#93aab0" strokeWidth="1.5" strokeDasharray="3 3" />
      <ellipse cx="524" cy="150" rx="18" ry="6" fill="#e9f3f2" />
      <polygon points="540,150 552,144 552,156" fill="#e9f3f2" />
      <g fill="#93aab0">
        <text x="14" y="52">sea surface</text>
        <text x="300" y="32">survey vessel</text>
        <text x="436" y="96">tow cable</text>
        <text x="556" y="140">towfish</text>
        <text x="180" y="250" fill="#f2a93b">port swath</text>
        <text x="600" y="250" fill="#f2a93b">starboard swath</text>
        <text x="470" y="404" fill="#e4572e">nadir (blind)</text>
        <text x="150" y="352">target + shadow</text>
        <text x="646" y="352">target + shadow</text>
      </g>
      <line x1="230" y1="354" x2="256" y2="364" stroke="#93aab0" strokeWidth="1" />
      <line x1="700" y1="354" x2="688" y2="362" stroke="#93aab0" strokeWidth="1" />
      <line x1="520" y1="392" x2="520" y2="378" stroke="#e4572e" strokeWidth="1" />
    </svg>
  );
}
