// ------------------------------------------------------------------
// Motor de audio procedural (WebAudio) — zumbidos, latidos, efectos
// ------------------------------------------------------------------

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humGain: GainNode | null = null;
  private growlGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastBeat = -10;

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    // buffer de ruido marrón
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }

    // Capa 1: zumbido ambiental (backrooms)
    const humSrc = ctx.createBufferSource();
    humSrc.buffer = this.noiseBuf;
    humSrc.loop = true;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 240;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.05;
    humSrc.connect(humFilter).connect(this.humGain).connect(this.master);
    humSrc.start();

    const buzz = ctx.createOscillator();
    buzz.type = "sawtooth";
    buzz.frequency.value = 96;
    const buzzFilter = ctx.createBiquadFilter();
    buzzFilter.type = "lowpass";
    buzzFilter.frequency.value = 300;
    const buzzGain = ctx.createGain();
    buzzGain.gain.value = 0.008;
    buzz.connect(buzzFilter).connect(buzzGain).connect(this.master);
    buzz.start();

    // Capa 2: gruñido/presencia del Merodeador (controlada por amenaza)
    const growlSrc = ctx.createBufferSource();
    growlSrc.buffer = this.noiseBuf;
    growlSrc.loop = true;
    growlSrc.playbackRate.value = 0.4;
    const growlFilter = ctx.createBiquadFilter();
    growlFilter.type = "bandpass";
    growlFilter.frequency.value = 90;
    growlFilter.Q.value = 1.4;
    this.growlGain = ctx.createGain();
    this.growlGain.gain.value = 0;
    growlSrc.connect(growlFilter).connect(this.growlGain).connect(this.master);
    growlSrc.start();
  }

  /** Llamado cada frame: threat 0..1 */
  update(threat: number, active: boolean): void {
    if (!this.ctx || !this.growlGain || !this.master) return;
    const t = this.ctx.currentTime;
    this.growlGain.gain.setTargetAtTime(threat * threat * 0.5, t, 0.35);
    if (active && threat > 0.2) {
      const interval = 1.15 - threat * 0.8; // 1.15s lejos → 0.35s muy cerca
      if (t - this.lastBeat > interval) {
        this.lastBeat = t;
        this.kick(t + 0.001, 0.25 + threat * 0.6);
        this.kick(t + 0.16, (0.25 + threat * 0.6) * 0.55);
      }
    }
  }

  private kick(at: number, vol: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(72, at);
    osc.frequency.exponentialRampToValueAtTime(38, at + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * 0.5), at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(g).connect(this.master);
    osc.start(at);
    osc.stop(at + 0.25);
  }

  private blip(freqA: number, freqB: number, dur: number, type: OscillatorType, vol: number, when = 0): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const at = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private noiseBurst(dur: number, filterFreq: number, vol: number, when = 0): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const ctx = this.ctx;
    const at = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(at);
    src.stop(at + dur + 0.05);
  }

  step(): void {
    this.noiseBurst(0.07, 420 + Math.random() * 200, 0.045);
  }
  click(): void {
    this.blip(760, 660, 0.06, "triangle", 0.12);
  }
  enterRoom(): void {
    this.blip(340, 520, 0.18, "sine", 0.16);
    this.blip(680, 880, 0.2, "triangle", 0.1, 0.08);
  }
  correct(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.blip(f, f, 0.16, "triangle", 0.14, i * 0.09));
  }
  wrong(): void {
    this.blip(180, 70, 0.5, "sawtooth", 0.22);
    this.noiseBurst(0.35, 300, 0.25, 0.02);
  }
  slam(): void {
    this.noiseBurst(0.3, 160, 0.55);
    if (this.ctx) this.kick(this.ctx.currentTime + 0.001, 1);
  }
  pickup(): void {
    this.blip(880, 1320, 0.14, "sine", 0.16);
  }
  shield(): void {
    this.blip(300, 640, 0.3, "sine", 0.18);
  }
  pulse(): void {
    this.blip(120, 900, 0.4, "sawtooth", 0.12);
    this.noiseBurst(0.4, 900, 0.12);
  }
  mapPing(): void {
    this.blip(980, 980, 0.1, "sine", 0.12);
    this.blip(1240, 1240, 0.14, "sine", 0.1, 0.12);
  }
  sting(): void {
    this.blip(110, 104, 0.7, "sawtooth", 0.2);
    this.noiseBurst(0.6, 500, 0.14);
  }
  portal(): void {
    [440, 554, 659, 880].forEach((f, i) => this.blip(f, f * 1.01, 0.4, "sine", 0.12, i * 0.12));
  }
  death(): void {
    this.blip(70, 28, 1.3, "sine", 0.5);
    this.noiseBurst(1.0, 220, 0.4, 0.05);
  }
  win(): void {
    [392, 523, 659, 784, 1046].forEach((f, i) => this.blip(f, f, 0.3, "triangle", 0.15, i * 0.11));
  }
}
