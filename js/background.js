/* 动态全屏背景 v2：增强音频分析 (bass/mid/treble/beat) + 三种创意主题 */
(function () {
  'use strict';

  const canvas = document.getElementById('bg');
  const ctx = canvas.getContext('2d', { alpha: false });
  const MODES = ['aurora', 'stars', 'wave'];
  const LABEL = { aurora: '极光', stars: '星尘', wave: '音浪' };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, dpr = 1;
  let t = 0, raf = 0, last = 0;
  let mode = localStorage.getItem('bgMode') || 'aurora';
  if (MODES.indexOf(mode) < 0) mode = 'aurora';

  // 音频数据（由 app.js 通过 setAudioData 传入）
  let audio = { level: 0, bass: 0, mid: 0, treble: 0, beat: false };
  // 平滑后的值
  let smooth = { level: 0, bass: 0, mid: 0, treble: 0 };
  let hue = 210;
  let beatPulse = 0;

  // 粒子系统（共用）
  const stars = [];
  const particles = [];

  function seedStars() {
    stars.length = 0;
    const n = Math.round(Math.min(260, Math.max(80, (W * H) / 12000)));
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.8 + 0.3,
        sp: Math.random() * 0.3 + 0.05,
        tw: Math.random() * Math.PI * 2,
        twSp: Math.random() * 2 + 1,
        layer: Math.random() < 0.4 ? 2 : (Math.random() < 0.7 ? 1 : 0),
        hueOff: Math.random() * 60 - 30
      });
    }
  }

  function seedParticles() {
    particles.length = 0;
    const n = 40;
    for (let i = 0; i < n; i++) {
      particles.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 3 + 1, life: Math.random(),
        hueOff: Math.random() * 80 - 40
      });
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedStars();
    seedParticles();
  }

  // ---------- 主题 1：极光（增强） ----------
  function drawAurora(dt) {
    // 深色底
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, `hsl(${(hue + 220) % 360} 50% 4%)`);
    bgGrad.addColorStop(1, `hsl(${hue} 55% ${3 + smooth.bass * 4}%)`);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 多层流动光带
    ctx.globalCompositeOperation = 'lighter';
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const p = i / bands;
      const speed = 0.04 + p * 0.08;
      const ang = t * speed + p * Math.PI * 2;
      const cx = W * (0.5 + 0.4 * Math.cos(ang) * (1 - p * 0.3));
      const cy = H * (0.35 + 0.35 * Math.sin(ang * 1.4 + i * 1.7));
      const baseR = Math.max(W, H) * (0.25 + 0.12 * Math.sin(t * 0.2 + i));
      // bass 驱动半径膨胀，treble 驱动闪烁
      const r = Math.max(20, baseR + smooth.bass * 80 + Math.sin(t * 2 + i) * 20);
      const hh = (hue + i * 40 + smooth.mid * 60) % 360;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const alpha = (0.18 + smooth.bass * 0.25 + smooth.mid * 0.1) * (1 - p * 0.3);
      g.addColorStop(0, `hsla(${hh} 92% ${56 + smooth.treble * 20}% / ${alpha})`);
      g.addColorStop(0.4, `hsla(${(hh + 30) % 360} 88% 50% / ${alpha * 0.4})`);
      g.addColorStop(1, `hsla(${(hh + 60) % 360} 80% 40% / 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // beat 脉冲环
    if (beatPulse > 0.01) {
      ctx.strokeStyle = `hsla(${hue} 90% 70% / ${beatPulse * 0.3})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, (1 - beatPulse) * Math.max(W, H) * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      beatPulse *= 0.92;
    }

    // 漂浮粒子（音频驱动）
    for (const p of particles) {
      p.x += p.vx * (1 + smooth.mid * 4) * dt * 60;
      p.y += p.vy * (1 + smooth.bass * 3) * dt * 60 - smooth.level * 0.5;
      p.life += dt * 0.3;
      if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
      const a = 0.15 + 0.3 * Math.abs(Math.sin(p.life)) + smooth.treble * 0.2;
      const r = p.r * (1 + smooth.bass * 1.5);
      const hh = (hue + p.hueOff + 360) % 360;
      ctx.fillStyle = `hsla(${hh} 90% 80% / ${Math.min(1, a)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 底部流动波纹
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalAlpha = 0.06 + smooth.bass * 0.08;
    ctx.strokeStyle = `hsl(${hue} 80% 70%)`;
    ctx.lineWidth = 1;
    for (let k = 0; k < 16; k++) {
      const y0 = H * (k / 16) + Math.sin(t * 0.4 + k) * 10;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 20) {
        const wave = Math.sin((x * 0.005) + t * 0.8 + k * 0.3) * (12 + smooth.bass * 30);
        const y = y0 + wave;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- 主题 2：星尘（增强） ----------
  function drawStars(dt) {
    // 星云背景
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, `hsl(${(hue + 240) % 360} 55% ${5 + smooth.bass * 4}%)`);
    bgGrad.addColorStop(1, `hsl(${hue} 60% ${3 + smooth.bass * 3}%)`);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 星云云团（bass 驱动）
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const ang = t * 0.02 + i * 2.1;
      const cx = W * (0.3 + 0.4 * Math.cos(ang));
      const cy = H * (0.3 + 0.4 * Math.sin(ang * 1.3));
      const r = Math.max(50, Math.max(W, H) * (0.2 + smooth.bass * 0.15 + Math.sin(t * 0.1 + i) * 0.05));
      const hh = (hue + i * 50 + smooth.mid * 40) % 360;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `hsla(${hh} 80% 50% / ${0.08 + smooth.bass * 0.12})`);
      g.addColorStop(1, `hsla(${hh} 80% 40% / 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    // 星星（三层视差，音频驱动闪烁和大小）
    for (const s of stars) {
      const par = [0.3, 0.6, 1.0][s.layer];
      s.y += s.sp * par * (1 + smooth.level * 3) * dt * 60;
      s.x -= s.sp * 0.2 * par * dt * 60;
      s.tw += dt * s.twSp * (1 + smooth.treble * 2);
      if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
      if (s.x < -4) s.x = W + 4;
      const tw = Math.abs(Math.sin(s.tw));
      const a = 0.3 + 0.5 * tw + smooth.treble * 0.3;
      const r = s.r * par * (1 + smooth.bass * 0.8 + tw * 0.4);
      const hh = (hue + s.hueOff + 360) % 360;
      // 光晕
      if (r > 1.2) {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 4);
        g.addColorStop(0, `hsla(${hh} 90% 85% / ${Math.min(1, a * 0.5)})`);
        g.addColorStop(1, `hsla(${hh} 90% 85% / 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(s.x - r * 4, s.y - r * 4, r * 8, r * 8);
      }
      ctx.fillStyle = `hsla(${hh} 90% 88% / ${Math.min(1, a)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // beat 触发流星
    if (beatPulse > 0.5) {
      const sx = Math.random() * W, sy = Math.random() * H * 0.5;
      const len = 40 + smooth.bass * 60;
      const g = ctx.createLinearGradient(sx, sy, sx - len, sy + len * 0.3);
      g.addColorStop(0, `hsla(${hue} 90% 90% / ${beatPulse})`);
      g.addColorStop(1, `hsla(${hue} 90% 90% / 0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - len, sy + len * 0.3);
      ctx.stroke();
      beatPulse *= 0.85;
    } else beatPulse *= 0.9;

    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- 主题 3：音浪（全新，频谱可视化） ----------
  const waveHistory = [];
  function drawWave(dt) {
    // 深色渐变底
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, `hsl(${(hue + 220) % 360} 50% 4%)`);
    bgGrad.addColorStop(0.5, `hsl(${hue} 55% 6%)`);
    bgGrad.addColorStop(1, `hsl(${(hue + 340) % 360} 50% 3%)`);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 中心辐射光环（bass 驱动）
    ctx.globalCompositeOperation = 'lighter';
    const cx = W / 2, cy = H / 2;
    for (let i = 0; i < 3; i++) {
      const r = Math.max(20, (0.15 + i * 0.12) * Math.max(W, H) + smooth.bass * 100 + Math.sin(t * 0.5 + i) * 30);
      const hh = (hue + i * 60 + smooth.mid * 50) % 360;
      const g = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r);
      g.addColorStop(0, `hsla(${hh} 90% 60% / 0)`);
      g.addColorStop(0.5, `hsla(${hh} 90% 65% / ${0.06 + smooth.bass * 0.12})`);
      g.addColorStop(1, `hsla(${hh} 90% 60% / 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 频谱条（底部，镜像）
    const bars = 64;
    const barW = W / bars * 0.7;
    const gap = W / bars * 0.3;
    const baseY = H * 0.85;
    for (let i = 0; i < bars; i++) {
      // 用 sin 模拟频谱形状 + 音频驱动
      const freq = i / bars;
      const energy = freq < 0.15 ? smooth.bass : freq < 0.5 ? smooth.mid : smooth.treble;
      const shape = Math.sin(t * 1.5 + i * 0.3) * 0.3 + 0.5;
      const h = Math.max(2, (energy * 0.6 + shape * 0.15) * H * 0.35);
      const x = i * (barW + gap) + gap / 2;
      const hh = (hue + freq * 120 + smooth.mid * 60) % 360;
      // 上方条
      const g1 = ctx.createLinearGradient(0, baseY - h, 0, baseY);
      g1.addColorStop(0, `hsla(${hh} 90% 70% / ${0.5 + energy * 0.5})`);
      g1.addColorStop(1, `hsla(${hh} 90% 50% / 0.1)`);
      ctx.fillStyle = g1;
      ctx.fillRect(x, baseY - h, barW, h);
      // 下方镜像
      const g2 = ctx.createLinearGradient(0, baseY, 0, baseY + h * 0.5);
      g2.addColorStop(0, `hsla(${hh} 90% 50% / 0.1)`);
      g2.addColorStop(1, `hsla(${hh} 90% 70% / 0)`);
      ctx.fillStyle = g2;
      ctx.fillRect(x, baseY, barW, h * 0.5);
    }

    // 顶部波形线
    ctx.strokeStyle = `hsla(${hue} 90% 70% / ${0.15 + smooth.mid * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const y = H * 0.15 + Math.sin(x * 0.01 + t * 2) * (15 + smooth.bass * 40) +
                Math.sin(x * 0.03 + t * 3) * (8 + smooth.treble * 20);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // beat 脉冲
    if (beatPulse > 0.01) {
      ctx.strokeStyle = `hsla(${hue} 90% 80% / ${beatPulse * 0.4})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, (1 - beatPulse) * Math.max(W, H) * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      beatPulse *= 0.9;
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- 主循环 ----------
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    t += dt * (reduce ? 0.25 : 1);

    // 平滑音频数据
    const k = Math.min(1, dt * 6);
    smooth.level += (audio.level - smooth.level) * k;
    smooth.bass += (audio.bass - smooth.bass) * k;
    smooth.mid += (audio.mid - smooth.mid) * k;
    smooth.treble += (audio.treble - smooth.treble) * k;

    // beat 脉冲
    if (audio.beat) beatPulse = 1;

    if (mode === 'aurora') drawAurora(dt);
    else if (mode === 'stars') drawStars(dt);
    else drawWave(dt);
  }

  // ---------- 对外接口 ----------
  window.BG = {
    modes: MODES,
    label: (m) => LABEL[m || mode] || mode,
    getMode: () => mode,
    setMode(m) {
      if (MODES.indexOf(m) < 0) return;
      mode = m;
      localStorage.setItem('bgMode', m);
    },
    nextMode() {
      this.setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
      return mode;
    },
    setHue(h) { hue = ((h % 360) + 360) % 360; },
    setAudioData(d) { audio = d || audio; },
    // 旧接口兼容
    setLevel(v) { audio.level = Math.max(0, Math.min(1, v || 0)); }
  };

  addEventListener('resize', resize, { passive: true });
  resize();
  last = performance.now();
  raf = requestAnimationFrame(frame);
})();
