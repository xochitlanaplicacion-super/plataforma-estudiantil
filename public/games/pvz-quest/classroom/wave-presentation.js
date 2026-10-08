import { renderCard } from './renderer.js';

export class WavePresentation {
  constructor(root) { this.root = root; this.node = null; this.timer = null; this.cancel = null; }
  clear() {
    clearTimeout(this.timer); this.timer = null;
    this.node?.remove(); this.node = null;
    this.cancel?.(false); this.cancel = null;
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
  destroy() { this.clear(); }
}
export const createWavePresentation = root => new WavePresentation(root);
