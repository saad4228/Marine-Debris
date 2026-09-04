import { useEffect, useRef } from 'react';
import { onProgress } from '../lib/scrollStore.js';
import { smoothstep, prefersReducedMotion, cx } from '../lib/utils.js';

// A landing section parked at a depth. Opacity and a slight vertical drift
// are tied to distance from the viewport centre, so it belongs to the descent.
export default function DepthSection({ depth, id, className, veil = true, children }) {
  const ref = useRef(null);
  const innerRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    const inner = innerRef.current;
    if (prefersReducedMotion()) {
      el.style.opacity = '1';
      return undefined;
    }
    return onProgress(() => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const cy = vh / 2;
      let signed = 0;
      if (r.top > cy) signed = (r.top - cy) / vh;
      else if (r.bottom < cy) signed = -(cy - r.bottom) / vh;
      const dist = Math.abs(signed);
      const o = 1 - smoothstep(0.05, 0.55, dist);
      el.style.opacity = (0.06 + 0.94 * o).toFixed(3);
      if (inner) inner.style.transform = `translateY(${(signed * 28).toFixed(1)}px)`;
    });
  }, []);

  return (
    <section
      id={id}
      ref={ref}
      data-depth={depth}
      className={cx('relative flex min-h-[100svh] flex-col justify-center px-6 py-24 md:pl-40 md:pr-12 lg:pl-48', className)}
      style={{ opacity: 0 }}
    >
      <div ref={innerRef} className={cx(veil && 'veil')} style={{ isolation: 'isolate', willChange: 'transform' }}>
        <p className="readout mb-6 text-ping text-shadow-deep">{depth} m</p>
        {children}
      </div>
    </section>
  );
}
