import { renderCard } from './renderer.js';

export class WavePresentation {
  constructor(root) { this.root = root; this.node = null; this.timer = null; this.cancel = null; this.resultKey = null; }
  clear() {
    clearTimeout(this.timer); this.timer = null;
    this.node?.remove(); this.node = null;
    this.cancel?.(false); this.cancel = null;
    this.resultKey = null;
  }
  showWaveAnnouncement({ title, subtitle = '', kind = 'next' }) {
    this.clear();
    const node = document.createElement('section');
    node.className = `quest-announcement ${kind}`; node.setAttribute('role', 'status');
    const heading = document.createElement('strong'); heading.textContent = title;
    const detail = document.createElement('span'); detail.textContent = subtitle;
    node.append(heading, detail); this.root.append(node); this.node = node;
    return new Promise(resolve => { this.cancel = resolve; this.timer = setTimeout(() => { this.cancel = null; this.clear(); resolve(true); }, 1900); });
  }
  showTacticalCoin({ side, wave = 1, onComplete }) {
    this.clear();
    const node = document.createElement('section'); node.className = `quest-coin-overlay winner-${side}`;
    node.setAttribute('role', 'status'); node.setAttribute('aria-label', `Moneda de turno: comienza ${side === 'plants' ? 'Plantas' : 'Zombis'}`);
    const heading = document.createElement('strong'); heading.className = 'quest-coin-heading';
    heading.textContent = `Pausa táctica · próxima oleada ${wave}`;
    const scene = document.createElement('div'); scene.className = 'quest-coin-scene';
    const shadow = document.createElement('div'); shadow.className = 'quest-coin-shadow';
    const toss = document.createElement('div'); toss.className = 'quest-coin-toss';
    const coin = document.createElement('div'); coin.className = 'quest-coin';
    for (const team of ['plants', 'zombies']) {
      const face = document.createElement('div'); face.className = `quest-coin-face ${team}`;
      const portrait = document.createElement('canvas'); portrait.width = 120; portrait.height = 120;
      const label = document.createElement('span'); label.textContent = team === 'plants' ? 'PLANTAS' : 'ZOMBIS';
      face.append(portrait, label); coin.append(face);
      renderCard(portrait, team === 'plants' ? 'peashooter' : 'common').catch(() => {});
    }
    const edge = document.createElement('div'); edge.className = 'quest-coin-edge'; coin.append(edge);
    toss.append(coin); scene.append(shadow, toss);
    const result = document.createElement('strong'); result.className = 'quest-coin-result';
    result.textContent = `Compra primero: ${side === 'plants' ? 'Plantas' : 'Zombis'}`;
    const note = document.createElement('span'); note.textContent = 'Después compra el otro bando · cada unidad cuesta su precio';
    node.append(heading, scene, result, note); this.root.append(node); this.node = node;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return new Promise(resolve => {
      this.cancel = resolve;
      this.timer = setTimeout(() => {
        this.cancel = null; this.clear(); resolve(true); onComplete?.(side);
      }, reduced ? 850 : 2800);
    });
  }
  /** Persistent end-of-match result, also visible on the public projector. */
  showMatchResult({ winner, isPublic = false, onReplay } = {}) {
    const side = winner === 'plants' || winner === 'zombies' ? winner : 'draw';
    const key = `${side}:${isPublic ? 'public' : 'teacher'}`;
    // Continuous snapshots arrive frequently. Do not replay the entrance,
    // rebuild its action button or announce the same result every 100 ms.
    if (this.resultKey === key && this.node) return this.node;
    this.clear();
    const node = document.createElement('section');
    node.className = `quest-match-result winner-${side}`;
    node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); node.setAttribute('aria-atomic', 'true');
    const card = document.createElement('div'); card.className = 'quest-match-result-card';
    const label = document.createElement('strong'); label.className = 'quest-match-result-label'; label.textContent = 'Partida terminada';
    const portraits = document.createElement('div'); portraits.className = 'quest-match-result-portraits'; portraits.setAttribute('aria-hidden', 'true');
    const types = side === 'plants' ? ['sunflower', 'peashooter'] : side === 'zombies' ? ['common', 'football'] : ['peashooter', 'common'];
    for (const typeId of types) {
      const portrait = document.createElement('canvas'); portrait.width = 112; portrait.height = 90;
      portraits.append(portrait);
      renderCard(portrait, typeId).catch(() => {});
    }
    const heading = document.createElement('h2'); heading.className = 'quest-match-result-title';
    heading.textContent = side === 'plants' ? '¡Ganan Plantas!' : side === 'zombies' ? '¡Ganan Zombis!' : '¡Empate!';
    const detail = document.createElement('p'); detail.className = 'quest-match-result-detail';
    detail.textContent = side === 'plants' ? 'La casa resistió. ¡El jardín queda a salvo!'
      : side === 'zombies' ? 'Los zombis atravesaron la última defensa y llegaron a la casa.'
        : 'Quedan fuerzas de ambos bandos. No se declara una victoria automática.';
    card.append(label, portraits, heading, detail);
    if (!isPublic) {
      const replay = document.createElement('button'); replay.type = 'button'; replay.className = 'quest-match-result-replay primary';
      replay.dataset.action = 'confirm-exit'; replay.textContent = 'Preparar otra clase';
      if (typeof onReplay === 'function') replay.addEventListener('click', event => { event.stopPropagation(); onReplay(); });
      card.append(replay);
    }
    node.append(card);
    (this.root.closest?.('#game') || this.root).append(node);
    this.node = node; this.resultKey = key;
    // No automatic dismissal and no autofocus: the class can read the result
    // at its own pace, without moving a teacher's keyboard focus unexpectedly.
    return node;
  }
  destroy() { this.clear(); }
}
export const createWavePresentation = root => new WavePresentation(root);
