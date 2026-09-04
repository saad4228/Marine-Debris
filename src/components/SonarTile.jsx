import { useEffect, useRef } from 'react';
import { renderSonarCanvas } from '../lib/sonar.js';
import { cx } from '../lib/utils.js';

export default function SonarTile({ seed, targets, targetCount, showBox = false, label = '', aspect = 0.75, nadirWidth, className }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    let raf = 0;
    const paint = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = canvas.clientWidth;
        if (!w) return;
        renderSonarCanvas(canvas, { seed, targets, targetCount, showBox, label, nadirWidth, width: w, height: Math.round(w * aspect) });
      });
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [seed, targets, targetCount, showBox, label, aspect, nadirWidth]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cx('block w-full', className)} style={{ aspectRatio: `1 / ${aspect}` }} />;
}
