// Bobby Carrot Remastered - Core Game Engine
import { CARROT_LEVELS, EGG_LEVELS, TILE_CHARS } from './levels.js';
import { audio } from './audio.js';

export const TILES_W = 16;
export const TILES_H = 12;
export const TILE_SIZE = 16;
export const BUFFER_W = TILES_W * TILE_SIZE; // 256
export const BUFFER_H = TILES_H * TILE_SIZE; // 192

export const WALL_SWITCH = {
  Wall_Left_Right: 'Wall_Up_Down',
  Wall_Up_Down: 'Wall_Left_Right',
  Wall_Right_Up: 'Wall_Right_Down',
  Wall_Left_Down: 'Wall_Left_Up',
  Wall_Right_Down: 'Wall_Left_Down',
  Wall_Left_Up: 'Wall_Right_Up',
};

export const BELT_SWITCH = {
  Belt_Left: 'Belt_Right',
  Belt_Right: 'Belt_Left',
  Belt_Up: 'Belt_Down',
  Belt_Down: 'Belt_Up',
};

export class BobbyGame {
  constructor(sprites) {
    this.sprites = sprites;
    this.campaign = 'Carrot_Harvest'; // or 'Easter_Eggs'
    this.levelIndex = 0;

    // Save Data
    this.saveData = this.loadSaveData();

    // Game loop timing
    this.lastTime = performance.now();
    this.accumulatedTime = 0;
    this.tps = 30;
    this.tickMs = 1000 / this.tps;

    // Animation frame counters
    this.tileAnimFrame = 0;
    this.tileAnimTimer = 0;

    this.idleTimer = 0;
    this.idleFrame = 0;

    // Level State
    this.level = null;
    this.player = null;
    this.state = 'MENU'; // 'MENU', 'PLAYING', 'LEVEL_COMPLETE', 'DYING', 'DEAD', 'GAME_OVER'

    // Input buffer
    this.queuedDirection = null;

    // Callbacks
    this.onStateChange = null;
    this.onHUDUpdate = null;
  }

  loadSaveData() {
    try {
      const saved = localStorage.getItem('bobby_carrot_save');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Could not load localStorage', e);
    }
    return {
      unlocked: {
        Carrot_Harvest: 0,
        Easter_Eggs: 0,
      },
      scores: {
        Carrot_Harvest: {},
        Easter_Eggs: {},
      },
    };
  }

  saveGame() {
    try {
      localStorage.setItem('bobby_carrot_save', JSON.stringify(this.saveData));
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }
  }

  getLevelList() {
    return this.campaign === 'Carrot_Harvest' ? CARROT_LEVELS : EGG_LEVELS;
  }

  startLevel(index) {
    const list = this.getLevelList();
    if (index < 0) index = 0;
    if (index >= list.length) index = list.length - 1;
    this.levelIndex = index;

    const rawGrid = list[index];
    const height = rawGrid.length;
    const width = rawGrid[0].length;

    const tiles = [];
    let startX = 1, startY = 1;
    let carrotCount = 0;
    let eggCount = 0;

    for (let y = 0; y < height; y++) {
      const row = [];
      const line = rawGrid[y];
      for (let x = 0; x < width; x++) {
        const ch = line[x] || '.';
        const tileType = TILE_CHARS[ch] || 'Ground';
        row.push(tileType);

        if (tileType === 'Start') {
          startX = x;
          startY = y;
        } else if (tileType === 'Carrot') {
          carrotCount++;
        } else if (tileType === 'Egg_Spot') {
          eggCount++;
        }
      }
      tiles.push(row);
    }

    this.level = {
      width,
      height,
      tiles,
      carrots: carrotCount,
      eggs: eggCount,
      canEnd: (carrotCount === 0 && eggCount === 0),
      time: 0,
      steps: 0,
      bannerTimer: 2.0, // Shows "Level X" for 2 seconds
    };

    this.player = {
      x: startX,
      y: startY,
      prevX: startX,
      prevY: startY,
      targetX: startX,
      targetY: startY,
      direction: 'Down',
      isMoving: false,
      moveProgress: 0, // 0 to 1
      moveSpeed: 6.2,  // tiles per second (~0.16s per tile)
      silverKey: false,
      goldenKey: false,
      copperKey: false,
      onBelt: false,
      fadingTimer: 0,
      dyingTimer: 0,
      dyingFrame: 0,
    };

    this.state = 'PLAYING';
    this.queuedDirection = null;
    this.idleTimer = 0;
    this.idleFrame = 0;

    if (this.onStateChange) this.onStateChange(this.state);
  }

  restartLevel() {
    this.startLevel(this.levelIndex);
  }

  nextLevel() {
    const list = this.getLevelList();
    if (this.levelIndex + 1 < list.length) {
      this.startLevel(this.levelIndex + 1);
    } else {
      this.state = 'CAMPAIGN_COMPLETE';
      if (this.onStateChange) this.onStateChange(this.state);
    }
  }

  getTile(x, y) {
    if (!this.level) return 'Grass';
    if (x < 0 || x >= this.level.width || y < 0 || y >= this.level.height) {
      return 'Grass';
    }
    return this.level.tiles[y][x];
  }

  setTile(x, y, tile) {
    if (!this.level) return;
    if (x >= 0 && x < this.level.width && y >= 0 && y < this.level.height) {
      this.level.tiles[y][x] = tile;
    }
  }

  canMove(x, y, dir) {
    let nx = x;
    let ny = y;
    if (dir === 'Right') nx++;
    else if (dir === 'Left') nx--;
    else if (dir === 'Down') ny++;
    else if (dir === 'Up') ny--;

    if (nx < 0 || nx >= this.level.width || ny < 0 || ny >= this.level.height) {
      return false;
    }

    const currentTile = this.getTile(x, y);
    const targetTile = this.getTile(nx, ny);

    // Obstacles
    if (targetTile === 'Grass' || targetTile === 'Fence' || targetTile === 'Egg') {
      return false;
    }

    // Key / Lock check
    if (targetTile === 'Silver_Lock' && !this.player.silverKey) return false;
    if (targetTile === 'Golden_Lock' && !this.player.goldenKey) return false;
    if (targetTile === 'Copper_Lock' && !this.player.copperKey) return false;

    // Entering Turnstile walls check
    if (targetTile === 'Wall_Left_Right' && dir !== 'Up' && dir !== 'Down') return false;
    if (targetTile === 'Wall_Up_Down' && dir !== 'Left' && dir !== 'Right') return false;
    if (targetTile === 'Wall_Right_Up' && dir !== 'Right' && dir !== 'Up') return false;
    if (targetTile === 'Wall_Right_Down' && dir !== 'Right' && dir !== 'Down') return false;
    if (targetTile === 'Wall_Left_Up' && dir !== 'Left' && dir !== 'Up') return false;
    if (targetTile === 'Wall_Left_Down' && dir !== 'Left' && dir !== 'Down') return false;

    // Leaving Turnstile walls check
    if (currentTile === 'Wall_Left_Right' && (dir === 'Left' || dir === 'Right')) return false;
    if (currentTile === 'Wall_Up_Down' && (dir === 'Up' || dir === 'Down')) return false;
    if (currentTile === 'Wall_Right_Up' && (dir === 'Right' || dir === 'Up')) return false;
    if (currentTile === 'Wall_Right_Down' && (dir === 'Right' || dir === 'Down')) return false;
    if (currentTile === 'Wall_Left_Up' && (dir === 'Left' || dir === 'Up')) return false;
    if (currentTile === 'Wall_Left_Down' && (dir === 'Left' || dir === 'Down')) return false;

    // Belt checks: Cannot walk against belt direction
    if (targetTile === 'Belt_Left' && dir === 'Right') return false;
    if (targetTile === 'Belt_Right' && dir === 'Left') return false;
    if (targetTile === 'Belt_Up' && dir === 'Down') return false;
    if (targetTile === 'Belt_Down' && dir === 'Up') return false;

    // If currently on belt, cannot move via player input (belt carries you)
    if (this.player.onBelt && !this.isBeltTile(targetTile)) {
      // unless belt pushes you off
    }

    return true;
  }

  isBeltTile(tile) {
    return tile === 'Belt_Left' || tile === 'Belt_Right' || tile === 'Belt_Up' || tile === 'Belt_Down';
  }

  isWallTile(tile) {
    return tile && tile.startsWith('Wall_');
  }

  pressRedButton() {
    audio.playButton();
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const t = this.level.tiles[y][x];
        if (t === 'Red_Button') {
          this.level.tiles[y][x] = 'Red_Button_Pressed';
        } else if (t === 'Red_Button_Pressed') {
          this.level.tiles[y][x] = 'Red_Button';
        } else if (this.isWallTile(t)) {
          this.level.tiles[y][x] = WALL_SWITCH[t] || t;
        }
      }
    }
  }

  pressYellowButton() {
    audio.playButton();
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const t = this.level.tiles[y][x];
        if (t === 'Yellow_Button') {
          this.level.tiles[y][x] = 'Yellow_Button_Pressed';
        } else if (t === 'Yellow_Button_Pressed') {
          this.level.tiles[y][x] = 'Yellow_Button';
        } else if (this.isBeltTile(t)) {
          this.level.tiles[y][x] = BELT_SWITCH[t] || t;
        }
      }
    }
  }

  queueInput(direction) {
    if (this.state !== 'PLAYING') return;
    this.queuedDirection = direction;
  }

  triggerMove(dir, byBelt = false) {
    if (!this.canMove(this.player.x, this.player.y, dir)) {
      // Just change facing direction if not moving
      this.player.direction = dir;
      return false;
    }

    this.player.direction = dir;
    this.player.prevX = this.player.x;
    this.player.prevY = this.player.y;

    if (dir === 'Right') this.player.targetX = this.player.x + 1;
    else if (dir === 'Left') this.player.targetX = this.player.x - 1;
    else if (dir === 'Down') this.player.targetY = this.player.y + 1;
    else if (dir === 'Up') this.player.targetY = this.player.y - 1;

    this.player.isMoving = true;
    this.player.moveProgress = 0;

    if (!byBelt) {
      this.level.steps++;
      audio.playStep();
    } else {
      audio.playBelt();
    }

    return true;
  }

  onTileStepComplete() {
    const origX = this.player.prevX;
    const origY = this.player.prevY;
    const newX = this.player.targetX;
    const newY = this.player.targetY;

    this.player.x = newX;
    this.player.y = newY;
    this.player.isMoving = false;
    this.player.moveProgress = 0;

    const originalTile = this.getTile(origX, origY);
    const currentTile = this.getTile(newX, newY);

    // Tile left behind effects
    if (originalTile === 'Trap') {
      this.setTile(origX, origY, 'Trap_Activated');
    } else if (originalTile === 'Egg_Spot') {
      this.setTile(origX, origY, 'Egg');
      this.level.eggs--;
      audio.playEgg();
    } else if (this.isWallTile(originalTile)) {
      // Turnstile wall rotates when walking through
      this.setTile(origX, origY, WALL_SWITCH[originalTile] || originalTile);
    }

    if (this.isBeltTile(originalTile) && !this.isBeltTile(currentTile)) {
      this.player.onBelt = false;
    }

    // New tile entered effects
    if (currentTile === 'Carrot') {
      this.setTile(newX, newY, 'Carrot_Hole');
      this.level.carrots--;
      audio.playCarrot();
    } else if (currentTile === 'Silver_Key') {
      this.setTile(newX, newY, 'Ground');
      this.player.silverKey = true;
      audio.playKey();
    } else if (currentTile === 'Silver_Lock') {
      this.setTile(newX, newY, 'Ground');
      this.player.silverKey = false;
      audio.playLock();
    } else if (currentTile === 'Golden_Key') {
      this.setTile(newX, newY, 'Ground');
      this.player.goldenKey = true;
      audio.playKey();
    } else if (currentTile === 'Golden_Lock') {
      this.setTile(newX, newY, 'Ground');
      this.player.goldenKey = false;
      audio.playLock();
    } else if (currentTile === 'Copper_Key') {
      this.setTile(newX, newY, 'Ground');
      this.player.copperKey = true;
      audio.playKey();
    } else if (currentTile === 'Copper_Lock') {
      this.setTile(newX, newY, 'Ground');
      this.player.copperKey = false;
      audio.playLock();
    } else if (currentTile === 'Red_Button') {
      this.pressRedButton();
    } else if (currentTile === 'Yellow_Button') {
      this.pressYellowButton();
    } else if (currentTile === 'Trap_Activated') {
      // Stepped onto triggered spikes: death!
      this.state = 'DYING';
      this.player.dyingTimer = 0;
      this.player.dyingFrame = 0;
      audio.playTrap();
      audio.playDeath();
      if (this.onStateChange) this.onStateChange(this.state);
      return;
    }

    // Check if level can now exit
    if (this.level.carrots === 0 && this.level.eggs === 0) {
      if (!this.level.canEnd) {
        this.level.canEnd = true;
      }
    }

    // Check End Portal reached
    if (currentTile === 'End' && this.level.canEnd) {
      this.state = 'FADING';
      this.player.fadingTimer = 0;
      audio.playLevelComplete();

      // Unlock next level in save
      const nextIdx = this.levelIndex + 1;
      if (nextIdx > this.saveData.unlocked[this.campaign]) {
        this.saveData.unlocked[this.campaign] = nextIdx;
      }

      // Record best time and steps
      const currentBest = this.saveData.scores[this.campaign][this.levelIndex] || { time: 9999999, steps: 999999 };
      if (this.level.time < currentBest.time || !currentBest.time) currentBest.time = this.level.time;
      if (this.level.steps < currentBest.steps || !currentBest.steps) currentBest.steps = this.level.steps;
      this.saveData.scores[this.campaign][this.levelIndex] = currentBest;
      this.saveGame();

      if (this.onStateChange) this.onStateChange(this.state);
      return;
    }

    // If stepped on conveyor belt, activate belt mode
    if (this.isBeltTile(currentTile)) {
      this.player.onBelt = true;
    }
  }

  update(dt) {
    // Tile animation loop (conveyor belts, exit portals) ~ 4 frames per sec
    this.tileAnimTimer += dt;
    if (this.tileAnimTimer >= 0.15) {
      this.tileAnimTimer = 0;
      this.tileAnimFrame = (this.tileAnimFrame + 1) % 4;
    }

    if (this.state === 'DYING') {
      this.player.dyingTimer += dt;
      this.player.dyingFrame = Math.min(7, Math.floor(this.player.dyingTimer / 0.08));
      if (this.player.dyingTimer >= 0.8) {
        this.state = 'DEAD';
        if (this.onStateChange) this.onStateChange(this.state);
      }
      return;
    }

    if (this.state === 'FADING') {
      this.player.fadingTimer += dt;
      if (this.player.fadingTimer >= 0.6) {
        this.state = 'LEVEL_COMPLETE';
        if (this.onStateChange) this.onStateChange(this.state);
      }
      return;
    }

    if (this.state !== 'PLAYING') return;

    this.level.time += dt;
    if (this.level.bannerTimer > 0) {
      this.level.bannerTimer -= dt;
    }

    // Idle animation when standing still
    if (!this.player.isMoving) {
      this.idleTimer += dt;
      if (this.idleTimer >= 3.0) {
        this.idleFrame = Math.floor((this.idleTimer - 3.0) / 0.18) % 3;
      } else {
        this.idleFrame = 0;
      }
    } else {
      this.idleTimer = 0;
      this.idleFrame = 0;
    }

    // Player walking interpolation
    if (this.player.isMoving) {
      this.player.moveProgress += this.player.moveSpeed * dt;
      if (this.player.moveProgress >= 1.0) {
        this.onTileStepComplete();
      }
    }

    // Check next move if not moving
    if (!this.player.isMoving && this.state === 'PLAYING') {
      const currentTile = this.getTile(this.player.x, this.player.y);

      // Belt automatic movement priority
      if (this.isBeltTile(currentTile)) {
        let beltDir = 'Right';
        if (currentTile === 'Belt_Left') beltDir = 'Left';
        else if (currentTile === 'Belt_Up') beltDir = 'Up';
        else if (currentTile === 'Belt_Down') beltDir = 'Down';

        this.triggerMove(beltDir, true);
      } else if (this.queuedDirection) {
        const dir = this.queuedDirection;
        this.queuedDirection = null;
        this.triggerMove(dir, false);
      }
    }
  }

  // Camera & view calculations
  getCameraOffset() {
    if (!this.level || !this.player) return { x: 0, y: 0 };

    const diffX = TILES_W - this.level.width;
    const diffY = TILES_H - this.level.height;

    let playerRenderX = this.player.x;
    let playerRenderY = this.player.y;
    if (this.player.isMoving) {
      const p = Math.min(1, this.player.moveProgress);
      playerRenderX = this.player.prevX + (this.player.targetX - this.player.prevX) * p;
      playerRenderY = this.player.prevY + (this.player.targetY - this.player.prevY) * p;
    }

    let offsetX = 0;
    if (diffX > 0) {
      offsetX = diffX / 2;
    } else {
      const off = (TILES_W / 2) - (playerRenderX + 0.5);
      offsetX = Math.max(diffX, Math.min(0, off));
    }

    let offsetY = 0;
    if (diffY > 0) {
      offsetY = diffY / 2;
    } else {
      const off = (TILES_H / 2) - (playerRenderY + 0.5);
      offsetY = Math.max(diffY, Math.min(0, off));
    }

    return { x: offsetX, y: offsetY };
  }

  render(ctx) {
    if (!this.level) return;

    // Background grass fill
    const bgTile = this.campaign === 'Carrot_Harvest' ? this.sprites.get('grass') : this.sprites.get('ground');
    if (bgTile) {
      for (let gy = 0; gy < TILES_H; gy++) {
        for (let gx = 0; gx < TILES_W; gx++) {
          ctx.drawImage(bgTile, gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    const cam = this.getCameraOffset();
    const startPixelX = Math.round(cam.x * TILE_SIZE);
    const startPixelY = Math.round(cam.y * TILE_SIZE);

    // 1. Draw Map Tiles
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const destX = startPixelX + x * TILE_SIZE;
        const destY = startPixelY + y * TILE_SIZE;

        // Skip tiles outside 256x192 viewport
        if (destX < -TILE_SIZE || destX > BUFFER_W || destY < -TILE_SIZE || destY > BUFFER_H) {
          continue;
        }

        const tileType = this.level.tiles[y][x];

        // Draw ground base under buttons, keys, traps, eggs, holes, end
        if (tileType !== 'Grass' && tileType !== 'Fence') {
          const g = this.sprites.get('ground');
          if (g) ctx.drawImage(g, destX, destY, TILE_SIZE, TILE_SIZE);
        }

        let spriteImg = null;
        if (tileType === 'Grass') {
          spriteImg = this.sprites.getGrassTile(x, y, (tx, ty) => this.getTile(tx, ty));
        } else if (tileType === 'Fence') {
          spriteImg = this.sprites.getFenceTile(x, y, (tx, ty) => this.getTile(tx, ty));
        } else if (tileType === 'End') {
          spriteImg = this.sprites.getEndTile(this.level.canEnd, this.tileAnimFrame);
        } else if (this.isBeltTile(tileType)) {
          spriteImg = this.sprites.getBeltTile(tileType, this.tileAnimFrame);
        } else {
          // Standard tile
          const key = tileType.toLowerCase();
          spriteImg = this.sprites.get(key) || this.sprites.get('ground');
        }

        if (spriteImg) {
          ctx.drawImage(spriteImg, destX, destY, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // 2. Draw Player Bobby
    if (this.player && this.state !== 'LEVEL_COMPLETE') {
      let renderX = this.player.x;
      let renderY = this.player.y;
      if (this.player.isMoving) {
        const p = Math.min(1, this.player.moveProgress);
        renderX = this.player.prevX + (this.player.targetX - this.player.prevX) * p;
        renderY = this.player.prevY + (this.player.targetY - this.player.prevY) * p;
      }

      let playerSprite = null;
      let offsetX = -1;
      let offsetY = -9;

      if (this.state === 'DYING' || this.state === 'DEAD') {
        offsetX = -3;
        offsetY = -11;
        playerSprite = this.sprites.get(`dying_${this.player.dyingFrame + 1}`);
      } else if (this.state === 'FADING') {
        const f = Math.min(9, Math.floor(this.player.fadingTimer / 0.06) + 1);
        playerSprite = this.sprites.get(`fading_${f}`);
      } else if (this.player.isMoving) {
        const walkFrame = (Math.floor(this.player.moveProgress * 8) % 8) + 1;
        const dirStr = this.player.direction.toLowerCase();
        playerSprite = this.sprites.get(`walking_${dirStr}_${walkFrame}`);
      } else {
        // Idle
        playerSprite = this.sprites.get(`idle_${this.idleFrame + 1}`) || this.sprites.get('idle_1');
      }

      if (playerSprite) {
        const px = Math.round(startPixelX + renderX * TILE_SIZE + offsetX);
        const py = Math.round(startPixelY + renderY * TILE_SIZE + offsetY);
        ctx.drawImage(playerSprite, px, py);
      }
    }

    // 3. Draw HUD
    this.renderHUD(ctx);
  }

  renderHUD(ctx) {
    if (!this.level || this.state === 'LEVEL_COMPLETE') return;

    // Time text on top-left
    const totalSeconds = Math.floor(this.level.time);
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    const timeStr = `${mm}:${ss}`;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // HUD numbers background shadow & text
    ctx.font = '8px "Courier New", monospace';
    ctx.fillStyle = '#000000';
    ctx.fillText(timeStr, 4, 11);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(timeStr, 3, 10);

    // Right side: Item icons & counters
    let rightX = BUFFER_W - 4;

    // Keys
    if (this.player.copperKey) {
      const k = this.sprites.get('hud_copper_key');
      if (k) { rightX -= 12; ctx.drawImage(k, rightX, 2); }
    }
    if (this.player.goldenKey) {
      const k = this.sprites.get('hud_golden_key');
      if (k) { rightX -= 12; ctx.drawImage(k, rightX, 2); }
    }
    if (this.player.silverKey) {
      const k = this.sprites.get('hud_silver_key');
      if (k) { rightX -= 12; ctx.drawImage(k, rightX, 2); }
    }

    // Carrots remaining
    if (this.level.carrots > 0) {
      const cIcon = this.sprites.get('hud_carrot');
      const cCount = String(this.level.carrots);
      rightX -= (cCount.length * 6 + 14);
      if (cIcon) ctx.drawImage(cIcon, rightX + cCount.length * 6 + 2, 2);
      ctx.fillStyle = '#000000';
      ctx.fillText(cCount, rightX + 1, 11);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(cCount, rightX, 10);
    }

    // Eggs remaining
    if (this.level.eggs > 0) {
      const eIcon = this.sprites.get('hud_egg');
      const eCount = String(this.level.eggs);
      rightX -= (eCount.length * 6 + 14);
      if (eIcon) ctx.drawImage(eIcon, rightX + eCount.length * 6 + 2, 2);
      ctx.fillStyle = '#000000';
      ctx.fillText(eCount, rightX + 1, 11);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(eCount, rightX, 10);
    }

    // Level Begin Banner: "LEVEL X" for first 2 seconds
    if (this.level.bannerTimer > 0) {
      const bannerText = `LEVEL ${this.levelIndex + 1}`;
      ctx.font = 'bold 12px "Courier New", monospace';
      const tw = ctx.measureText(bannerText).width;
      const bx = Math.round((BUFFER_W - tw) / 2);
      const by = Math.round(BUFFER_H / 2);

      // Semi-transparent backdrop pill
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(bx - 8, by - 14, tw + 16, 20);

      ctx.fillStyle = '#FFD700';
      ctx.fillText(bannerText, bx, by);
    }

    ctx.restore();
  }
}
