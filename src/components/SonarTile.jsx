import { useEffect, useRef } from 'react';
import { renderSonarCanvas } from '../lib/sonar.js';
import { cx } from '../lib/utils.js';

function drawBBox(ctx, targets, label, w, h) {
  if (!targets || !targets.length) return;
  for (const t of targets) {
    if (!t) continue;
    const x = (t.x ?? 0.5) * w;
    const y = (t.y ?? 0.5) * h;
    const bw = Math.max(20, (t.size ?? t.w ?? 0.1) * w);
    const bh = Math.max(20, (t.size ?? t.h ?? 0.1) * h);
    ctx.strokeStyle = '#e4572e';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - bw / 2, y - bh / 2, bw, bh);

    if (label) {
      ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width + 10;
      const ly = Math.max(0, y - bh / 2 - 18);
      ctx.fillStyle = '#e4572e';
      ctx.fillRect(x - bw / 2, ly, tw, 18);
      ctx.fillStyle = '#03070c';
      ctx.fillText(label, x - bw / 2 + 5, ly + 9.5);
    }
  }
}

export default function SonarTile({
  tileUrl,
  seed,
  targets,
  targetCount,
  showBox = false,
  label = '',
  aspect = 0.75,
  nadirWidth,
  className,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let imgObj = null;

    const paint = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = canvas.clientWidth;
        if (!w) return;
        const h = Math.round(w * aspect);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (tileUrl) {
          if (!imgObj) {
            imgObj = new Image();
            imgObj.crossOrigin = 'anonymous';
            imgObj.onload = () => {
              ctx.drawImage(imgObj, 0, 0, w, h);
              if (showBox) drawBBox(ctx, targets, label, w, h);
            };
            imgObj.onerror = () => {
              // Fallback to synthetic if image fails
              renderSonarCanvas(canvas, { seed, targets, targetCount, showBox, label, nadirWidth, width: w, height: h });
            };
            imgObj.src = tileUrl;
          } else if (imgObj.complete && imgObj.naturalWidth > 0) {
            ctx.drawImage(imgObj, 0, 0, w, h);
            if (showBox) drawBBox(ctx, targets, label, w, h);
          }
        } else {
          renderSonarCanvas(canvas, { seed, targets, targetCount, showBox, label, nadirWidth, width: w, height: h });
        }
      });
    };

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [tileUrl, seed, targets, targetCount, showBox, label, aspect, nadirWidth]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cx('block w-full', className)} style={{ aspectRatio: `1 / ${aspect}` }} />;
}

