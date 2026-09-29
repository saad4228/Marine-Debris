import { useEffect, useRef } from 'react';
import { onProgress, getProgress, MAX_DEPTH } from '../lib/scrollStore.js';
import { paintSonar } from '../lib/sonar.js';
import { INHABITANTS } from '../lib/creatures.js';
import { smoothstep, mixHex, prefersReducedMotion, mulberry32 } from '../lib/utils.js';

const VIDEO_SRC = '/assets/sea-surface.mp4';

export default function DescentCanvas() {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    const reduced = prefersReducedMotion();

    let w = 0;
    let h = 0;
    let dpr = 1;
    let progress = getProgress();
    let lastProgress = progress;
    let videoOk = false;
    let raf = 0;
    let sonarCache = null;

    const rng = mulberry32(7);
    const snow = Array.from({ length: 80 }, () => ({
      x: rng(), y: rng(), r: 0.6 + rng() * 1.6, v: 0.15 + rng() * 0.5, ph: rng() * Math.PI * 2,
    }));
    const bubbles = Array.from({ length: 28 }, () => ({
      x: rng(), y: rng(), r: 1.5 + rng() * 3, v: 0.0012 + rng() * 0.0025, ph: rng() * Math.PI * 2,
    }));
    const glints = Array.from({ length: 40 }, () => ({
      x: rng(), y: rng(), ph: rng() * Math.PI * 2, f: 0.6 + rng() * 1.8,
    }));

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(draw);
      }
    }

    function sonarLayer() {
      const key = `${canvas.width}x${canvas.height}`;
      if (sonarCache && sonarCache.key === key) return sonarCache.canvas;
      const off = document.createElement('canvas');
      off.width = canvas.width;
      off.height = canvas.height;
      const octx = off.getContext('2d');
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintSonar(octx, w, h, { seed: 'nadir-seabed', targetCount: 6, nadirWidth: 0.09, density: 1.2, bandStep: 3 });
      sonarCache = { key, canvas: off };
      return off;
    }

    function draw(now) {
      const t = now / 1000;
      const p = progress;
      const depth = p * MAX_DEPTH;
      const dp = p - lastProgress;
      lastProgress = p;

      ctx.clearRect(0, 0, w, h);

      // water column
      const k = smoothstep(0, 1, p);
      const water = ctx.createLinearGradient(0, 0, 0, h);
      water.addColorStop(0, mixHex('#2e93a8', '#03070c', k));
      water.addColorStop(1, mixHex('#062231', '#03070c', k));
      ctx.globalAlpha = videoOk ? 0.06 + 0.94 * smoothstep(0.02, 0.3, p) : 1;
      ctx.fillStyle = water;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      if (video) video.style.opacity = videoOk ? String(1 - smoothstep(0.08, 0.35, p)) : '0';

      // surface light, gone by 60 m
      const L = 1 - smoothstep(0, 60, depth);
      if (L > 0 && !reduced) {
        ctx.save();
        for (let i = 0; i < 5; i++) {
          const bx = (i / 5 + Math.sin(t * 0.05 + i) * 0.03) * w;
          const sw = w * 0.06 + Math.sin(t * 0.3 + i * 2) * w * 0.01;
          const sg = ctx.createLinearGradient(0, 0, 0, h);
          sg.addColorStop(0, `rgba(143,216,219,${0.16 * L})`);
          sg.addColorStop(1, 'rgba(143,216,219,0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.moveTo(bx, 0);
          ctx.lineTo(bx + sw, 0);
          ctx.lineTo(bx + sw + w * 0.12, h);
          ctx.lineTo(bx - w * 0.05, h);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = `rgba(233,243,242,${0.12 * L})`;
        ctx.lineWidth = 1.5;
        for (let b = 0; b < 7; b++) {
          const y0 = (b / 7) * h * 0.55 - depth * 2;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 12) {
            const y = y0 + Math.sin(x * 0.012 + t * 0.8 + b) * 9 + Math.sin(x * 0.031 - t * 0.5 + b * 2) * 5;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      // bubbles near the surface
      const B = 1 - smoothstep(10, 45, depth);
      if (B > 0 && !reduced) {
        ctx.strokeStyle = `rgba(233,243,242,${0.45 * B})`;
        ctx.lineWidth = 1;
        for (const b of bubbles) {
          b.y -= b.v + dp * 1.5;
          b.x += Math.sin(t * 1.2 + b.ph) * 0.0004;
          if (b.y < -0.02) { b.y = 1.02; b.x = rng(); }
          ctx.beginPath();
          ctx.arc(b.x * w, b.y * h, b.r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // marine snow
      if (!reduced) {
        const vis = 0.15 + 0.55 * smoothstep(0.08, 0.6, p);
        ctx.fillStyle = `rgba(233,243,242,${vis})`;
        for (const s of snow) {
          s.y -= dp * 2.2 * s.v + 0.00025 * s.v;
          s.x += Math.sin(t * 0.4 + s.ph) * 0.00012;
          if (s.y < -0.02) s.y += 1.04;
          if (s.y > 1.02) s.y -= 1.04;
          if (s.x < -0.02) s.x += 1.04;
          if (s.x > 1.02) s.x -= 1.04;
          ctx.beginPath();
          ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // bioluminescent glints in the twilight zone
      const G = smoothstep(75, 100, depth) * (1 - smoothstep(150, 175, depth));
      if (G > 0 && !reduced) {
        for (const g of glints) {
          const a = Math.max(0, Math.sin(t * g.f + g.ph)) ** 6 * 0.9 * G;
          if (a < 0.02) continue;
          ctx.fillStyle = `rgba(143,216,219,${a})`;
          ctx.beginPath();
          ctx.arc(g.x * w, ((g.y - p * 0.6) % 1 + 1) % 1 * h, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // inhabitants with parallax
      const unit = Math.min(w, h) * 0.06;
      const win = 22;
      for (const o of INHABITANTS) {
        const rel = ((o.depth - depth) / win) * o.rate;
        if (Math.abs(rel) > 1.1) continue;
        const a = 1 - smoothstep(0.45, 1.1, Math.abs(rel));
        const y = h * 0.5 + rel * h * 0.6;
        const x = o.x * w + (o.drift && !reduced ? Math.sin(t * o.drift) * w * 0.03 : 0);
        ctx.save();
        ctx.globalAlpha = a * (o.debris ? 0.95 : 0.9);
        ctx.translate(x, y);
        ctx.scale(unit * o.scale, unit * o.scale);
        o.draw(ctx, reduced ? 0 : t);
        ctx.restore();
      }

      // pressure vignette, tightening with depth
      const V = 0.25 + 0.5 * smoothstep(0.1, 0.8, p);
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(3,7,12,0)');
      vg.addColorStop(1, `rgba(3,7,12,${V})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      // the payoff: sonar waterfall
      const s = smoothstep(0.84, 0.97, p);
      if (s > 0) {
        const layer = sonarLayer();
        ctx.save();
        ctx.globalAlpha = s;
        const off = reduced ? 0 : (t * 28) % h;
        ctx.drawImage(layer, 0, off, w, h);
        ctx.drawImage(layer, 0, off - h, w, h);
        if (!reduced) {
          const sy = ((t * 0.09) % 1) * h;
          const glow = ctx.createLinearGradient(0, sy - 44, 0, sy + 2);
          glow.addColorStop(0, 'rgba(242,169,59,0)');
          glow.addColorStop(1, 'rgba(242,169,59,0.35)');
          ctx.fillStyle = glow;
          ctx.fillRect(0, sy - 44, w, 46);
          ctx.fillStyle = 'rgba(255,225,170,0.9)';
          ctx.fillRect(0, sy, w, 1.5);
        }
        ctx.restore();
      }
    }

    function loop(now) {
      draw(now);
      raf = requestAnimationFrame(loop);
    }

    const unsubscribe = onProgress((p) => {
      progress = p;
      if (reduced) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(draw);
      }
    });

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(reduced ? draw : loop);

    const onPlaying = () => { videoOk = true; };
    const onFail = () => {
      videoOk = false;
      if (video) video.style.opacity = '0';
    };
    if (video) {
      if (reduced) {
        video.style.opacity = '0';
      } else {
        video.muted = true;
        video.addEventListener('playing', onPlaying);
        video.addEventListener('error', onFail);
        const attempt = video.play();
        if (attempt && typeof attempt.catch === 'function') attempt.catch(onFail);
      }
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      unsubscribe();
      if (video) {
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('error', onFail);
        video.pause();
      }
      sonarCache = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src={VIDEO_SRC}
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        style={{ opacity: 0 }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
