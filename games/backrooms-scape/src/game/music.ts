import type { Difficulty } from "./BackroomsGame";

const TRACKS: Record<Difficulty, string> = {
  facil: "Behind_the_Storage_Rack.mp3",
  normal: "The_Carpeted_Corridor.mp3",
  dificil: "Office_Hours_Ended.mp3",
};

const QUESTION_TRACK = "ssstik.io_1788148814328.mp3";
const MUSIC_KEY = "backrooms_scape_music_muted_v1";

export function loadMusicMuted(): boolean {
  try {
    return localStorage.getItem(MUSIC_KEY) === "true";
  } catch {
    return false;
  }
}

class BackroomsMusic {
  private main: HTMLAudioElement | null = null;
  private question: HTMLAudioElement | null = null;
  private layer: "main" | "question" = "main";
  private muted = loadMusicMuted();
  private fadeTokens = new WeakMap<HTMLAudioElement, number>();

  private url(file: string): string {
    return new URL(`./audio/${file}`, window.location.href).href;
  }

  private make(file: string): HTMLAudioElement {
    const audio = new Audio(this.url(file));
    audio.loop = true;
    audio.preload = "auto";
    audio.muted = this.muted;
    audio.volume = 0;
    return audio;
  }

  private play(audio: HTMLAudioElement): void {
    void audio.play().catch((error) => console.warn("[Backrooms] no se pudo iniciar la música:", error));
  }

  private fade(audio: HTMLAudioElement | null, target: number, duration = 700, pauseAtEnd = false): void {
    if (!audio) return;
    const token = (this.fadeTokens.get(audio) || 0) + 1;
    this.fadeTokens.set(audio, token);
    const from = audio.volume;
    const started = performance.now();
    const frame = (now: number): void => {
      if (this.fadeTokens.get(audio) !== token) return;
      const progress = Math.min(1, (now - started) / duration);
      const eased = progress * progress * (3 - 2 * progress);
      audio.volume = Math.max(0, Math.min(1, from + (target - from) * eased));
      if (progress < 1) requestAnimationFrame(frame);
      else if (pauseAtEnd && target === 0) audio.pause();
    };
    requestAnimationFrame(frame);
  }

  start(difficulty: Difficulty): void {
    this.stop();
    this.layer = "main";
    this.main = this.make(TRACKS[difficulty]);
    this.question = this.make(QUESTION_TRACK);
    this.play(this.main);
    this.fade(this.main, 0.34, 900);
  }

  enterQuestion(): void {
    if (!this.main || !this.question) return;
    this.layer = "question";
    this.question.currentTime = 0;
    this.play(this.question);
    this.fade(this.main, 0, 650, true);
    this.fade(this.question, 0.42, 650);
  }

  leaveQuestion(): void {
    if (!this.main || !this.question) return;
    this.layer = "main";
    this.play(this.main);
    this.fade(this.question, 0, 650, true);
    this.fade(this.main, 0.34, 650);
  }

  pause(): void {
    this.main?.pause();
    this.question?.pause();
  }

  resume(): void {
    const active = this.layer === "question" ? this.question : this.main;
    if (active) this.play(active);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.main) this.main.muted = muted;
    if (this.question) this.question.muted = muted;
    try {
      localStorage.setItem(MUSIC_KEY, String(muted));
    } catch {
      /* almacenamiento opcional */
    }
  }

  stop(): void {
    for (const audio of [this.main, this.question]) {
      if (!audio) continue;
      this.fadeTokens.set(audio, (this.fadeTokens.get(audio) || 0) + 1);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    this.main = null;
    this.question = null;
    this.layer = "main";
  }
}

export const backroomsMusic = new BackroomsMusic();
