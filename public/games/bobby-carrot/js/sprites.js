// Bobby Carrot Remastered - Sprite Manager & Auto-tiler

export const SPRITE_PATHS = {
  // General & Screens
  font: 'assets/font.png',
  logo: 'assets/logo.png',
  intro_splash: 'assets/intro_splash.png',
  end_splash: 'assets/end_splash.png',

  // Tiles
  start: 'assets/tiles/start.png',
  end_1: 'assets/tiles/end_1.png',
  end_2: 'assets/tiles/end_2.png',
  end_3: 'assets/tiles/end_3.png',
  end_4: 'assets/tiles/end_4.png',
  ground: 'assets/tiles/ground.png',
  grass: 'assets/tiles/grass.png',
  grass_right: 'assets/tiles/grass_right.png',
  grass_left: 'assets/tiles/grass_left.png',
  grass_down: 'assets/tiles/grass_down.png',
  grass_up: 'assets/tiles/grass_up.png',
  grass_right_down: 'assets/tiles/grass_right_down.png',
  grass_left_down: 'assets/tiles/grass_left_down.png',
  grass_left_up: 'assets/tiles/grass_left_up.png',
  grass_right_up: 'assets/tiles/grass_right_up.png',
  grass_down_up_right_left: 'assets/tiles/grass_down_up_right_left.png',
  grass_down_up: 'assets/tiles/grass_down_up.png',
  grass_right_left: 'assets/tiles/grass_right_left.png',
  fence_right_left: 'assets/tiles/fence_right_left.png',
  fence_down: 'assets/tiles/fence_down.png',
  fence_right_down: 'assets/tiles/fence_right_down.png',
  fence_left_down: 'assets/tiles/fence_left_down.png',
  fence_right: 'assets/tiles/fence_right.png',
  fence_left: 'assets/tiles/fence_left.png',
  carrot: 'assets/tiles/carrot.png',
  carrot_hole: 'assets/tiles/carrot_hole.png',
  trap: 'assets/tiles/trap.png',
  trap_activated: 'assets/tiles/trap_activated.png',
  red_button: 'assets/tiles/red_button.png',
  red_button_pressed: 'assets/tiles/red_button_pressed.png',
  wall_left_up: 'assets/tiles/wall_left_up.png',
  wall_right_up: 'assets/tiles/wall_right_up.png',
  wall_right_down: 'assets/tiles/wall_right_down.png',
  wall_left_down: 'assets/tiles/wall_left_down.png',
  wall_up_down: 'assets/tiles/wall_up_down.png',
  wall_left_right: 'assets/tiles/wall_left_right.png',
  yellow_button: 'assets/tiles/yellow_button.png',
  yellow_button_pressed: 'assets/tiles/yellow_button_pressed.png',
  belt_left_1: 'assets/tiles/belt_left_1.png',
  belt_left_2: 'assets/tiles/belt_left_2.png',
  belt_left_3: 'assets/tiles/belt_left_3.png',
  belt_left_4: 'assets/tiles/belt_left_4.png',
  belt_right_1: 'assets/tiles/belt_right_1.png',
  belt_right_2: 'assets/tiles/belt_right_2.png',
  belt_right_3: 'assets/tiles/belt_right_3.png',
  belt_right_4: 'assets/tiles/belt_right_4.png',
  belt_up_1: 'assets/tiles/belt_up_1.png',
  belt_up_2: 'assets/tiles/belt_up_2.png',
  belt_up_3: 'assets/tiles/belt_up_3.png',
  belt_up_4: 'assets/tiles/belt_up_4.png',
  belt_down_1: 'assets/tiles/belt_down_1.png',
  belt_down_2: 'assets/tiles/belt_down_2.png',
  belt_down_3: 'assets/tiles/belt_down_3.png',
  belt_down_4: 'assets/tiles/belt_down_4.png',
  copper_key: 'assets/tiles/copper_key.png',
  copper_lock: 'assets/tiles/copper_lock.png',
  silver_key: 'assets/tiles/silver_key.png',
  silver_lock: 'assets/tiles/silver_lock.png',
  golden_key: 'assets/tiles/golden_key.png',
  golden_lock: 'assets/tiles/golden_lock.png',
  egg_spot: 'assets/tiles/egg_spot.png',
  egg: 'assets/tiles/egg.png',

  // HUD
  hud_font: 'assets/hud/font.png',
  hud_carrot: 'assets/hud/carrot.png',
  hud_egg: 'assets/hud/egg.png',
  hud_eyes: 'assets/hud/eyes.png',
  hud_silver_key: 'assets/hud/silver_key.png',
  hud_golden_key: 'assets/hud/golden_key.png',
  hud_copper_key: 'assets/hud/copper_key.png',
  hud_success: 'assets/hud/success.png',
  hud_arrow_right: 'assets/hud/arrow_right.png',
  hud_arrow_up: 'assets/hud/arrow_up.png',

  // Bobby Idle (3 frames)
  idle_1: 'assets/animations/idle_1.png',
  idle_2: 'assets/animations/idle_2.png',
  idle_3: 'assets/animations/idle_3.png',

  // Bobby Walk Down (8 frames)
  walking_down_1: 'assets/animations/walking_down_1.png',
  walking_down_2: 'assets/animations/walking_down_2.png',
  walking_down_3: 'assets/animations/walking_down_3.png',
  walking_down_4: 'assets/animations/walking_down_4.png',
  walking_down_5: 'assets/animations/walking_down_5.png',
  walking_down_6: 'assets/animations/walking_down_6.png',
  walking_down_7: 'assets/animations/walking_down_7.png',
  walking_down_8: 'assets/animations/walking_down_8.png',

  // Bobby Walk Left (8 frames)
  walking_left_1: 'assets/animations/walking_left_1.png',
  walking_left_2: 'assets/animations/walking_left_2.png',
  walking_left_3: 'assets/animations/walking_left_3.png',
  walking_left_4: 'assets/animations/walking_left_4.png',
  walking_left_5: 'assets/animations/walking_left_5.png',
  walking_left_6: 'assets/animations/walking_left_6.png',
  walking_left_7: 'assets/animations/walking_left_7.png',
  walking_left_8: 'assets/animations/walking_left_8.png',

  // Bobby Walk Up (8 frames)
  walking_up_1: 'assets/animations/walking_up_1.png',
  walking_up_2: 'assets/animations/walking_up_2.png',
  walking_up_3: 'assets/animations/walking_up_3.png',
  walking_up_4: 'assets/animations/walking_up_4.png',
  walking_up_5: 'assets/animations/walking_up_5.png',
  walking_up_6: 'assets/animations/walking_up_6.png',
  walking_up_7: 'assets/animations/walking_up_7.png',
  walking_up_8: 'assets/animations/walking_up_8.png',

  // Bobby Walk Right (8 frames)
  walking_right_1: 'assets/animations/walking_right_1.png',
  walking_right_2: 'assets/animations/walking_right_2.png',
  walking_right_3: 'assets/animations/walking_right_3.png',
  walking_right_4: 'assets/animations/walking_right_4.png',
  walking_right_5: 'assets/animations/walking_right_5.png',
  walking_right_6: 'assets/animations/walking_right_6.png',
  walking_right_7: 'assets/animations/walking_right_7.png',
  walking_right_8: 'assets/animations/walking_right_8.png',

  // Bobby Fading Level Exit (9 frames)
  fading_1: 'assets/animations/fading_1.png',
  fading_2: 'assets/animations/fading_2.png',
  fading_3: 'assets/animations/fading_3.png',
  fading_4: 'assets/animations/fading_4.png',
  fading_5: 'assets/animations/fading_5.png',
  fading_6: 'assets/animations/fading_6.png',
  fading_7: 'assets/animations/fading_7.png',
  fading_8: 'assets/animations/fading_8.png',
  fading_9: 'assets/animations/fading_9.png',

  // Bobby Dying (8 frames)
  dying_1: 'assets/animations/dying_1.png',
  dying_2: 'assets/animations/dying_2.png',
  dying_3: 'assets/animations/dying_3.png',
  dying_4: 'assets/animations/dying_4.png',
  dying_5: 'assets/animations/dying_5.png',
  dying_6: 'assets/animations/dying_6.png',
  dying_7: 'assets/animations/dying_7.png',
  dying_8: 'assets/animations/dying_8.png',
};

export class SpriteManager {
  constructor() {
    this.images = {};
    this.loaded = false;
    this.loadProgress = 0;
  }

  async loadAll(onProgress) {
    const keys = Object.keys(SPRITE_PATHS);
    let loadedCount = 0;
    const promises = keys.map((key) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = SPRITE_PATHS[key];
        img.onload = () => {
          this.images[key] = img;
          loadedCount++;
          if (onProgress) onProgress(loadedCount / keys.length);
          resolve();
        };
        img.onerror = (e) => {
          console.error(`Failed to load sprite: ${key} at ${SPRITE_PATHS[key]}`, e);
          // Don't reject entire load if one asset has minor issue
          resolve();
        };
      });
    });

    await Promise.all(promises);
    this.loaded = true;
  }

  get(key) {
    return this.images[key] || null;
  }

  /**
   * Auto-tiler for grass and fences according to surrounding neighbors
   * Exact logic from game.odin
   */
  getGrassTile(x, y, getTile) {
    const left = getTile(x - 1, y) !== 'Grass';
    const right = getTile(x + 1, y) !== 'Grass';
    const up = getTile(x, y - 1) !== 'Grass';
    const down = getTile(x, y + 1) !== 'Grass';

    if (down && up && right && left) return this.get('grass_down_up_right_left');
    if (down && up) return this.get('grass_down_up');
    if (right && left) return this.get('grass_right_left');
    if (right && down) return this.get('grass_right_down');
    if (left && down) return this.get('grass_left_down');
    if (left && up) return this.get('grass_left_up');
    if (right && up) return this.get('grass_right_up');
    if (right) return this.get('grass_right');
    if (left) return this.get('grass_left');
    if (down) return this.get('grass_down');
    if (up) return this.get('grass_up');
    return this.get('grass');
  }

  getFenceTile(x, y, getTile) {
    const left = getTile(x - 1, y) === 'Fence';
    const right = getTile(x + 1, y) === 'Fence';
    const down = getTile(x, y + 1) === 'Fence';

    if (right && left && down) return this.get('fence_right_left');
    if (right && left) return this.get('fence_right_left');
    if (right && down) return this.get('fence_right_down');
    if (left && down) return this.get('fence_left_down');
    if (right) return this.get('fence_right');
    if (left) return this.get('fence_left');
    if (down) return this.get('fence_down');
    return this.get('fence_down');
  }

  getBeltTile(tileName, frame) {
    const f = (frame % 4) + 1;
    switch (tileName) {
      case 'Belt_Right': return this.get(`belt_right_${f}`);
      case 'Belt_Left': return this.get(`belt_left_${f}`);
      case 'Belt_Up': return this.get(`belt_up_${f}`);
      case 'Belt_Down': return this.get(`belt_down_${f}`);
      default: return this.get('ground');
    }
  }

  getEndTile(canEnd, frame) {
    if (!canEnd) return this.get('end_1');
    const f = (frame % 4) + 1;
    return this.get(`end_${f}`);
  }
}
