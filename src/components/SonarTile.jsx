import { useEffect, useRef, useState } from 'react';
import { renderSonarCanvas } from '../lib/sonar.js';
import { cx } from '../lib/utils.js';

function drawBBox(ctx, targets, label, w, h) {
  if (!targets || !targets.length) return;
  for (const t of targets) {
    if (!t) continue;
    const x = (t.x ?? 0) * w;
    const y = (t.y ?? 0) * h;
    const bw = Math.max(20, (t.size ?? t.w ?? 0.1) * w);
    const bh = Math.max(20, (t.size ?? t.h ?? 0.1) * h);
    ctx.strokeStyle = '#e4572e';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, bw, bh);

    if (label) {
      ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width + 10;
      const ly = Math.max(0, y - 18);
      ctx.fillStyle = '#e4572e';
      ctx.fillRect(x, ly, tw, 18);
      ctx.fillStyle = '#03070c';
      ctx.fillText(label, x + 5, ly + 9.5);
    }
  }
}

/**
 * SonarTile — renders a real sonar JPEG (tileUrl) or a synthetic waterfall canvas.
 *
 * Key design decisions:
 *  - The loaded HTMLImageElement is stored in imgRef so it survives across
 *    ResizeObserver repaints without reloading.
 *  - drawNow() always reads fresh canvas dimensions, never a stale closure.
 *  - After the image loads, onload calls drawNow() directly so the image
 *    appears even if the ResizeObserver already fired while it was loading.
 *  - crossOrigin is NOT set — the images are same-origin via the Vite proxy
 *    and adding crossOrigin triggers a preflight that can 403 on StaticFiles.
 */
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
  // Cached image element — survives re-renders and ResizeObserver repaints.
  const imgRef = useRef(null);
  // Bumped whenever an image finishes loading (or fails), to trigger a repaint.
  const [imgTick, setImgTick] = useState(0);

  // Image loading lives in its OWN effect, keyed on tileUrl alone.
  //
  // It used to share the draw effect, whose deps include `targets` — and callers pass
  // `targets={[r.tile]}`, a fresh array on every render. So any re-render cancelled the
  // in-flight load, while the guard `tileUrl !== loadedUrlRef.current` stopped the new
  // run from restarting it. The image never arrived, imgRef stayed null, neither draw
  // branch matched, and the canvas stayed blank — solid black tiles.
  //
  // Keyed on tileUrl only, a load is cancelled exactly when the URL changes or the
  // component unmounts, which is the only time cancelling is correct.
  useEffect(() => {
    if (!tileUrl) {
      imgRef.current = null;
      setImgTick((n) => n + 1);
      return undefined;
    }

    let cancelled = false;
    const img = new Image();
    // Do NOT set crossOrigin — images are served same-origin via the Vite /storage
    // proxy. Adding crossOrigin="anonymous" triggers a CORS preflight that the
    // FastAPI StaticFiles mount doesn't handle, causing a 403 and a blank tile.
    const settle = () => {
      if (cancelled) return;
      imgRef.current = img;          // naturalWidth === 0 on error → synthetic fallback
      setImgTick((n) => n + 1);
    };
    img.onload = settle;
    img.onerror = settle;
    img.src = tileUrl;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [tileUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let cancelled = false;

    /** Stamp the current image (or synthetic fallback) onto the canvas. */
    function drawNow() {
      if (cancelled) return;
      // getBoundingClientRect gives the rendered width even before clientWidth settles.
      const w = canvas.getBoundingClientRect().width || canvas.clientWidth;
      if (!w) return;
      const h = Math.round(w * aspect);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const img = imgRef.current;
      if (tileUrl && img && img.complete && img.naturalWidth > 0) {
        // Real sonar tile loaded successfully — draw it.
        ctx.drawImage(img, 0, 0, w, h);
        if (showBox) drawBBox(ctx, targets, label, w, h);
      } else {
        // No URL, load failed, or still in flight. Always draw something: an
        // unconditional fallback means a stalled or failed image degrades to the
        // synthetic waterfall instead of an unexplained black rectangle.
        renderSonarCanvas(canvas, { seed, targets, targetCount, showBox, label, nadirWidth, width: w, height: h });
      }
    }

    function scheduleRepaint() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(drawNow);
    }

    // Paint now. The load effect bumps imgTick when the image settles, which re-runs
    // this effect and repaints with the real tile.
    scheduleRepaint();

    const ro = new ResizeObserver(scheduleRepaint);
    ro.observe(canvas);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [imgTick, tileUrl, seed, targets, targetCount, showBox, label, aspect, nadirWidth]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cx('block w-full', className)}
      style={{ aspectRatio: `1 / ${aspect}` }}
    />
  );
}
