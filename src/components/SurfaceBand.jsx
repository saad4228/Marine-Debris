import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/utils.js';

// Shallow-water header for inner pages, so every page starts at the surface
// and the landing page is simply the one you sink through.
export default function SurfaceBand() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reduced = prefersReducedMotion();
    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) draw(0);
    };

    const draw = (now) => {
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      // light shafts
      for (let i = 0; i < 6; i++) {
        const bx = (i / 6 + Math.sin(t * 0.04 + i) * 0.02) * w;
        const sw = w * 0.05;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(143,216,219,0.14)');
        g.addColorStop(0.7, 'rgba(143,216,219,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx + sw, 0);
        ctx.lineTo(bx + sw + w * 0.1, h);
        ctx.lineTo(bx - w * 0.04, h);
        ctx.closePath();
        ctx.fill();
      }
      // caustic bands
      ctx.lineWidth = 1.2;
      for (let b = 0; b < 5; b++) {
        const y0 = (b / 5) * h * 0.5 + 10;
        const a = 0.12 * (1 - b / 5);
        ctx.strokeStyle = `rgba(233,243,242,${a})`;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 14) {
          const y = y0 + Math.sin(x * 0.011 + t * 0.7 + b) * 8 + Math.sin(x * 0.029 - t * 0.4 + b * 2) * 4;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="surface-band" aria-hidden="true">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
