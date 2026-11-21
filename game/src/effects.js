// Short-lived visual effects, pooled and capped so a long session cannot grow them
// without bound: particles (sparks, smoke, splashes, cash), gun tracers, muzzle flashes,
// skid marks that fade over twenty seconds, floating score text, and screen shake. The
// simulation spawns them; the renderer only reads them.

const MAX_PARTICLES = 420;
const MAX_SKIDS = 520;
const MAX_TEXTS = 24;

export function createEffects() {
  const particles = [];
  const tracers = [];
  const skids = [];
  const texts = [];
  let shake = 0;

  function spawnParticle(particle) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push(particle);
  }

  return {
    particles, tracers, skids, texts,

    burst(x, y, options = {}) {
      const count = options.count ?? 8;
      const color = options.color ?? '#ffd94d';
      const speed = options.speed ?? 190;
      const life = options.life ?? 0.45;
      const size = options.size ?? 3;
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const v = speed * (0.3 + Math.random() * 0.7);
        spawnParticle({
          x, y,
          vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
          life: life * (0.6 + Math.random() * 0.7), maxLife: life,
          size: size * (0.6 + Math.random() * 0.8),
          color, gravity: options.gravity ?? 0, drag: options.drag ?? 2.2,
          grow: options.grow ?? 0,
        });
      }
    },

    smoke(x, y, amount = 1) {
      spawnParticle({
        x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 22, vy: -26 - Math.random() * 22,
        life: 1.1, maxLife: 1.1, size: 7 + amount * 2.2,
        color: 'rgba(52, 54, 60, 0.5)', gravity: -12, drag: 0.6, grow: 15,
      });
    },

    fire(x, y) {
      spawnParticle({
        x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 14,
        vx: (Math.random() - 0.5) * 16, vy: -34 - Math.random() * 26,
        life: 0.5, maxLife: 0.5, size: 6 + Math.random() * 6,
        color: Math.random() < 0.5 ? 'rgba(255, 122, 40, 0.85)' : 'rgba(255, 196, 64, 0.85)',
        gravity: -20, drag: 0.8, grow: -6,
      });
    },

    tracer(x1, y1, x2, y2) {
      tracers.push({ x1, y1, x2, y2, life: 0.07, maxLife: 0.07 });
      spawnParticle({
        x: x1, y: y1, vx: 0, vy: 0, life: 0.06, maxLife: 0.06,
        size: 9, color: 'rgba(255, 230, 150, 0.9)', gravity: 0, drag: 0, grow: 0,
      });
    },

    skid(x, y, angle) {
      if (skids.length >= MAX_SKIDS) skids.shift();
      skids.push({ x, y, angle, life: 20, maxLife: 20 });
    },

    text(x, y, value, color = '#ffffff') {
      if (texts.length >= MAX_TEXTS) texts.shift();
      texts.push({ x, y, value, color, life: 1.5, maxLife: 1.5 });
    },

    addShake(amount) {
      shake = Math.min(16, shake + amount);
    },

    shakeOffset() {
      if (shake <= 0.05) return { x: 0, y: 0 };
      return { x: (Math.random() - 0.5) * shake, y: (Math.random() - 0.5) * shake };
    },

    update(dt) {
      shake = Math.max(0, shake - dt * 26);
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.vy += p.gravity * dt;
        const dragK = Math.max(0, 1 - p.drag * dt);
        p.vx *= dragK; p.vy *= dragK;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.size = Math.max(0.4, p.size + p.grow * dt);
      }
      for (let i = tracers.length - 1; i >= 0; i -= 1) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) tracers.splice(i, 1);
      }
      for (let i = skids.length - 1; i >= 0; i -= 1) {
        skids[i].life -= dt;
        if (skids[i].life <= 0) skids.splice(i, 1);
      }
      for (let i = texts.length - 1; i >= 0; i -= 1) {
        const t = texts[i];
        t.life -= dt;
        t.y -= 34 * dt;
        if (t.life <= 0) texts.splice(i, 1);
      }
    },
  };
}
