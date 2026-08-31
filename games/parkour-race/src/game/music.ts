/* ============================================================
   MÚSICA DE PARTIDA — una pista determinística por mapa.
   El audio comienza después del clic del jugador para respetar
   las políticas de reproducción automática de los navegadores.
   ============================================================ */

export interface MusicTrack {
  name: string;
  file: string;
}

export const MUSIC_TRACKS: readonly MusicTrack[] = [
  { name: "Canopy Sprint", file: "canopy-sprint.mp3" },
  { name: "Last Lap Sprint", file: "last-lap-sprint.mp3" },
  { name: "Sun Soaked Hurdles", file: "sun-soaked-hurdles.mp3" },
] as const;

class GameMusic {
  private audio: HTMLAudioElement | null = null;
  private trackIndex = -1;

  private indexForSeed(seed: number): number {
    const normalizedSeed = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
    return normalizedSeed % MUSIC_TRACKS.length;
  }

  private trackUrl(file: string): string {
    // Producción: /games/parkour-race/index.html. Desarrollo: /.
    return new URL(`./audio/${file}`, window.location.href).href;
  }

  start(seed: number, muted: boolean): void {
    if (typeof window === "undefined") return;
    const nextIndex = this.indexForSeed(seed);

    if (!this.audio || this.trackIndex !== nextIndex) {
      this.stop();
      const track = MUSIC_TRACKS[nextIndex];
      const audio = new Audio(this.trackUrl(track.file));
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = 0.34;
      audio.muted = muted;
      this.audio = audio;
      this.trackIndex = nextIndex;
    } else {
      this.audio.muted = muted;
    }

    this.audio.play().catch((error: unknown) => {
      console.warn("[Parkour Race] no se pudo iniciar la música:", error);
    });
  }

  resume(seed: number, muted: boolean): void {
    this.start(seed, muted);
  }

  pause(): void {
    this.audio?.pause();
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = "";
      this.audio.load();
    }
    this.audio = null;
    this.trackIndex = -1;
  }

  setMuted(muted: boolean): void {
    if (this.audio) this.audio.muted = muted;
  }

  currentTrack(seed: number): MusicTrack {
    return MUSIC_TRACKS[this.indexForSeed(seed)];
  }
}

export const gameMusic = new GameMusic();
