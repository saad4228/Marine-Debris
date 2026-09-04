import { useEffect, useRef } from 'react';
import { onProgress, MAX_DEPTH } from '../lib/scrollStore.js';
import { zoneForDepth, cx } from '../lib/utils.js';

const TICKS = Array.from({ length: MAX_DEPTH / 20 + 1 }, (_, i) => i * 20);

export default function DepthRail() {
  const headRef = useRef(null);
  const readRef = useRef(null);
  const zoneRef = useRef(null);
  const chipReadRef = useRef(null);
  const chipZoneRef = useRef(null);

  useEffect(
    () =>
      onProgress((p) => {
        const d = p * MAX_DEPTH;
        const text = `${Math.round(d)} m`;
        const zone = zoneForDepth(d);
        if (headRef.current) headRef.current.style.top = `${p * 100}%`;
        if (readRef.current) readRef.current.textContent = text;
        if (chipReadRef.current) chipReadRef.current.textContent = text;
        if (zoneRef.current && zoneRef.current.textContent !== zone) zoneRef.current.textContent = zone;
        if (chipZoneRef.current && chipZoneRef.current.textContent !== zone) chipZoneRef.current.textContent = zone;
      }),
    []
  );

  return (
    <>
      <aside className="fixed left-3 top-28 bottom-16 z-20 hidden w-28 md:block pointer-events-none" aria-hidden="true">
        <div className="relative h-full ml-8 border-l border-foamdim/40">
          {TICKS.map((d) => (
            <div key={d} className="absolute left-0 w-0" style={{ top: `${(d / MAX_DEPTH) * 100}%` }}>
              <span className={cx('absolute left-0 top-0 h-px bg-foamdim/70', d % 60 === 0 ? 'w-3' : 'w-1.5')} />
              {d % 60 === 0 && (
                <span className="readout absolute right-1.5 top-0 -translate-y-1/2 text-foamdim/80">{d}</span>
              )}
            </div>
          ))}
          <div ref={headRef} className="absolute -left-[5px] -translate-y-1/2" style={{ top: 0 }}>
            <span className="block h-[9px] w-[9px] bg-ping" style={{ clipPath: 'polygon(0 50%, 100% 0, 100% 100%)' }} />
            <span ref={readRef} className="readout absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap text-ping text-shadow-deep">0 m</span>
          </div>
          <div className="absolute left-16 top-1/2 -translate-y-1/2">
            <span
              ref={zoneRef}
              className="readout text-foamdim/80"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.18em' }}
            >
              SURFACE
            </span>
          </div>
        </div>
      </aside>

      <div
        className="readout fixed bottom-4 left-4 z-20 flex items-baseline gap-2 border hairline bg-abyss/75 px-2.5 py-1.5 backdrop-blur md:hidden"
        aria-hidden="true"
      >
        <span ref={chipReadRef} className="text-ping">0 m</span>
        <span ref={chipZoneRef} className="text-foamdim">SURFACE</span>
      </div>
    </>
  );
}
