/* ============================================================
   SFX — sonidos sintetizados con WebAudio (sin assets)
   ============================================================ */

class Sfx {
  private ctx: AudioContext | null = null;

  private ac(): AudioContext | null {
    if (typeof window === "undefined") return null;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    when = 0,
    slideTo?: number
  ) {
    const ac = this.ac();
    if (!ac) return;
    try {
      const t0 = ac.currentTime + when;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(ac.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    } catch {
      /* noop */
    }
  }

  jump() {
    this.tone(300, 0.16, "sine", 0.16, 0, 560);
  }
  doubleBeep() {
    this.tone(520, 0.08, "square", 0.07);
    this.tone(660, 0.1, "square", 0.07, 0.09);
  }
  correct() {
    this.tone(523.25, 0.12, "triangle", 0.2);
    this.tone(659.25, 0.12, "triangle", 0.2, 0.1);
    this.tone(783.99, 0.22, "triangle", 0.22, 0.2);
  }
  wrong() {
    this.tone(180, 0.22, "sawtooth", 0.14, 0, 120);
    this.tone(120, 0.3, "sawtooth", 0.12, 0.12, 90);
  }
  checkpoint() {
    this.tone(440, 0.1, "sine", 0.16);
    this.tone(660, 0.18, "sine", 0.16, 0.09);
  }
  respawn() {
    this.tone(500, 0.3, "sine", 0.12, 0, 220);
  }
  knock() {
    this.tone(150, 0.16, "square", 0.16, 0, 80);
  }
  /** agarre de repisa + impulso al trepar */
  climb() {
    this.tone(220, 0.09, "square", 0.09, 0, 300);
    this.tone(420, 0.14, "sine", 0.13, 0.24, 620);
  }
  fanfare() {
    const seq = [523.25, 659.25, 783.99, 1046.5];
    seq.forEach((f, i) => this.tone(f, 0.24, "triangle", 0.2, i * 0.13));
    this.tone(1318.5, 0.5, "triangle", 0.18, seq.length * 0.13);
  }
  ui() {
    this.tone(700, 0.06, "sine", 0.08);
  }
}

export const sfx = new Sfx();
