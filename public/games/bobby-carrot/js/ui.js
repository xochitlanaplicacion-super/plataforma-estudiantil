// Bobby Carrot Remastered - UI & Universal Controls Manager
import { audio } from './audio.js';

export class UIManager {
  constructor(game, container, canvas, renderer) {
    this.game = game;
    this.container = container;
    this.canvas = canvas;
    this.renderer = renderer;
    this.toastTimeout = null;

    // References to DOM elements
    this.elements = {};
    this.initDOM();
    this.setupAutoScaling();
    this.setupInputHandlers();
    this.setupTouchControls();
    this.updateRenderModeUI();

    // Hook game state changes
    this.game.onStateChange = (state) => this.handleStateChange(state);
  }

  initDOM() {
    this.elements = {
      menuOverlay: document.getElementById('menu-overlay'),
      levelSelectModal: document.getElementById('level-select-modal'),
      victoryModal: document.getElementById('victory-modal'),
      deathModal: document.getElementById('death-modal'),
      levelTitle: document.getElementById('hud-level-title'),
      timeDisplay: document.getElementById('hud-time'),
      stepsDisplay: document.getElementById('hud-steps'),
      muteBtn: document.getElementById('btn-mute'),
      fullscreenBtn: document.getElementById('btn-fullscreen'),
      campaignTitle: document.getElementById('campaign-title'),
      levelGrid: document.getElementById('level-grid'),
      btnRenderMode: document.getElementById('btn-render-mode'),
      touchBtnRenderMode: document.getElementById('touch-btn-render-mode'),
      menuModeClassic: document.getElementById('menu-mode-classic'),
      menuModeHd: document.getElementById('menu-mode-hd'),
      toast: document.getElementById('render-mode-toast'),
    };
  }

  setupAutoScaling() {
    const resize = () => {
      const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      const isPortrait = window.innerHeight > window.innerWidth;

      const header = document.querySelector('.header-bar');
      const headerH = header ? header.offsetHeight : 48;
      const touchControls = document.getElementById('touch-controls');

      // Medidas visibles exactas (usando visualViewport para máxima fidelidad en Safari iOS)
      const windowW = window.visualViewport ? window.visualViewport.width : window.innerWidth;
      const windowH = window.visualViewport ? window.visualViewport.height : window.innerHeight;

      let availableW = windowW - 12;
      let availableH = windowH - headerH - 12;

      // En modo táctil vertical: descontar exactamente el alto del D-pad inferior
      if (isTouch && isPortrait) {
        const controlsH = touchControls ? touchControls.offsetHeight || 135 : 135;
        availableH = Math.max(120, availableH - controlsH - 8);
      } else if (isTouch && !isPortrait) {
        // En modo horizontal táctil: dejar margen lateral para los pulgares
        availableW = Math.max(180, availableW - 140);
      }

      // Aspect ratio de la pantalla interna 256x192 (4:3)
      const aspect = 256 / 192;
      let targetW = availableW;
      let targetH = targetW / aspect;

      if (targetH > availableH) {
        targetH = availableH;
        targetW = targetH * aspect;
      }

      this.canvas.style.width = `${Math.floor(targetW)}px`;
      this.canvas.style.height = `${Math.floor(targetH)}px`;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 120));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resize);
    }
    resize();
  }

  setupInputHandlers() {
    // Keyboard Controls
    window.addEventListener('keydown', (e) => {
      // First interaction unlocks Safari Web Audio
      audio.init();

      if (e.repeat && (e.key === 'r' || e.key === 'R')) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          this.game.queueInput('Up');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          this.game.queueInput('Down');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          this.game.queueInput('Left');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          this.game.queueInput('Right');
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          this.game.restartLevel();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          this.toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case 'h':
        case 'H':
          e.preventDefault();
          this.toggleRenderMode();
          break;
        case 'Escape':
        case 'p':
        case 'P':
          e.preventDefault();
          this.showMenu();
          break;
        case 'Enter':
        case ' ':
          if (this.game.state === 'LEVEL_COMPLETE') {
            e.preventDefault();
            this.game.nextLevel();
          } else if (this.game.state === 'DEAD') {
            e.preventDefault();
            this.game.restartLevel();
          }
          break;
      }
    });

    // Audio unlock on any first click / tap
    const unlockAudio = () => {
      audio.init();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
  }

  setupTouchControls() {
    // Virtual D-pad buttons
    const bindBtn = (id, direction) => {
      const btn = document.getElementById(id);
      if (!btn) return;

      const trigger = (e) => {
        e.preventDefault();
        audio.init();
        this.game.queueInput(direction);
      };

      btn.addEventListener('touchstart', trigger, { passive: false });
      btn.addEventListener('mousedown', trigger);
    };

    bindBtn('dpad-up', 'Up');
    bindBtn('dpad-down', 'Down');
    bindBtn('dpad-left', 'Left');
    bindBtn('dpad-right', 'Right');

    // Canvas Touch Gestures (Swipe for quick one-finger mobile play)
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = performance.now();
      }
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Responsive swipe sensitivity (threshold 22px)
        if (dist > 22) {
          if (Math.abs(dx) > Math.abs(dy)) {
            this.game.queueInput(dx > 0 ? 'Right' : 'Left');
          } else {
            this.game.queueInput(dy > 0 ? 'Down' : 'Up');
          }
          // Reset anchor to allow continuous sliding
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }
    }, { passive: true });
  }

  toggleMute() {
    const isMuted = audio.toggleMute();
    if (this.elements.muteBtn) {
      this.elements.muteBtn.innerHTML = isMuted ? '🔇' : '🔊';
      this.elements.muteBtn.title = isMuted ? 'Activar sonido (M)' : 'Silenciar sonido (M)';
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      if (this.elements.fullscreenBtn) this.elements.fullscreenBtn.innerHTML = '⛶';
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      if (this.elements.fullscreenBtn) this.elements.fullscreenBtn.innerHTML = '⛶';
    }
  }

  showMenu() {
    this.elements.menuOverlay.classList.remove('hidden');
    this.elements.levelSelectModal.classList.add('hidden');
    this.elements.victoryModal.classList.add('hidden');
    this.elements.deathModal.classList.add('hidden');
  }

  hideMenu() {
    this.elements.menuOverlay.classList.add('hidden');
    this.elements.levelSelectModal.classList.add('hidden');
    this.elements.victoryModal.classList.add('hidden');
    this.elements.deathModal.classList.add('hidden');
  }

  openLevelSelect(campaign) {
    if (campaign) this.game.campaign = campaign;
    const isCarrot = this.game.campaign === 'Carrot_Harvest';
    this.elements.campaignTitle.innerText = isCarrot ? 'ZANAHORIAS (CARROT HARVEST)' : 'HUEVOS DE PASCUA (EASTER EGGS)';

    const list = this.game.getLevelList();
    const unlockedMax = this.game.saveData.unlocked[this.game.campaign] || 0;
    const scores = this.game.saveData.scores[this.game.campaign] || {};

    this.elements.levelGrid.innerHTML = '';
    list.forEach((_, idx) => {
      const btn = document.createElement('button');
      btn.className = 'level-card';
      const isUnlocked = idx <= unlockedMax;

      if (isUnlocked) {
        btn.classList.add('unlocked');
        const score = scores[idx];
        let bestText = '';
        if (score && score.time < 999999) {
          const s = Math.floor(score.time);
          bestText = `<span class="score-pill">⏱ ${s}s • 👣 ${score.steps}</span>`;
        }
        btn.innerHTML = `<strong>${idx + 1}</strong>${bestText}`;
        btn.onclick = () => {
          this.hideMenu();
          this.game.startLevel(idx);
        };
      } else {
        btn.classList.add('locked');
        btn.innerHTML = `<span>🔒 ${idx + 1}</span>`;
      }

      this.elements.levelGrid.appendChild(btn);
    });

    this.elements.levelSelectModal.classList.remove('hidden');
  }

  handleStateChange(state) {
    if (state === 'LEVEL_COMPLETE') {
      const s = Math.floor(this.game.level.time);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      document.getElementById('modal-vic-time').innerText = `${mm}:${ss}`;
      document.getElementById('modal-vic-steps').innerText = String(this.game.level.steps);
      document.getElementById('modal-vic-level').innerText = `Nivel ${this.game.levelIndex + 1}`;
      this.elements.victoryModal.classList.remove('hidden');
    } else if (state === 'DEAD') {
      this.elements.deathModal.classList.remove('hidden');
    } else if (state === 'PLAYING') {
      this.elements.victoryModal.classList.add('hidden');
      this.elements.deathModal.classList.add('hidden');
    }
  }

  updateHUD(level, steps, time) {
    if (this.elements.levelTitle) {
      const mode = this.game.campaign === 'Carrot_Harvest' ? '🥕' : '🥚';
      this.elements.levelTitle.innerText = `${mode} Nivel ${this.game.levelIndex + 1}`;
    }
  }

  showToast(message) {
    if (!this.elements.toast) return;
    this.elements.toast.textContent = message;
    this.elements.toast.classList.remove('hidden');
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      if (this.elements.toast) this.elements.toast.classList.add('hidden');
    }, 1600);
  }

  toggleRenderMode() {
    if (!this.renderer) return;
    const newMode = (this.renderer.mode === 'HD_XBR') ? 'CLASSIC' : 'HD_XBR';
    this.setRenderMode(newMode);
  }

  setRenderMode(mode) {
    if (!this.renderer) return;
    this.renderer.setMode(mode);
    this.updateRenderModeUI();
    const label = (mode === 'HD_XBR') ? '✨ Modo Gráfico: HD Suave (Filtro xBR)' : '👾 Modo Gráfico: Pixel Art Clásico';
    this.showToast(label);
  }

  updateRenderModeUI() {
    if (!this.renderer) return;
    const isHD = (this.renderer.mode === 'HD_XBR');
    if (this.elements.btnRenderMode) {
      this.elements.btnRenderMode.textContent = isHD ? '✨ HD' : '👾 Clásico';
      this.elements.btnRenderMode.title = isHD
        ? 'Modo Actual: HD Suave xBR (Presiona H para Clásico)'
        : 'Modo Actual: Pixel Art Clásico (Presiona H para HD xBR)';
    }
    if (this.elements.touchBtnRenderMode) {
      this.elements.touchBtnRenderMode.textContent = isHD ? '✨ Modo HD' : '👾 Clásico';
    }
    if (this.elements.menuModeHd) {
      this.elements.menuModeHd.classList.toggle('active', isHD);
    }
    if (this.elements.menuModeClassic) {
      this.elements.menuModeClassic.classList.toggle('active', !isHD);
    }
  }
}
