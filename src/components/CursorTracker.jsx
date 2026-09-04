import { useEffect, useRef } from 'react';
import { getProgress } from '../lib/scrollStore.js';

export default function CursorTracker() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Global cursor tracker state
    const cursor = {
      x: -1000,
      y: -1000,
      active: false,
      lastMove: 0,
    };

    // Swimmer physics & orientation state
    const swimmer = {
      x: window.innerWidth * 0.45,
      y: window.innerHeight * 0.45,
      vx: 0,
      vy: 0,
      angle: -0.5,
      speed: 0,
      tailPhase: 0,
      lastPingTime: 0,
    };

    // Particle arrays
    const wakeParticles = [];
    const sonarPings = [];

    // Pointer listeners attached to window (works even when canvas has pointer-events-none)
    const onPointerMove = (e) => {
      cursor.x = e.clientX;
      cursor.y = e.clientY;
      cursor.active = true;
      cursor.lastMove = performance.now();
    };

    const onPointerLeave = () => {
      cursor.active = false;
    };

    const handleResize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('resize', handleResize);
    handleResize();

    const startTime = performance.now();

    function updateAndDrawCursorSwimmer(w, h, t, now, scrollDepthFactor = 0) {
      // 1. Determine target: follow cursor if active & moved within 3.5s, else gentle infinity-patrol
      const cursorActive = cursor.active && now - cursor.lastMove < 3500;
      const targetX = cursorActive ? cursor.x : w * 0.5 + Math.cos(t * 0.35) * (w * 0.32);
      const targetY = cursorActive ? cursor.y : h * 0.45 + Math.sin(t * 0.5) * (h * 0.22);

      const dx = targetX - swimmer.x;
      const dy = targetY - swimmer.y;
      const dist = Math.hypot(dx, dy);

      // 2. Hydrodynamic acceleration and damping
      const targetSpeed = Math.min(dist * 0.045, cursorActive ? 8.5 : 3.8);
      const accel = 0.06;
      const desiredVx = (dx / (dist || 1)) * targetSpeed;
      const desiredVy = (dy / (dist || 1)) * targetSpeed;

      swimmer.vx += (desiredVx - swimmer.vx) * accel;
      swimmer.vy += (desiredVy - swimmer.vy) * accel;

      // Water resistance drag
      swimmer.vx *= 0.96;
      swimmer.vy *= 0.96;
      swimmer.x += swimmer.vx;
      swimmer.y += swimmer.vy;
      swimmer.speed = Math.hypot(swimmer.vx, swimmer.vy);

      // 3. Smooth banking toward heading angle
      if (swimmer.speed > 0.15) {
        const targetAngle = Math.atan2(swimmer.vy, swimmer.vx);
        let diff = targetAngle - swimmer.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        swimmer.angle += diff * 0.09;
      }

      // 4. Undulating wing/tail flutter phase
      swimmer.tailPhase += 0.08 + swimmer.speed * 0.05;

      // 5. Spawn bioluminescent wake vortices behind the swimmer
      if (swimmer.speed > 0.4 && Math.random() < 0.75 && wakeParticles.length < 80) {
        const tailX = swimmer.x - Math.cos(swimmer.angle) * 32 + (Math.random() - 0.5) * 8;
        const tailY = swimmer.y - Math.sin(swimmer.angle) * 32 + (Math.random() - 0.5) * 8;
        wakeParticles.push({
          x: tailX,
          y: tailY,
          vx: -swimmer.vx * 0.25 + (Math.random() - 0.5) * 0.8,
          vy: -swimmer.vy * 0.25 + (Math.random() - 0.5) * 0.8,
          r: 1.2 + Math.random() * 2.8,
          life: 1.0,
          decay: 0.015 + Math.random() * 0.018,
          hue: Math.random() > 0.35 ? '#8fd8db' : '#2e93a8',
        });
      }

      // 6. Periodic acoustic sonar ping emission (or rapid pings when dashing)
      if (t - swimmer.lastPingTime > 2.8 || (cursorActive && swimmer.speed > 5.5 && t - swimmer.lastPingTime > 1.2)) {
        swimmer.lastPingTime = t;
        const noseX = swimmer.x + Math.cos(swimmer.angle) * 28;
        const noseY = swimmer.y + Math.sin(swimmer.angle) * 28;
        sonarPings.push({
          x: noseX,
          y: noseY,
          r: 6,
          maxR: 160 + swimmer.speed * 18,
          life: 1.0,
          decay: 0.016,
        });
      }

      // --------------------------------------------------------------------------
      // PART 3: DRAW ACOUSTIC SONAR RINGS
      // --------------------------------------------------------------------------
      for (let i = sonarPings.length - 1; i >= 0; i--) {
        const sp = sonarPings[i];
        sp.r += (sp.maxR - sp.r) * 0.045 + 1.2;
        sp.life -= sp.decay;

        if (sp.life <= 0) {
          sonarPings.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.strokeStyle = `rgba(143, 216, 219, ${sp.life * 0.45})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
        ctx.stroke();

        // Secondary acoustic echo ring
        if (sp.r > 20) {
          ctx.strokeStyle = `rgba(242, 169, 59, ${sp.life * 0.3})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.r * 0.65, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // --------------------------------------------------------------------------
      // PART 4: DRAW BIOLUMINESCENT WAKE PARTICLES
      // --------------------------------------------------------------------------
      for (let i = wakeParticles.length - 1; i >= 0; i--) {
        const pt = wakeParticles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vx *= 0.97;
        pt.vy *= 0.97;
        pt.life -= pt.decay;

        if (pt.life <= 0) {
          wakeParticles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = pt.life * 0.7;
        ctx.fillStyle = pt.hue;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r * (0.4 + pt.life * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // --------------------------------------------------------------------------
      // PART 5: DRAW EXPLORATION CREATURE / MANTA GLIDER
      // --------------------------------------------------------------------------
      ctx.save();
      ctx.translate(swimmer.x, swimmer.y);
      ctx.rotate(swimmer.angle);

      // Volumetric Headlight Beams
      const lightIntensity = 0.12 + 0.35 * scrollDepthFactor;
      const beamGrad = ctx.createRadialGradient(24, 0, 2, 120, 0, 100);
      beamGrad.addColorStop(0, `rgba(143, 216, 219, ${lightIntensity * 1.5})`);
      beamGrad.addColorStop(0.3, `rgba(46, 147, 168, ${lightIntensity * 0.8})`);
      beamGrad.addColorStop(1, 'rgba(3, 7, 12, 0)');

      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(22, -4);
      ctx.lineTo(160, -55);
      ctx.lineTo(160, 55);
      ctx.lineTo(22, 4);
      ctx.closePath();
      ctx.fill();

      // Flapping wing displacement
      const flap = Math.sin(swimmer.tailPhase) * (8 + swimmer.speed * 2.2);

      // Main hydrodynamic Manta / Glider wings
      ctx.fillStyle = '#0b2a3a';
      ctx.strokeStyle = 'rgba(143, 216, 219, 0.7)';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      // Nose
      ctx.moveTo(30, 0);
      // Right wing
      ctx.bezierCurveTo(18, -12, 4, -36 - flap * 0.4, -6, -46 - flap);
      ctx.bezierCurveTo(-14, -40 - flap * 0.8, -16, -22, -18, -10);
      // Tail
      ctx.lineTo(-44, 0);
      // Left wing
      ctx.lineTo(-18, 10);
      ctx.bezierCurveTo(-16, 22, -14, 40 + flap * 0.8, -6, 46 + flap);
      ctx.bezierCurveTo(4, 36 + flap * 0.4, 18, 12, 30, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Central streamlined fuselage
      ctx.fillStyle = '#051b27';
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Bioluminescent dorsal telemetry spine & wing edges
      ctx.strokeStyle = '#8fd8db';
      ctx.lineWidth = 1.2;
      ctx.shadowColor = '#8fd8db';
      ctx.shadowBlur = 8;

      // Spine line
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(-32, 0);
      ctx.stroke();

      // Wing lateral lines
      ctx.beginPath();
      ctx.moveTo(8, -8);
      ctx.lineTo(-8, -26 - flap * 0.5);
      ctx.moveTo(8, 8);
      ctx.lineTo(-8, 26 + flap * 0.5);
      ctx.stroke();

      // Nose acoustic transducer ping emitter
      ctx.fillStyle = '#f2a93b';
      ctx.shadowColor = '#f2a93b';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(24, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    function loop() {
      const now = performance.now();
      const t = (now - startTime) * 0.001;
      const scrollDepth = typeof getProgress === 'function' ? getProgress() : 0;

      ctx.clearRect(0, 0, width, height);
      updateAndDrawCursorSwimmer(width, height, t, now, scrollDepth);

      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-20 h-full w-full"
    />
  );
}
