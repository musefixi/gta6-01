// All of Neon Harbor's sound is synthesised with WebAudio — there are no audio files.
// A lazy AudioContext (created on the first key or click, as browsers require) feeds one
// master gain: engine and skid loops, a distance-based police siren, one-shot effects
// (gunshots, crashes, horns, thuds, jingles) and a slow synthwave pad that loops
// underneath. M toggles the master gain.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let engine = null;
  let skid = null;
  let siren = null;
  let muted = false;
  let musicTimer = 0;
  let chordIndex = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noiseBurst({ freq = 1200, type = 'bandpass', gain = 0.3, decay = 0.15, q = 0.8, sweepTo = null }) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + decay);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + decay + 0.05);
  }

  function tone({ freq = 440, type = 'sine', gain = 0.15, decay = 0.2, sweepTo = null, delay = 0 }) {
    if (!ensure()) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }

  function startEngine() {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 28;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.4;
    osc.connect(filter);
    sub.connect(subGain).connect(filter);
    filter.connect(g).connect(master);
    osc.start();
    sub.start();
    engine = { osc, sub, filter, g };
  }

  function startSkid() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 950;
    filter.Q.value = 2.4;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(filter).connect(g).connect(master);
    src.start();
    skid = { g };
  }

  function startSiren() {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 760;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g).connect(master);
    osc.start();
    siren = { osc, g };
  }

  const CHORDS = [
    [110.0, 220.0, 261.6, 329.6], // Am
    [87.3, 174.6, 220.0, 261.6], // F
    [98.0, 196.0, 246.9, 293.7], // G
    [130.8, 196.0, 261.6, 329.6], // C
  ];

  function playChord(freqs) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const dur = 4.6;
    for (const freq of freqs) {
      for (const detune of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 640;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.016, t + 1.4);
        g.gain.setValueAtTime(0.016, t + dur - 1.4);
        g.gain.linearRampToValueAtTime(0, t + dur);
        osc.connect(filter).connect(g).connect(master);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      }
    }
    tone({ freq: freqs[0] / 2, type: 'sine', gain: 0.03, decay: dur * 0.9 });
  }

  return {
    unlock() { ensure(); },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.03);
      return muted;
    },
    /** Called every frame: engine voice follows the player's car, siren the nearest cop. */
    update(dt, engineRatio, sirenDistance) {
      if (!ctx) return;
      if (!engine) startEngine();
      if (!skid) startSkid();
      if (!siren) startSiren();
      const t = ctx.currentTime;
      const target = engineRatio === null ? 0 : 0.055 + engineRatio * 0.03;
      engine.g.gain.setTargetAtTime(target, t, 0.09);
      if (engineRatio !== null) {
        engine.osc.frequency.setTargetAtTime(52 + engineRatio * 175, t, 0.06);
        engine.sub.frequency.setTargetAtTime(26 + engineRatio * 84, t, 0.06);
        engine.filter.frequency.setTargetAtTime(380 + engineRatio * 760, t, 0.1);
      }
      if (sirenDistance !== null && sirenDistance < 760) {
        siren.g.gain.setTargetAtTime(0.028 * (1 - sirenDistance / 760) + 0.004, t, 0.12);
        siren.osc.frequency.setTargetAtTime(Math.floor(t * 1.5) % 2 === 0 ? 715 : 955, t, 0.02);
      } else {
        siren.g.gain.setTargetAtTime(0, t, 0.15);
      }
      musicTimer -= dt;
      if (musicTimer <= 0) {
        playChord(CHORDS[chordIndex % CHORDS.length]);
        chordIndex += 1;
        musicTimer = 4.6;
      }
    },
    setSkid(on) {
      if (!ctx || !skid) return;
      skid.g.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.05);
    },
    gunshot(volume = 1) {
      noiseBurst({ freq: 2100, type: 'bandpass', gain: 0.34 * volume, decay: 0.13, q: 0.5 });
      tone({ freq: 160, type: 'sine', gain: 0.22 * volume, decay: 0.1, sweepTo: 55 });
    },
    dryFire() { tone({ freq: 1250, type: 'square', gain: 0.05, decay: 0.035 }); },
    reload() {
      tone({ freq: 880, type: 'square', gain: 0.06, decay: 0.04 });
      tone({ freq: 620, type: 'square', gain: 0.06, decay: 0.04, delay: 0.34 });
      tone({ freq: 990, type: 'square', gain: 0.07, decay: 0.05, delay: 0.78 });
    },
    punch() { noiseBurst({ freq: 500, type: 'lowpass', gain: 0.2, decay: 0.08 }); },
    thud() { tone({ freq: 130, type: 'sine', gain: 0.3, decay: 0.14, sweepTo: 48 }); },
    crash(v = 0.6) {
      noiseBurst({ freq: 420, type: 'lowpass', gain: 0.4 * v + 0.05, decay: 0.24 });
      tone({ freq: 95, type: 'sine', gain: 0.3 * v, decay: 0.2, sweepTo: 40 });
    },
    explosion() {
      noiseBurst({ freq: 900, type: 'lowpass', gain: 0.85, decay: 0.75, sweepTo: 90 });
      tone({ freq: 58, type: 'sine', gain: 0.6, decay: 0.7, sweepTo: 30 });
    },
    honk() {
      tone({ freq: 392, type: 'square', gain: 0.045, decay: 0.22 });
      tone({ freq: 494, type: 'square', gain: 0.045, decay: 0.22 });
    },
    cash() {
      tone({ freq: 1318, type: 'sine', gain: 0.09, decay: 0.09 });
      tone({ freq: 1760, type: 'sine', gain: 0.09, decay: 0.14, delay: 0.07 });
    },
    pickup() {
      tone({ freq: 660, type: 'triangle', gain: 0.12, decay: 0.1 });
      tone({ freq: 880, type: 'triangle', gain: 0.12, decay: 0.16, delay: 0.08 });
    },
    door() { tone({ freq: 210, type: 'sine', gain: 0.14, decay: 0.09, sweepTo: 120 }); },
    spray() { noiseBurst({ freq: 3400, type: 'bandpass', gain: 0.1, decay: 0.9, q: 1.6 }); },
    missionWin() {
      [523, 659, 784, 1047].forEach((freq, i) => tone({ freq, type: 'triangle', gain: 0.13, decay: 0.22, delay: i * 0.09 }));
    },
    missionFail() {
      [330, 262, 196].forEach((freq, i) => tone({ freq, type: 'triangle', gain: 0.12, decay: 0.24, delay: i * 0.13 }));
    },
  };
}
