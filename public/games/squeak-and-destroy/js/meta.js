/* ============================================================================
 * CUTE ANIMALS — meta.js  ::  CA.Meta  (Agent Meta, wave 2 + wave 3 progression)
 * ----------------------------------------------------------------------------
 * Wave 2 (#34/#36/#38/#39/#40): match-stats, XP/level+species-unlock, daily
 * seed, achievements, local leaderboard.  ALL of that is PRESERVED below.
 *
 * Wave 3 (#23-#27) ADDS, without breaking any existing API:
 *   #23 XP & levels + light Battle-Pass/season track:
 *        CA.Meta.addXP(n, reason)  (alias of addXp + reason logging)
 *        CA.Meta.level(), CA.Meta.xp(), CA.Meta.seasonTiers()
 *   #24 Challenges (cross-event progress, grant XP/unlocks on completion):
 *        CA.Meta.challenges() -> [{id,desc,progress,goal,done}]
 *   #25 Stats profile (lifetime + per-match incl. MVP):
 *        CA.Meta.stats(), CA.Meta.matchStats()  (matchStats extended w/ MVP)
 *   #26 Unlockable cosmetics tied to XP/level:
 *        CA.Meta.unlockedCosmetics() -> [cosmeticId,...]
 *   #27 Steam achievements stub:
 *        CA.Meta.achievementsState() -> [{id,name,desc,done}]
 *        CA.Meta._steamUnlock(id)  (no-op now; logs; wired live)
 *
 * Events consumed (CA.events): 'gameStart', 'fired'(unit,weapon),
 *   'explosion'(x,y,r,dmg), 'unitDamaged'(unit,amount), 'unitDied'(unit),
 *   'crit'(unit), 'combo'(count), 'gameOver'(winnerTeamId).
 *
 * Persistence: localStorage key 'ca_meta'.  Everything is defensive: nothing
 * here is allowed to throw into the game loop.
 * ==========================================================================*/
(function(){
  // EN translations for meta-facing text (challenges, achievements, cosmetics,
  // toasts). HU stays the key; screens.js wraps the displayed text with CA.t().
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Baseball sapka':'Baseball Cap','Tripla':'Triple Kill','Nyerj 5 meccset':'Win 5 matches',
    'Nyerj 3 meccset':'Win 3 matches',
    'Vidám szemüveg':'Funny Glasses','Okos szemüveg':'Smart Glasses','Kötés':'Bandage',
    'Fejhallgató':'Headphones','Kalóz bandana':'Pirate Bandana',
    'Mogorva':'Grumpy','Masni':'Bow','Bajusz':'Mustache','Sisak':'Helmet','Taraj':'Mohawk',
    'Ölj meg 3-at egy lövéssel':'Kill 3 with one shot','Nyerj szél ellen':'Win against the wind',
    '10 találat összesen':'10 hits total','Használj 5 különböző fegyvert (1 meccs)':'Use 5 different weapons (1 match)',
    'Érj el 5 kritikus találatot':'Land 5 critical hits',
    'Első vér':'First Blood','Szerezd meg az első kill-edet.':'Get your first kill.',
    '3 ellenfél egyetlen lövéssel.':'3 enemies with a single shot.',
    'Csobbanás':'Splash','Lökj/fojts 8 ellenfelet a vízbe (összesen).':'Knock/drown 8 enemies into the water (total).',
    'Mesterlövész':'Sniper','5 találat 800px-nél messzebbről (összesen).':'Land 5 hits from over 800px away (total).',
    'Túlélő':'Survivor','Nyerj úgy, hogy a teljes csapatod életben van.':'Win with your whole team alive.',
    'Rombolás':'Demolition','Pusztíts el egy hordó-láncot / nagy terepet.':'Set off a barrel chain / big terrain.',
    'Gyűjtögető':'Collector','Arzenál':'Arsenal','Használj 10 különböző fegyvert.':'Use 10 different weapons.',
    'Centurió':'Centurion','Szerezz 100 killt összesen.':'Get 100 kills total.',
    'Éleslövő':'Marksman','Érj el 70% pontosságot (min. 20 lövés).':'Reach 70% accuracy (min. 20 shots).',
    'Veterán':'Veteran','Játssz le 25 meccset.':'Play 25 matches.',
    'Tízes':'Level Ten','Érd el a 10. szintet.':'Reach level 10.',
    'Kihívás kész: ':'Challenge done: ','Új faj feloldva: ':'New species unlocked: ',
    'Új kinézet: ':'New look: ',' elérve!':' reached!','Játékos':'Player',
    'új faj feloldva!':'new species unlocked!','új eredmény!':'new achievements!',
    // --- in-game toast static fragments ---
    'Szint ':'Level ','!':'!',' érme':' coins','láda':'chest','kinézet':'cosmetic',
    'Napi jutalom: +':'Daily reward: +','Kampány jutalom: +':'Campaign reward: +',
    'Helyezés-jutalom: +':'Placement reward: +',
    // --- #3 rotating daily/weekly challenge descriptions ---
    'Érj el 8 találatot':'Land 8 hits','Érj el 3 kritikus találatot':'Land 3 critical hits',
    'Játssz le 2 meccset':'Play 2 matches','Érj el egy 3-as kombót':'Get a 3-combo',
    'Szerezz 30 killt a héten':'Get 30 kills this week','Nyerj 5 meccset a héten':'Win 5 matches this week',
    'Játssz le 12 meccset':'Play 12 matches','Érj el 20 kritikus találatot':'Land 20 critical hits',
    'Érj el 60 találatot':'Land 60 hits',
    // --- achievement names + descriptions ---
    'Nyerj 5 meccset.':'Win 5 matches.','Nyerj 10 meccset.':'Win 10 matches.',
    'Nyerj 25 meccset.':'Win 25 matches.','Szerezz 250 killt.':'Get 250 kills.',
    'Hadúr':'Warlord','Mészáros':'Butcher','Sasszem':'Eagle Eye',
    '85% pontosság (min. 50 lövés).':'85% accuracy (min. 50 shots).',
    'Maratoni':'Marathoner','Játssz le 50 meccset.':'Play 50 matches.',
    'Húszas':'Level Twenty','Érd el a 20. szintet.':'Reach level 20.',
    'Kombó-király':'Combo King','Érj el 4× kombót egy lövésből.':'Get a 4× combo from one shot.',
    'Ezres':'Thousand','Szerezz 1000 killt összesen.':'Get 1000 kills total.',
  });
  // EN strings for the economy / retention layer (shop, battle pass, daily,
  // chests, currency). Keys stay the displayed HU literals; CA.t() resolves them.
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Bolt':'Shop','Csatakártya':'Battle Pass','Napi jutalom':'Daily Reward',
    'Napi pörgetés':'Daily Spin','Napi pörgetés: +':'Daily Spin: +',
    'Ma lepörgött — holnap újra!':'No luck today — come back tomorrow!',
    'Squeak érme':'Squeak Coin','Érme':'Coin','Érmék':'Coins',
    'Vásárlás':'Buy','Megvéve':'Owned','Birtokolt':'Owned','Felszerelve':'Equipped',
    'Nincs elég érme':'Not enough coins','Megvásárolva!':'Purchased!',
    'Napi sorozat':'Daily streak','nap':'day','Begyűjt':'Claim','Begyűjtve':'Claimed',
    'Gyere vissza holnap!':'Come back tomorrow!','Sorozat: ':'Streak: ',
    'Láda nyitva!':'Chest opened!','Ingyen láda':'Free Chest','Érme-láda':'Coin Chest',
    'Kinézetek':'Cosmetics','Ládák':'Chests','Ritkaság':'Rarity',
    'Közönséges':'Common','Ritka':'Rare','Epikus':'Epic','Legendás':'Legendary',
    'Ingyenes sáv':'Free track','Prémium sáv':'Premium track',
    'Szezon vége: ':'Season ends: ','Új szezon!':'New season!',
    'Napi kihívások':'Daily Challenges','Heti kihívások':'Weekly Challenges',
    'Frissül: ':'Resets: ','Szint-jutalom: ':'Level reward: ','Mesterség':'Mastery',
    'Osztály-mesterség':'Class Mastery','Fegyver-mesterség':'Weapon Mastery',
    'Már megvan ez a kinézet — +érme jóváírva':'Already owned — coins refunded',
    'Prémium feloldva':'Premium unlocked','Prémium szükséges':'Premium required',
    'Új érmék: ':'Coins: ','rang':'rank','szint':'tier',
    // 7-day streak milestone bonus (granted live by _grantStreakBonus)
    '🎉 7 napos sorozat! Bónusz láda + ':'🎉 7-day streak! Bonus chest + ',
  });
  // ── PROFILE PERSISTENCE KEYS ───────────────────────────────────────────────
  // PRIMARY profile blob (coins, cosmetics, XP, mastery, skill ranks, season
  // progress, achievements, stats). SHARED by the free/demo AND the FULL build —
  // both read/write this exact key so a demo→full upgrade keeps everything.
  var KEY = 'ca_meta';
  // Legacy / alternate keys an OLDER build may have written. On boot we import the
  // newest non-empty one into KEY IF KEY is empty (idempotent: once KEY exists we
  // never touch them again). Add any historical key here — never remove KEY.
  var LEGACY_KEYS = ['ca_profile', 'cuteanimals_meta', 'squeak_meta'];
  // one-time marker (under KEY blob) recording that the FULL build imported the
  // demo profile, so the "upgrades for free" import + log fires exactly once.
  var FULL_IMPORT_FLAG = '_fullImported';
  // Species unlock order (capybara+worm+koala always available; these by level).
  var UNLOCK_ORDER = ['hedgehog','beaver','frog','bird'];
  var BASE_UNLOCKED = ['capybara','worm','koala'];
  var MAX_TOASTS = 6;
  var MAX_LEADERBOARD = 10;
  var DAY_MS = 86400000;
  var SEASON_LEN_DAYS = 30; // a season lasts 30 days, then resets + new id

  // #26 — cosmetic ids that exist in entities.js COSMETICS, mapped to the level
  // at which they unlock.  (grumpy/silly are "starter" → unlocked at level 1.)
  var COSMETIC_UNLOCKS = [
    { id:'grumpy',     level:1 },
    { id:'silly',      level:1 },
    { id:'glasses',    level:2 },
    { id:'cap',        level:3 },
    { id:'bow',        level:4 },
    { id:'mustache',   level:5 },
    { id:'helmet',     level:6 },
    { id:'mohawk',     level:7 },
    { id:'bandage',    level:8 },
    { id:'headphones', level:9 },
    { id:'pirate',     level:10 }
  ];

  // #23/#4 — the legacy SEASON_TIERS (total-XP cosmetic ledger) is SUPERSEDED by
  // SEASON_PASS (defined below in the economy block). seasonTiers() now derives
  // its old shape from SEASON_PASS for back-compat with any existing reader.

  // #24 — challenge catalog.  progress is tracked in profile.challengeProgress.
  // kind drives which events advance them.  reward = {xp, cosmetic?}.
  var CHALLENGE_DEFS = [
    { id:'multiKill3', desc:'Ölj meg 3-at egy lövéssel',           goal:1,  kind:'combo3',     reward:{ xp:120, cosmetic:'mohawk' } },
    { id:'windWin',    desc:'Nyerj szél ellen',                    goal:1,  kind:'windWin',    reward:{ xp:150 } },
    { id:'tenHits',    desc:'10 találat összesen',                 goal:10, kind:'hit',        reward:{ xp:80 } },
    { id:'fiveWeapons',desc:'Használj 5 különböző fegyvert (1 meccs)', goal:5, kind:'weaponsMatch', reward:{ xp:130, cosmetic:'helmet' } },
    { id:'critMaster', desc:'Érj el 5 kritikus találatot',         goal:5,  kind:'crit',       reward:{ xp:90 } },
    { id:'winThrice',  desc:'Nyerj 3 meccset',                     goal:3,  kind:'win',        reward:{ xp:200, cosmetic:'pirate' } }
  ];

  /* ====================================================================
   * ECONOMY & RETENTION DATA (Squeak Coin / shop / battle pass / daily /
   * chests / level-reward track / campaign rewards / masteries).
   * Cosmetic-only — NO pay-to-win. Coins are earned in matches & daily login.
   * ==================================================================== */

  // #6 — full cosmetic catalog (covers every drawable id in entities.js
  // COSMETICS, minus 'plain' which is the no-op default). price = coins,
  // rarity drives the chest roll weights.
  var COSMETIC_CATALOG = {
    grumpy:     { name:'Mogorva',          price:0,    rarity:'common'    },
    silly:      { name:'Vidám szemüveg',   price:0,    rarity:'common'    },
    glasses:    { name:'Okos szemüveg',    price:150,  rarity:'common'    },
    cap:        { name:'Baseball sapka',   price:250,  rarity:'common'    },
    bow:        { name:'Masni',            price:300,  rarity:'rare'      },
    mustache:   { name:'Bajusz',           price:350,  rarity:'rare'      },
    helmet:     { name:'Sisak',            price:500,  rarity:'rare'      },
    mohawk:     { name:'Taraj',            price:650,  rarity:'epic'      },
    bandage:    { name:'Kötés',            price:500,  rarity:'rare'      },
    headphones: { name:'Fejhallgató',      price:800,  rarity:'epic'      },
    pirate:     { name:'Kalóz bandana',    price:1200, rarity:'legendary' }
  };
  // ── FAIR-MONETIZATION INVARIANT (idea #9) ──────────────────────────────────
  // Squeak Coin is a SOFT, EARN-ONLY currency. It is NEVER purchasable for real
  // money — there is no IAP / store SKU that credits coins, and addCoins() is
  // called ONLY from gameplay rewards (match payout, daily login, challenges,
  // chest dup-refunds, level/season/campaign tracks). The paid build (FULL)
  // unlocks SCOPE (modes/weapons/classes/cosmetic tiers via CA.Entitlement), it
  // does NOT sell coins or power. Keep this true: if you ever add a cash product,
  // it must grant content/scope, never increment profile.coins. Asserted by the
  // grep-guard test in dev and surfaced to players as a transparency badge.
  var COINS_PURCHASABLE_FOR_CASH = false; // MUST stay false — no pay-to-coin path.
  // rarity → chest roll weight (higher = more likely).
  var RARITY_WEIGHT = { common:60, rare:28, epic:10, legendary:4 };
  var RARITY_LABEL  = { common:'Közönséges', rare:'Ritka', epic:'Epikus', legendary:'Legendás' };

  // #7 — chest definitions. 'free' is a timed chest (cooldown); 'coin' costs coins.
  var FREE_CHEST_COOLDOWN = DAY_MS;     // one free chest / day
  var COIN_CHEST_PRICE    = 400;        // a paid roll
  var DUP_REFUND = 100;                 // coins back when a chest rolls a dup

  // #2 — daily login reward table (index = streak-1, capped at last entry).
  // Every 7th day is a chest day. coins escalate then plateau.
  var DAILY_REWARDS = [
    { coins:50  },
    { coins:75  },
    { coins:100 },
    { coins:120 },
    { coins:150 },
    { coins:180 },
    { coins:200, chest:true },   // day 7 — weekly bonus chest
    { coins:250, chest:true }    // day 8+ plateau (still a chest)
  ];

  // ── 7-DAY STREAK MILESTONE BONUS ───────────────────────────────────────────
  // The streak-calendar shows a "🎁 day 7" reward; this is the LIVE grant behind
  // it. Whenever the banked login streak reaches a multiple of 7 (7, 14, 21, …)
  // the player gets a one-off BONUS CHEST + extra coins ON TOP of that day's
  // normal daily/spin payout, then the visual 7-day cycle continues. It is granted
  // EXACTLY ONCE per qualifying streak value via profile.lastStreakBonus (the
  // highest streak already paid) — re-rendering/reloading the same day can never
  // double-grant, and a missed day (streak reset) naturally re-qualifies later.
  // Cosmetic-only: the chest rolls a cosmetic (dup → coin refund) like every chest.
  var STREAK_CYCLE = 7;          // milestone every 7 days
  var STREAK_BONUS_COINS = 150;  // extra coins paid alongside the bonus chest

  // ── REWARDED-AD COIN SOURCE (fair, cosmetic-only) ──────────────────────────
  // Watching a rewarded ad grants a small coin amount. Hard daily cap so it can
  // never be farmed into a coin faucet (NO pay-to-win, NO real-money-for-coins —
  // this is an OPTIONAL, OPT-IN soft-currency drip, not a purchase). Only offered
  // when a portal ad SDK is actually present (CA.Portal.active()); the plain
  // web/PWA build shows no ad button at all.
  var AD_COINS_AMOUNT = 25;        // coins per rewarded ad
  var AD_COINS_MAX_PER_DAY = 5;    // at most 5 ad-coin grants / local day (=125 coins/day cap)

  // ── DAILY FORTUNE WHEEL ("Napi pörgetés") ──────────────────────────────────
  // A REAL prize wheel that replaces the old always-win "Napi jutalom". One spin
  // per local calendar day (idempotent via profile.lastSpin === today). The order
  // of this array IS the order the UI draws the wheel slices, and dailySpin()
  // returns the index INTO this array so the animation lands on the right slice.
  //
  // FAIRNESS / "don't always win big": the wheel is weighted so a real MISS
  // (0 coins) is possible and the high prizes are rare. Weights below; total=100.
  //
  //   idx label              coins  cosmetic  weight   chance
  //   0   Lepörgött 😿       0      –         18       18.0%   (a real miss)
  //   1   +15 érme          15     –         24       24.0%
  //   2   +30 érme          30     –         22       22.0%
  //   3   +60 érme          60     –         16       16.0%
  //   4   +120 érme         120    –         10       10.0%
  //   5   +250 érme (ritka) 250    –          5        5.0%   (rare big coin)
  //   6   🎁 Új kinézet     –      yes        5        5.0%   (rare cosmetic, rolled
  //                                                            via _rollCosmeticId)
  //   total weight = 100
  //   Expected coins ≈ 0*.18 + 15*.24 + 30*.22 + 60*.16 + 120*.10 + 250*.05
  //                  = 0 + 3.6 + 6.6 + 9.6 + 12.0 + 12.5 = 44.3 coins / spin
  //   (+ a ~5% shot at a cosmetic). Modest EV, well below the old flat 50-250
  //   guaranteed daily — so it FEELS like a gamble, not a handout.
  var SPIN_SEGMENTS = [
    { coins:0,   label:'Lepörgött 😿',     weight:18, miss:true },
    { coins:15,  label:'+15 érme',         weight:24 },
    { coins:30,  label:'+30 érme',         weight:22 },
    { coins:60,  label:'+60 érme',         weight:16 },
    { coins:120, label:'+120 érme',        weight:10 },
    { coins:250, label:'+250 érme',        weight:5,  rare:true },
    { cosmetic:true, coins:0, label:'🎁 Új kinézet', weight:5, rare:true }
  ];

  // #5 — account-level reward track: level -> reward granted in the level-up
  // loop. Species unlocks (lvl 2-5) STILL happen via UNLOCK_ORDER; this adds
  // coins / cosmetics / chests on top so every level feels rewarding.
  var LEVEL_REWARDS = {
    2:  { coins:100 },
    3:  { coins:120 },
    4:  { coins:140 },
    5:  { coins:160, cosmetic:'glasses' },
    6:  { coins:180 },
    7:  { coins:200, chest:true },
    8:  { coins:220 },
    9:  { coins:250 },
    10: { coins:400, cosmetic:'cap' },
    12: { coins:300 },
    15: { coins:500, chest:true },
    20: { coins:1000, cosmetic:'pirate' }
  };

  // #4 — battle-pass tier rewards. Each tier reached at a season-XP threshold;
  // FREE lane is claimable by everyone, PREMIUM lane needs profile.seasonPremium.
  // (Premium is unlockable with coins — cosmetic-only, NOT real money / no P2W.)
  var SEASON_NAME = 'Season 1 — Capybara Spring';
  var SEASON_PREMIUM_PRICE = 2000; // coins to unlock the premium lane this season
  var SEASON_PASS = [
    { tier:1,  xp:0,    free:{ coins:50  }, premium:{ cosmetic:'silly'      } },
    { tier:2,  xp:100,  free:{ coins:75  }, premium:{ coins:150            } },
    { tier:3,  xp:400,  free:{ coins:100 }, premium:{ cosmetic:'glasses'   } },
    { tier:4,  xp:900,  free:{ chest:true}, premium:{ cosmetic:'cap'       } },
    { tier:5,  xp:1600, free:{ coins:120 }, premium:{ cosmetic:'bow'       } },
    { tier:6,  xp:2500, free:{ coins:140 }, premium:{ cosmetic:'mustache'  } },
    { tier:7,  xp:3600, free:{ chest:true}, premium:{ cosmetic:'helmet'    } },
    { tier:8,  xp:4900, free:{ coins:160 }, premium:{ cosmetic:'mohawk'    } },
    { tier:9,  xp:6400, free:{ coins:180 }, premium:{ cosmetic:'bandage'   } },
    { tier:10, xp:8100, free:{ chest:true}, premium:{ cosmetic:'headphones'} },
    { tier:11, xp:9000, free:{ coins:200 }, premium:{ cosmetic:'pirate'    } }
  ];

  // #3 — ROTATING challenge pool (larger than the daily/weekly subset shown).
  // Reuses the kinds the _challengeAdvance plumbing already understands plus a
  // couple new ones wired below (kill/playMatch). reward = {coins, xp, cosmetic?}.
  var DAILY_POOL = [
    { id:'d_hits',    desc:'Érj el 8 találatot',          goal:8,  kind:'hit',    reward:{ coins:80,  xp:40 } },
    { id:'d_kills',   desc:'Szerezz 5 killt',             goal:5,  kind:'kill',   reward:{ coins:90,  xp:50 } },
    { id:'d_crit',    desc:'Érj el 3 kritikus találatot', goal:3,  kind:'crit',   reward:{ coins:80,  xp:40 } },
    { id:'d_win',     desc:'Nyerj 1 meccset',             goal:1,  kind:'win',    reward:{ coins:120, xp:60 } },
    { id:'d_play',    desc:'Játssz le 2 meccset',         goal:2,  kind:'playMatch', reward:{ coins:70, xp:35 } },
    { id:'d_combo',   desc:'Érj el egy 3-as kombót',      goal:1,  kind:'combo3', reward:{ coins:100, xp:50 } }
  ];
  var WEEKLY_POOL = [
    { id:'w_kills',   desc:'Szerezz 30 killt a héten',    goal:30, kind:'kill',      reward:{ coins:400, xp:200 } },
    { id:'w_wins',    desc:'Nyerj 5 meccset a héten',     goal:5,  kind:'win',       reward:{ coins:500, xp:250, cosmetic:'helmet' } },
    { id:'w_play',    desc:'Játssz le 12 meccset',        goal:12, kind:'playMatch', reward:{ coins:350, xp:180 } },
    { id:'w_crit',    desc:'Érj el 20 kritikus találatot',goal:20, kind:'crit',      reward:{ coins:400, xp:200 } },
    { id:'w_hits',    desc:'Érj el 60 találatot',         goal:60, kind:'hit',       reward:{ coins:300, xp:150 } }
  ];
  var DAILY_COUNT = 3, WEEKLY_COUNT = 2;

  // #9 — weapon mastery tiers from the lifetime weaponUse{} tally.
  var WEAPON_MASTERY_TIERS = [0, 10, 30, 75, 150, 300]; // use-count thresholds

  // ── ACHIEVEMENT COIN REWARDS ───────────────────────────────────────────────
  // Each achievement, when unlocked the FIRST time, pays a modest one-off coin
  // reward by difficulty tier. The grant happens in _tryUnlock(), which is already
  // idempotent (it early-returns if profile.achievements[id] is set) so an
  // achievement can NEVER pay twice. Amounts are deliberately small (well under a
  // single match payout × a few) to stay non-inflationary — they are a "nice to
  // see" nudge, not a coin faucet.
  //   tier1 (easy/early)      = 50  coins
  //   tier2 (mid)             = 100 coins
  //   tier3 (hard/grindy)     = 150 coins
  var ACH_REWARD = { tier1:50, tier2:100, tier3:150 };
  // id -> tier. Anything not listed defaults to tier1 (50).
  var ACH_TIER = {
    firstBlood:'tier1', tripleKill:'tier1', splashdown:'tier1', sharpshooter:'tier1',
    survivor:'tier1', demolition:'tier1', collector:'tier1',
    arsenal:'tier2', centurion:'tier2', marksman:'tier2', veteran:'tier2',
    levelTen:'tier2', warlord:'tier2', champion:'tier2', comboKing:'tier2',
    butcher:'tier3', eagleEye:'tier3', marathoner:'tier3', level20:'tier3', thousand:'tier3'
  };
  // coins paid for unlocking achievement `id` (tier1 fallback).
  function achReward(id){
    var t = ACH_TIER[id] || 'tier1';
    return ACH_REWARD[t] || ACH_REWARD.tier1;
  }

  // ── LEADERBOARD PLACEMENT REWARD (abuse-resistant, one-shot per threshold) ──
  // The first time the LOCAL player breaks into a placement threshold on the
  // LOCAL leaderboard (the only ranking the client can authoritatively read),
  // they get a modest one-off coin bonus. profile.leaderboardClaimed holds the
  // thresholds already paid, so it can NEVER be farmed by replaying — each
  // threshold pays exactly once, ever. Server-authoritative global rewards would
  // need a backend grant; this is the conservative client-local stand-in.
  //   top10 → 100 coins (first time you ever place in the local top 10)
  //   top3  → 250 coins (first time you ever place in the local top 3)
  //   top1  → 500 coins (first time you ever hold the local #1)
  var LEADERBOARD_REWARDS = [
    { id:'top1',  rank:1,  coins:500 },
    { id:'top3',  rank:3,  coins:250 },
    { id:'top10', rank:10, coins:100 }
  ];

  // deterministic pseudo-random pick of `count` defs from `pool`, driven by a
  // numeric seed (so all clients show the SAME daily/weekly set for the period).
  function seededSubset(pool, count, seed){
    var arr = pool.slice(), out = [], s = (seed|0) || 1;
    function rnd(){ s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
    count = Math.min(count, arr.length);
    for (var i=0;i<count;i++){
      var idx = Math.floor(rnd() * arr.length);
      out.push(arr.splice(idx,1)[0]);
    }
    return out;
  }

  // profile schema version. Bump when the shape changes meaningfully. _mergeLoaded
  // PRESERVES unknown keys from the loaded blob so an OLDER build can't truncate
  // fields a NEWER build wrote on the SHARED cloud profile (forward-compat).
  var PROFILE_VERSION = 1;

  function defaultProfile(){
    return {
      version: PROFILE_VERSION, // schema version (see PROFILE_VERSION)
      coins: 0,                 // #1 Squeak Coin soft currency
      lastLogin: 0,             // #2 last daily-claim/spin day-number (ms-day)
      streak: 0,                // #2 consecutive-day streak
      lastSpin: 0,              // DAILY WHEEL — day-number of the last spin (idempotency)
      lastSpinResult: null,     // DAILY WHEEL — last awarded segment {index,coins,cosmetic,label,...}
      lastStreakBonus: 0,       // 7-DAY MILESTONE — highest streak value the day-7 bonus was paid for (idempotent guard)
      adRespinDay: 0,           // REWARDED AD — day-number of the last ad-granted daily re-spin (max 1/day)
      adCoinsDay: 0,            // REWARDED AD — day-number bucket for the daily ad-for-coins cap
      adCoinsCount: 0,          // REWARDED AD — ad-for-coins grants used in the current adCoinsDay bucket
      lastChest: 0,             // #7 last free-chest timestamp (ms)
      campaignStars: {},        // CONTRACT level -> best stars (0..3)
      campaignRewarded: {},     // CONTRACT level -> highest star tier already paid
      dailyChallenges: {},      // #3 { resetAt, ids:[], progress:{id:{progress,done}} }
      weeklyChallenges: {},     // #3 same shape, weekly window
      seasonId: 0,              // #4 current season number
      seasonEnd: 0,             // #4 season end timestamp (ms)
      seasonXP: 0,              // #4 XP earned THIS season (resets each season)
      seasonClaimed: [],        // #4 ['free:1','prem:3', ...] claimed pass rewards
      seasonPremium: false,     // #4 premium lane unlocked this season
      xp: 0,
      level: 1,
      unlocked: BASE_UNLOCKED.slice(),
      achievements: {},
      leaderboard: [],
      leaderboardClaimed: [], // placement-reward thresholds already paid (one-shot each)
      stats: {
        games:0, wins:0, kills:0, deaths:0, shots:0, hits:0,
        bestStreak:0, bestCombo:0, wavesSurvived:0,
        // kumulatív, ÉLETHOSSZIG számlált feat-ek — hogy NE pattanjon 8-10
        // achievement az ELSŐ meccsen (Jani: "ez sok, emeljünk rajta")
        waterKills:0,     // #splashdown: fojts/lökj vízbe N ellenfelet összesen
        longHits:0,       // #sharpshooter: N távoli (>800px) találat összesen
        weaponUse:{}      // weaponId -> lifetime use count (for favorite weapon)
      },
      weaponsEverUsed: {},      // for #arsenal — set of weaponIds across all matches
      challengeProgress: {},    // challengeId -> { progress, done }
      cosmetics: [],            // explicitly-unlocked cosmetic ids (#26)
      // ---- v4 PER-CLASS progression (necro/guardian/mage/hunter/engineer/healer) ----
      classXP: {},              // classId -> accumulated class XP
      skillRanks: {},           // classId -> { nodeId -> rank(0..node.max) }
      // ---- v4.10 PER-TEAM / PER-ANIMAL progression (the skill tree now belongs
      //      to a TEAM and the animals within it). teamSkills[tid][uid] =
      //      { xp, ranks:{nodeId:rank} }. The animal's CLASS still defines which
      //      tree it spends on (CA.Classes[cls].tree). Per-class above stays as a
      //      backward-compatible fallback for units with no tid/uid. ----
      teamSkills: {}
    };
  }

  // v4 — class level curve: level = floor(sqrt(xp/CLASS_XP_DIV)) + 1.
  var CLASS_XP_DIV = 80;
  // accept any non-empty string id; the class registry may not be loaded yet
  // (classes.js is a separate module), so we can't hard-validate against it.
  function validClassId(id){ return typeof id === 'string' && id.length > 0; }

  function freshMatch(){
    return {
      kills: {},            // teamId -> kill count this match
      shots: 0,             // shots fired this match
      hits: 0,              // damaging hits this match
      byTeam: {},           // teamId -> shots fired this match
      weaponsUsed: {},      // weaponId -> true (this match)
      lastShot: null,       // {teamId, unitId, x, y, weaponId, t}
      lastBlast: null,      // {x, y, r, dmg, t}
      killsThisShot: 0,     // kills attributed since the last 'fired' (tripleKill)
      startWaterDeaths: 0,  // drown deaths recorded this match
      barrelChain: 0,       // biggest single-blast destruction proxy (demolition)
      humanTeamFullAlive: false,
      crits: 0,             // crit hits this match
      bestCombo: 0,         // biggest combo this match
      deaths: 0,            // total deaths this match
      wavesSurvived: 0,     // for survival modes
      // per-unit attribution for MVP (#25): unitId -> {kills, damage, teamId}
      perUnit: {},
      // per-team damage for MVP fallback
      teamDamage: {},
      // v4 — classIds that scored a hit/kill this match (match-end bonus XP)
      classesPlayed: {}
    };
  }

  CA.Meta = {
    profile: defaultProfile(),
    toasts: [],
    _match: freshMatch(),
    _subscribed: false,

    // --- exposed static catalogs (read by UI) ---
    seasonName: SEASON_NAME,
    // #6 CONTRACT — cosmetic catalog (id -> {name, price, rarity}).
    COSMETIC_CATALOG: COSMETIC_CATALOG,
    RARITY_LABEL: RARITY_LABEL,
    // CONTRACT — fair-monetization flag the store/credits screen can read to render
    // the "Squeak Coin can never be bought with real money" badge (idea #9). Const,
    // always false; coins are earn-only (see COINS_PURCHASABLE_FOR_CASH above).
    COINS_PURCHASABLE_FOR_CASH: COINS_PURCHASABLE_FOR_CASH,
    coinsArePurchasable(){ return COINS_PURCHASABLE_FOR_CASH; }, // always false
    COIN_CHEST_PRICE: COIN_CHEST_PRICE,
    FREE_CHEST_COOLDOWN: FREE_CHEST_COOLDOWN,
    SEASON_PREMIUM_PRICE: SEASON_PREMIUM_PRICE,

    /* ---- Achievement catalog (#39/#27) -----------------------------------
     * UI (screens.js) reads this AS AN ARRAY of {id,name,desc}; unlock state
     * lives in profile.achievements[id].  We KEEP it an array for back-compat
     * and ALSO expose achievementsState() (#27) returning {id,name,desc,done}.
     * `test(state)` lets check() unlock stat-driven ones generically. */
    achievements: [
      { id:'firstBlood',   name:'Első vér',      desc:'Szerezd meg az első kill-edet.' },
      { id:'tripleKill',   name:'Tripla',        desc:'3 ellenfél egyetlen lövéssel.' },
      { id:'splashdown',   name:'Csobbanás',     desc:'Lökj/fojts 8 ellenfelet a vízbe (összesen).' },
      { id:'sharpshooter', name:'Mesterlövész',  desc:'5 találat 800px-nél messzebbről (összesen).' },
      { id:'survivor',     name:'Túlélő',        desc:'Nyerj úgy, hogy a teljes csapatod életben van.' },
      { id:'demolition',   name:'Rombolás',      desc:'Pusztíts el egy hordó-láncot / nagy terepet.' },
      { id:'collector',    name:'Gyűjtögető',    desc:'Nyerj 5 meccset.', test:function(s){ return (s.wins||0) >= 5; } },
      { id:'arsenal',      name:'Arzenál',       desc:'Használj 10 különböző fegyvert.' },
      { id:'centurion',    name:'Centurió',      desc:'Szerezz 100 killt összesen.', test:function(s){ return (s.kills||0) >= 100; } },
      { id:'marksman',     name:'Éleslövő',      desc:'Érj el 70% pontosságot (min. 20 lövés).', test:function(s){ return (s.shots||0) >= 20 && (s.hits||0)/(s.shots||1) >= 0.7; } },
      { id:'veteran',      name:'Veterán',       desc:'Játssz le 25 meccset.', test:function(s){ return (s.games||0) >= 25; } },
      { id:'levelTen',     name:'Tízes',         desc:'Érd el a 10. szintet.', test:function(s,p){ return (p && p.level||1) >= 10; } },
      { id:'warlord',      name:'Hadúr',         desc:'Nyerj 10 meccset.', test:function(s){ return (s.wins||0) >= 10; } },
      { id:'butcher',      name:'Mészáros',      desc:'Szerezz 250 killt.', test:function(s){ return (s.kills||0) >= 250; } },
      { id:'champion',     name:'Bajnok',        desc:'Nyerj 25 meccset.', test:function(s){ return (s.wins||0) >= 25; } },
      { id:'eagleEye',     name:'Sasszem',       desc:'85% pontosság (min. 50 lövés).', test:function(s){ return (s.shots||0) >= 50 && (s.hits||0)/(s.shots||1) >= 0.85; } },
      { id:'marathoner',   name:'Maratoni',      desc:'Játssz le 50 meccset.', test:function(s){ return (s.games||0) >= 50; } },
      { id:'level20',      name:'Húszas',        desc:'Érd el a 20. szintet.', test:function(s,p){ return (p && p.level||1) >= 20; } },
      { id:'comboKing',    name:'Kombó-király',  desc:'Érj el 4× kombót egy lövésből.', test:function(s){ return (s.bestCombo||s.combo||0) >= 4; } },
      { id:'thousand',     name:'Ezres',         desc:'Szerezz 1000 killt összesen.', test:function(s){ return (s.kills||0) >= 1000; } }
    ],

    /* ---- Lifecycle -------------------------------------------------------- */
    init(){
      this.profile = defaultProfile();
      // demo→full carryover: if KEY is empty but an older build wrote an alternate
      // key, copy it into KEY first (idempotent — does nothing once KEY exists).
      this._migrateLegacyKey();
      try {
        var raw = localStorage.getItem(KEY);
        if (raw){
          var p = JSON.parse(raw);
          if (p && typeof p === 'object'){
            this.profile = this._mergeLoaded(p);
            // ensure nested stats objects exist (older saves)
            if (!this.profile.stats.weaponUse || typeof this.profile.stats.weaponUse !== 'object'){
              this.profile.stats.weaponUse = {};
            }
          }
        }
      } catch(e){}
      // base species always present
      for (var i=0;i<BASE_UNLOCKED.length;i++){
        if (this.profile.unlocked.indexOf(BASE_UNLOCKED[i]) < 0) this.profile.unlocked.push(BASE_UNLOCKED[i]);
      }
      // re-derive level from xp (stable shape even if a save was tampered with)
      this.profile.level = this.levelFor(this.profile.xp);
      // re-sync cosmetic unlocks to the current level
      this._syncCosmetics(true);
      // SILENT achievement reconcile (no toast/coin storm): a loaded high-stat
      // profile already EARNED its threshold achievements — mark them done now so
      // the next check() doesn't re-unlock 20 at once on a new device / after an
      // update that ADDS achievements a veteran already qualifies for.
      this._reconcileAchievements();
      // economy / retention: roll season + daily/weekly challenge windows if due
      this._ensureSeason();
      this._ensureChallenges();
      this._match = freshMatch();
      this._subscribe();
      // demo→full: if this is the paid build and we haven't recorded the import
      // yet, stamp it once (the profile was already loaded above from the SHARED
      // KEY, so nothing needs moving — this just logs/marks the carryover).
      this._stampFullImport();
      // persist any window rolls done above
      this.save();
      return this;
    },

    /* ---- Demo→Full carryover (idea #4) -----------------------------------
     * The free/demo and FULL builds share the SAME localStorage key (`ca_meta`),
     * so on a demo→full upgrade the profile (coins, cosmetics, XP, mastery, skill
     * ranks, season progress) is read as-is — nothing is lost. These two helpers
     * harden that: (a) import an OLDER build's alternate key into `ca_meta` if it
     * was renamed between builds; (b) stamp a one-time marker the first time the
     * FULL build boots. Both are idempotent and never throw. ------------------*/
    // copy the newest legacy/alternate profile key into KEY, but ONLY if KEY is
    // empty (so a real ca_meta is never overwritten). Returns true if it imported.
    _migrateLegacyKey(){
      try {
        if (localStorage.getItem(KEY)) return false;          // KEY already present -> nothing to do
        for (var i=0;i<LEGACY_KEYS.length;i++){
          var lk = LEGACY_KEYS[i];
          if (lk === KEY) continue;
          var raw = null;
          try { raw = localStorage.getItem(lk); } catch(e){ raw = null; }
          if (!raw) continue;
          // validate it parses to an object before adopting it as our profile blob
          var ok = false;
          try { var p = JSON.parse(raw); ok = !!(p && typeof p === 'object'); } catch(e){ ok = false; }
          if (!ok) continue;
          try { localStorage.setItem(KEY, raw); } catch(e){ return false; }
          if (CA.DEBUG){ try { console.log('[Meta] migrated legacy profile key', lk, '→', KEY); } catch(e){} }
          return true;
        }
      } catch(e){}
      return false;
    },
    // true once the FULL build has recorded the demo→full carryover (separate key
    // so it survives the sanitizing _mergeLoaded reload). Idempotent.
    fullImported(){
      try { return localStorage.getItem(KEY + FULL_IMPORT_FLAG) === '1'; } catch(e){ return false; }
    },
    // detect whether THIS build is the paid/full one (best-effort; entitlement.js
    // may not have resolved yet, so we re-check lazily and never throw).
    isFullBuild(){
      try { return !!(CA.Entitlement && CA.Entitlement.isFull && CA.Entitlement.isFull()); }
      catch(e){ return false; }
    },
    // first FULL-build boot: stamp the one-time marker + log. The profile itself
    // is already loaded from the shared KEY, so there is nothing to move; this is
    // the audit point the "your demo save upgraded for free" notice can hook.
    _stampFullImport(){
      try {
        if (!this.isFullBuild()) return false;   // demo build -> never stamp
        if (this.fullImported()) return false;   // already done -> idempotent
        try { localStorage.setItem(KEY + FULL_IMPORT_FLAG, '1'); } catch(e){ return false; }
        if (CA.DEBUG){ try { console.log('[Meta] full build: demo profile carried over (ca_meta)'); } catch(e){} }
        try { if (CA.events) CA.events.emit('metaFullImported', this.profile); } catch(e){}
        return true;
      } catch(e){ return false; }
    },

    save(){
      var json;
      try { json = JSON.stringify(this.profile); }
      catch(e){ /* couldn't even serialize — give up silently, never throw */ }
      if (json != null){
        try {
          localStorage.setItem(KEY, json);
        } catch(e){
          // On a quota error, free space by dropping clearly NON-PROGRESS keys
          // (transient coach flag + stale legacy/duplicate profile blobs that are
          // never read again once KEY exists), then RETRY the save exactly once.
          this._freeQuota();
          try {
            localStorage.setItem(KEY, json);
          } catch(e2){
            try { console.warn('[Meta] save failed: localStorage quota exceeded (progress kept in memory).'); } catch(e3){}
          }
        }
      }
      // when signed in, mirror the profile to the cloud (debounced in account.js)
      try { if (CA.Account && CA.Account.schedulePush) CA.Account.schedulePush(); } catch(e){}
    },

    // best-effort eviction of NON-PROGRESS localStorage keys to make room for the
    // profile blob on a QuotaExceededError. NEVER removes ca_meta (KEY) or any
    // progress/preference key — only the transient coach flag + legacy duplicate
    // profile blobs (which are dead once KEY exists; see _migrateLegacyKey).
    _freeQuota(){
      var drop = ['ca_seen_coach'];
      for (var i=0;i<LEGACY_KEYS.length;i++){ if (LEGACY_KEYS[i] !== KEY) drop.push(LEGACY_KEYS[i]); }
      for (var j=0;j<drop.length;j++){
        try { localStorage.removeItem(drop[j]); } catch(e){}
      }
    },

    /* ---- cloud sync (account.js ↔ account.php) ---- */
    exportProfile(){ return this.profile; },
    // wipe to a fresh profile (used on login to a NEW account / on logout) so an
    // account never inherits another session's (or anonymous) progress.
    resetProfile(){
      this.profile = defaultProfile();
      for (var i=0;i<BASE_UNLOCKED.length;i++){ if (this.profile.unlocked.indexOf(BASE_UNLOCKED[i])<0) this.profile.unlocked.push(BASE_UNLOCKED[i]); }
      this.profile.level = this.levelFor(this.profile.xp);
      this._syncCosmetics && this._syncCosmetics(true);
      try { localStorage.setItem(KEY, JSON.stringify(this.profile)); } catch(e){}
      if (CA.events) CA.events.emit('metaImported', this.profile);
    },
    importCloudProfile(p){
      if (!p || typeof p !== 'object') return;
      try {
        this.profile = this._mergeLoaded(p);
        if (!this.profile.stats.weaponUse || typeof this.profile.stats.weaponUse !== 'object') this.profile.stats.weaponUse = {};
        for (var i=0;i<BASE_UNLOCKED.length;i++){ if (this.profile.unlocked.indexOf(BASE_UNLOCKED[i]) < 0) this.profile.unlocked.push(BASE_UNLOCKED[i]); }
        this.profile.level = this.levelFor(this.profile.xp);
        this._syncCosmetics(true);
        // silently flag already-earned achievements so adopting a high-stat cloud
        // profile on a new device doesn't trigger a toast-storm of old unlocks.
        this._reconcileAchievements();
        try { localStorage.setItem(KEY, JSON.stringify(this.profile)); } catch(e){}
        if (CA.events) CA.events.emit('metaImported', this.profile);
      } catch(e){}
    },

    // Merge a persisted/cloud profile object onto a fresh default, sanitizing
    // every field (never trust storage). Used by init() and importCloudProfile()
    // so both paths load the SAME (incl. economy) fields identically.
    _mergeLoaded(p){
      var d = defaultProfile();
      function num(v, def){ return (typeof v === 'number' && isFinite(v)) ? v : def; }
      function obj(v){ return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
      // FORWARD-COMPAT: carry over any UNKNOWN keys from the loaded blob FIRST, then
      // overwrite with the known, sanitized fields below. This stops an OLDER build
      // from truncating fields a NEWER build wrote on the SHARED cloud profile.
      // (Only top-level keys absent from a fresh default are preserved verbatim.)
      var unknown = {};
      try {
        if (p && typeof p === 'object'){
          for (var uk in p){
            if (!p.hasOwnProperty(uk)) continue;
            if (!d.hasOwnProperty(uk)) unknown[uk] = p[uk];   // not a field we manage
          }
        }
      } catch(e){ unknown = {}; }
      var known = {
        version:      Math.max(1, Math.floor(num(p.version, d.version))),
        // --- economy & retention ---
        coins:        Math.max(0, Math.floor(num(p.coins, d.coins))),
        lastLogin:    num(p.lastLogin, d.lastLogin),
        streak:       Math.max(0, Math.floor(num(p.streak, d.streak))),
        lastSpin:     num(p.lastSpin, d.lastSpin),
        lastSpinResult: (p.lastSpinResult && typeof p.lastSpinResult === 'object') ? p.lastSpinResult : null,
        lastStreakBonus: Math.max(0, Math.floor(num(p.lastStreakBonus, d.lastStreakBonus))),
        adRespinDay:  num(p.adRespinDay, d.adRespinDay),
        adCoinsDay:   num(p.adCoinsDay, d.adCoinsDay),
        adCoinsCount: Math.max(0, Math.floor(num(p.adCoinsCount, d.adCoinsCount))),
        lastChest:    num(p.lastChest, d.lastChest),
        campaignStars:    obj(p.campaignStars),
        campaignRewarded: obj(p.campaignRewarded),
        dailyChallenges:  obj(p.dailyChallenges),
        weeklyChallenges: obj(p.weeklyChallenges),
        seasonId:     num(p.seasonId, d.seasonId),
        seasonEnd:    num(p.seasonEnd, d.seasonEnd),
        seasonXP:     Math.max(0, num(p.seasonXP, d.seasonXP)),
        seasonClaimed: Array.isArray(p.seasonClaimed) ? p.seasonClaimed.slice() : [],
        seasonPremium: !!p.seasonPremium,
        // --- progression (legacy, preserved) ---
        xp:           num(p.xp, d.xp),
        level:        num(p.level, d.level),
        unlocked:     Array.isArray(p.unlocked) ? p.unlocked.slice() : d.unlocked,
        achievements: obj(p.achievements),
        leaderboard:  Array.isArray(p.leaderboard) ? p.leaderboard.slice(0, MAX_LEADERBOARD) : d.leaderboard,
        leaderboardClaimed: Array.isArray(p.leaderboardClaimed) ? p.leaderboardClaimed.slice() : [],
        stats:        Object.assign({}, d.stats, obj(p.stats)),
        weaponsEverUsed:   obj(p.weaponsEverUsed),
        challengeProgress: obj(p.challengeProgress),
        cosmetics:    Array.isArray(p.cosmetics) ? p.cosmetics.slice() : [],
        classXP:      this._sanitizeClassXP(p.classXP),
        skillRanks:   this._sanitizeSkillRanks(p.skillRanks),
        teamSkills:   this._sanitizeTeamSkills(p.teamSkills)
      };
      // unknown (newer-build) keys underneath, sanitized known fields on top.
      return Object.assign(unknown, known);
    },
    // throttled save for hot-path event updates (avoid hammering localStorage)
    _saveSoon(){
      var self = this;
      if (this._saveTimer) return;
      try {
        this._saveTimer = setTimeout(function(){ self._saveTimer = null; self.save(); }, 400);
      } catch(e){ this.save(); }
    },

    /* ---- Event wiring ----------------------------------------------------- */
    _subscribe(){
      if (this._subscribed) return;
      this._subscribed = true;
      var self = this;
      var safe = function(fn){ return function(){ try { fn.apply(self, arguments); } catch(e){} }; };
      CA.events.on('gameStart',   safe(function(){ this._onGameStart(); }));
      CA.events.on('fired',       safe(function(unit, weapon){ this._onFired(unit, weapon); }));
      CA.events.on('explosion',   safe(function(x,y,r,dmg){ this._onExplosion(x,y,r,dmg); }));
      CA.events.on('unitDamaged', safe(function(unit, amount){ this._onUnitDamaged(unit, amount); }));
      CA.events.on('unitDied',    safe(function(unit){ this._onUnitDied(unit); }));
      CA.events.on('crit',        safe(function(unit){ this._onCrit(unit); }));
      CA.events.on('combo',       safe(function(count){ this._onCombo(count); }));
      CA.events.on('gameOver',    safe(function(winnerTeamId){ this._onGameOver(winnerTeamId); }));
      // demo→full: entitlement may resolve AFTER Meta.init() (it boots from the
      // DOMContentLoaded handler), so re-stamp the carryover when it flips to full.
      CA.events.on('entitlementChanged', safe(function(){ this._stampFullImport(); }));
    },

    _onGameStart(){
      this._match = freshMatch();
    },

    _onFired(unit, weapon){
      var m = this._match;
      m.shots++;
      m.killsThisShot = 0; // reset per-shot kill counter for tripleKill detection
      var wid = (weapon && weapon.id) || CA.state.selectedWeapon || (CA.state && CA.state.weapon && CA.state.weapon.id) || null;
      if (wid){
        m.weaponsUsed[wid] = true;
        this.profile.weaponsEverUsed[wid] = true;
        // lifetime weapon-use tally for "favorite weapon"
        var wu = this.profile.stats.weaponUse || (this.profile.stats.weaponUse = {});
        wu[wid] = (wu[wid] || 0) + 1;
        // #24 challenge: 5 distinct weapons in one match
        this._challengeWeaponsMatch();
      }
      if (unit){
        m.byTeam[unit.teamId] = (m.byTeam[unit.teamId] || 0) + 1;
        m.lastShot = { teamId: unit.teamId, unitId: unit.id, x: unit.x, y: unit.y, weaponId: wid, t: (CA.state.frame||0) };
        this._perUnit(unit.id, unit.teamId); // ensure shooter tracked
      } else {
        m.lastShot = { teamId: null, unitId: null, x: 0, y: 0, weaponId: wid, t: (CA.state.frame||0) };
      }
    },

    _onExplosion(x, y, r, dmg){
      var m = this._match;
      m.lastBlast = { x:x, y:y, r:r, dmg:dmg, t:(CA.state.frame||0) };
      if (r >= 70) m.barrelChain = Math.max(m.barrelChain, r);
      var s = m.lastShot;
      if (s && s.teamId != null && isFinite(s.x)){
        var d = Math.hypot(x - s.x, y - s.y);
        // egy lövésből több blast (cluster) is jöhet → lövésenként EGYSZER számít.
        if (d > 800 && !s._longCounted){
          s._longCounted = true;
          this.profile.stats.longHits = (this.profile.stats.longHits || 0) + 1;
          if (this.profile.stats.longHits >= 5) this._tryUnlock('sharpshooter');
        }
      }
    },

    _onUnitDamaged(unit, amount){
      var m = this._match;
      amount = (typeof amount === 'number' && isFinite(amount)) ? amount : 0;
      // a damaging blast counts as a "hit" for stats/challenges/accuracy
      m.hits++;
      this.profile.stats.hits = (this.profile.stats.hits || 0) + 1;
      // attribute damage to the last shooter (for MVP) if it was an enemy
      var s = m.lastShot;
      if (s && s.unitId != null && unit && s.teamId !== unit.teamId){
        var pu = this._perUnit(s.unitId, s.teamId);
        pu.damage += amount;
        m.teamDamage[s.teamId] = (m.teamDamage[s.teamId] || 0) + amount;
        // v4: class XP to the shooter's class for landing a damaging hit
        this._awardClassXP(s.unitId, 4);
      }
      // award a sliver of XP per hit + advance "10 hits" challenge
      this.addXp(2);
      this._challengeAdvance('hit', 1);
      this._saveSoon();
    },

    _onCrit(unit){
      var m = this._match;
      m.crits++;
      this.addXp(8);
      this._challengeAdvance('crit', 1);
      this._saveSoon();
    },

    _onCombo(count){
      var m = this._match;
      count = (typeof count === 'number' && count > 0) ? count : 0;
      if (count > m.bestCombo) m.bestCombo = count;
      // XP scales with combo size
      this.addXp(10 + count * 6);
      // #24: "kill 3 with one shot" — the combo event is our multi-kill signal
      if (count >= 3) this._challengeAdvance('combo3', 1);
      this._saveSoon();
    },

    _onUnitDied(unit){
      if (!unit) return;
      var m = this._match;
      m.deaths++;
      this.profile.stats.deaths = (this.profile.stats.deaths || 0) + 1;

      // drown detection (no cause in event): feet near/under water surface
      var waterY = (CA.state && CA.state.waterLevel != null) ? CA.state.waterLevel
                 : (CA.config && CA.config.WATER_LEVEL);
      var ur = (CA.config && CA.config.UNIT_R) || 16;
      var drowned = (waterY != null) && (unit.y + ur * 0.4) > (waterY - 6);
      if (drowned) m.startWaterDeaths++;

      // kill attribution: last shooter's team gets credit if it was an enemy
      var shot = m.lastShot;
      var attackerTeamId = shot ? shot.teamId : null;
      var attackerUnitId = shot ? shot.unitId : null;
      var enemyKill = (attackerTeamId != null && attackerTeamId !== unit.teamId);

      if (enemyKill){
        m.kills[attackerTeamId] = (m.kills[attackerTeamId] || 0) + 1;
        m.killsThisShot++;
        // per-unit kill credit for MVP (#25)
        if (attackerUnitId != null){
          var pu = this._perUnit(attackerUnitId, attackerTeamId);
          pu.kills += 1;
        }
        // XP per kill
        this.addXp(20);
        // v4: class XP to the killer's class
        this._awardClassXP(attackerUnitId, 25);

        this._tryUnlock('firstBlood');
        if (m.killsThisShot >= 3) this._tryUnlock('tripleKill');
        if (drowned){
          this.profile.stats.waterKills = (this.profile.stats.waterKills || 0) + 1;
          if (this.profile.stats.waterKills >= 8) this._tryUnlock('splashdown');
        }
      }
      this._saveSoon();
    },

    _onGameOver(winnerTeamId){
      var m = this._match;
      var p = this.profile;
      var winTeam = (typeof CA.getTeam === 'function') ? CA.getTeam(winnerTeamId) : null;
      var humanWon = !!(winTeam && winTeam.isAI === false);

      var matchKills = 0;
      for (var k in m.kills){ if (m.kills.hasOwnProperty(k)) matchKills += m.kills[k]; }

      var bestThisMatch = 0;
      for (var k2 in m.kills){ if (m.kills.hasOwnProperty(k2)) bestThisMatch = Math.max(bestThisMatch, m.kills[k2]); }

      // XP award: base + per-kill + win bonus
      var xpGain = 40 + matchKills * 15 + (humanWon ? 60 : 0);
      this.addXp(xpGain, 'matchEnd');
      // #4 season XP (separate, resets each season) — drives the battle pass.
      this.addSeasonXP(xpGain);

      // #1 Squeak Coin payout — cosmetic-only currency. Scales with kills + win;
      // small base so every match pays a little.
      var coinGain = 25 + matchKills * 10 + (humanWon ? 50 : 0);
      this.addCoins(coinGain, 'matchEnd');

      // #3 rotating challenges that resolve on play (kill/win flow through
      // _challengeAdvance below; playMatch + match-kills are rotating-only kinds).
      this._ensureChallenges();
      this._rotAdvance('playMatch', 1);
      if (matchKills > 0) this._rotAdvance('kill', matchKills);

      // lifetime stats
      p.stats.games  = (p.stats.games  || 0) + 1;
      if (humanWon) p.stats.wins = (p.stats.wins || 0) + 1;
      p.stats.kills  = (p.stats.kills  || 0) + matchKills;
      p.stats.shots  = (p.stats.shots  || 0) + m.shots;
      p.stats.bestStreak = Math.max(p.stats.bestStreak || 0, bestThisMatch);
      p.stats.bestCombo  = Math.max(p.stats.bestCombo || 0, m.bestCombo || 0);
      p.stats.wavesSurvived = Math.max(p.stats.wavesSurvived || 0, m.wavesSurvived || 0);

      // leaderboard entry (#40)
      var name = (winTeam && winTeam.name) ? winTeam.name : 'Játékos';
      var score = matchKills * 100 + (humanWon ? 250 : 0) + xpGain;
      var date = new Date().toISOString().slice(0, 10);
      var entry = { name:name, score:score, date:date };
      p.leaderboard.push(entry);
      p.leaderboard.sort(function(a,b){ return (b.score||0) - (a.score||0); });
      if (p.leaderboard.length > MAX_LEADERBOARD) p.leaderboard.length = MAX_LEADERBOARD;
      // placement reward: one-shot coin bonus the first time this entry breaks
      // into a top-N threshold on the LOCAL leaderboard (see _grantLeaderboardReward).
      this._grantLeaderboardReward(entry);

      // survivor: human team won with whole roster alive
      if (humanWon){
        var alive = (typeof CA.aliveUnitsOfTeam === 'function') ? CA.aliveUnitsOfTeam(winnerTeamId).length : 0;
        if (alive >= (CA.config.TEAM_SIZE || 5)) this._tryUnlock('survivor');
      }

      // #24 challenges that resolve at match end
      if (humanWon){
        this._challengeAdvance('win', 1);
        // "win against wind": any non-zero wind this match
        var wind = (CA.state && (CA.state.wind != null ? CA.state.wind
                  : (CA.state.weather && CA.state.weather.wind))) || 0;
        if (Math.abs(wind) > 0.01) this._challengeAdvance('windWin', 1);
      }

      // v4 — match-end class XP: a flat bonus to every class that scored this
      // match, plus a win bonus to the winning team's hero classes.
      this._awardMatchEndClassXP(winnerTeamId, humanWon, matchKills);
      // v4.10 — per-animal XP for the animals that actually played (carry _tid/_uid).
      this._awardMatchEndUnitXP(winnerTeamId, matchKills);

      // run catalog-wide achievement checks
      this.check();

      this.save();
    },

    // v4.10 — distribute end-of-match XP to the ANIMALS that played. Any non-minion
    // unit carrying _tid/_uid (i.e. spawned from a saved team) earns: a base + a
    // win bonus if its team won. This is what makes a team's animals grow.
    _awardMatchEndUnitXP(winnerTeamId, matchKills){
      try {
        var units = (CA.state && CA.state.units) || [];
        var base = 35 + Math.min(120, (matchKills||0) * 6);
        var seen = {};
        for (var i=0;i<units.length;i++){
          var u = units[i];
          if (!u || u.minion || u._tid == null || u._uid == null) continue;
          var key = u._tid + '|' + u._uid;
          if (seen[key]) continue; seen[key] = true;   // one award per animal
          var bonus = (winnerTeamId != null && u.teamId === winnerTeamId) ? 60 : 0;
          this.awardUnitXP(u._tid, u._uid, base + bonus);
        }
      } catch(e){}
    },

    // v4 — distribute end-of-match class XP. classesPlayed got at least one
    // hit/kill; the winning team's heroes get an extra win bonus regardless.
    _awardMatchEndClassXP(winnerTeamId, humanWon, matchKills){
      try {
        var m = this._match;
        var played = (m && m.classesPlayed) || {};
        var base = 30 + Math.min(120, (matchKills||0) * 6);
        for (var cls in played){
          if (played.hasOwnProperty(cls)) this.addClassXP(cls, base);
        }
        // win bonus: every alive/dead hero class on the winning team
        if (winnerTeamId != null){
          var winUnits = (typeof CA.getTeam === 'function' && CA.getTeam(winnerTeamId))
            ? CA.state.units.filter(function(u){ return u && u.teamId === winnerTeamId && !u.minion; })
            : [];
          var seen = {};
          for (var i=0;i<winUnits.length;i++){
            var c = winUnits[i].cls;
            if (c && !seen[c]){ seen[c] = true; this.addClassXP(c, 60); }
          }
        }
      } catch(e){}
    },

    /* ---- XP / levels (#36 / #23) ----------------------------------------- */
    // level = floor(sqrt(xp/100)) + 1  (gentle curve)
    levelFor(xp){
      xp = (typeof xp === 'number' && xp > 0) ? xp : 0;
      return Math.floor(Math.sqrt(xp / 100)) + 1;
    },
    // inverse: minimum xp needed to BE level l. xp = 100*(l-1)^2
    xpForLevel(l){
      l = (typeof l === 'number' && l > 1) ? l : 1;
      var n = l - 1;
      return 100 * n * n;
    },

    // #23 public getters
    level(){ return this.profile.level || this.levelFor(this.profile.xp); },
    xp(){ return this.profile.xp || 0; },

    addXp(n){
      if (typeof n !== 'number' || !isFinite(n) || n === 0) return;
      var oldLevel = this.profile.level;
      this.profile.xp = Math.max(0, (this.profile.xp || 0) + n);
      var newLevel = this.levelFor(this.profile.xp);
      this.profile.level = newLevel;
      // COALESCE the level-up flood: accumulate species + rewards across ALL
      // crossed levels, then emit at most a few toasts AFTER the loop (so a big
      // single addXp() that jumps several levels does not spam ~15 toasts).
      var newSpecies = [];                                  // [{name,emoji}]
      var rewardAcc  = { coins:0, chest:0, cosmetic:0 };    // summed level rewards
      for (var lv = oldLevel + 1; lv <= newLevel; lv++){
        var idx = lv - 2; // level 2 -> UNLOCK_ORDER[0]
        if (idx >= 0 && idx < UNLOCK_ORDER.length){
          var sp = UNLOCK_ORDER[idx];
          if (this.unlock(sp)){
            var spName = (CA.Species && CA.Species[sp] && CA.Species[sp].name) ? CA.Species[sp].name : sp;
            var emoji  = (CA.Species && CA.Species[sp] && CA.Species[sp].emoji) ? CA.Species[sp].emoji : '⭐';
            newSpecies.push({ name: spName, emoji: emoji });
          }
        }
        // #5 account-level reward track: coins / cosmetic / chest at this level.
        // _grantLevelReward returns the granted reward (no toast) so we can sum it.
        var got = this._grantLevelReward(lv);
        if (got){
          if (got.coins) rewardAcc.coins += got.coins;
          if (got.chest) rewardAcc.chest += 1;
          else if (got.cosmetic) rewardAcc.cosmetic += 1;
        }
      }
      if (newLevel > oldLevel){
        // level-reached toast: one only (final level if several were crossed).
        this._pushToast(CA.t('Szint ') + newLevel + CA.t(' elérve!'), '⬆️');
        // combined level-reward toast (sum of all crossed levels), if any.
        var rbits = [];
        if (rewardAcc.coins)    rbits.push('+' + rewardAcc.coins + CA.t(' érme'));
        if (rewardAcc.cosmetic) rbits.push(rewardAcc.cosmetic + ' ' + CA.t('kinézet'));
        if (rewardAcc.chest)    rbits.push(rewardAcc.chest + ' ' + CA.t('láda'));
        if (rbits.length) this._pushToast(CA.t('Szint-jutalom: ') + rbits.join(', '), '🎁');
        // species unlocks: one toast if single, one summary toast if 2+.
        if (newSpecies.length === 1){
          this._pushToast(CA.t('Új faj feloldva: ') + newSpecies[0].name + CA.t('!'), newSpecies[0].emoji);
        } else if (newSpecies.length >= 2){
          this._pushToast(newSpecies.length + ' ' + CA.t('új faj feloldva!'), '⭐');
        }
        this._syncCosmetics();       // #26: unlock cosmetics gated on the new level
        this._tryUnlock('levelTen'); // achievement may now qualify
        // LEVEL-UP jingle — once per level-crossing addXp() call (guarded).
        try { CA.events.emit('sfx','levelup'); } catch(e){}
      }
    },

    // #23 alias with a reason (logged; behaviour identical to addXp)
    addXP(n, reason){
      if (reason && CA.DEBUG){ try { console.log('[Meta] +'+n+' XP ('+reason+')'); } catch(e){} }
      return this.addXp(n);
    },

    // #5 — grant the account-level reward for a freshly-reached level (if any).
    // Called ONLY from the addXp level-up loop. RETURNS the granted reward object
    // ({coins,xp,cosmetic,chest}) and pushes NO toast itself — addXp coalesces all
    // crossed-level rewards into a single "Szint-jutalom" toast. Species unlocks
    // are handled separately.
    _grantLevelReward(level){
      var r = LEVEL_REWARDS[level];
      if (!r) return null;
      return this._grantReward(r, 'level:'+level);
    },

    /* ====================================================================
     * v4 — PER-CLASS PROGRESSION (necro/guardian/mage/hunter/engineer/healer)
     * Each class has its own XP pool -> class level -> skill points spent on
     * that class's skill tree (CA.Classes[id].tree). Persisted in
     * profile.classXP{} + profile.skillRanks{classId:{nodeId:rank}}.
     * entities.js reads CA.Meta.skillRank(cls,nodeId) when (re)spawning heroes.
     * ==================================================================== */

    // robust load-time sanitizers (never trust localStorage)
    _sanitizeClassXP(raw){
      var out = {};
      if (raw && typeof raw === 'object'){
        for (var k in raw){
          if (!raw.hasOwnProperty(k)) continue;
          var v = raw[k];
          if (validClassId(k) && typeof v === 'number' && isFinite(v) && v >= 0) out[k] = v;
        }
      }
      return out;
    },
    _sanitizeSkillRanks(raw){
      var out = {};
      if (raw && typeof raw === 'object'){
        for (var k in raw){
          if (!raw.hasOwnProperty(k)) continue;
          var nodes = raw[k];
          if (!validClassId(k) || !nodes || typeof nodes !== 'object') continue;
          var clean = {};
          for (var nid in nodes){
            if (!nodes.hasOwnProperty(nid)) continue;
            var r = nodes[nid];
            if (typeof r === 'number' && isFinite(r) && r > 0) clean[nid] = Math.floor(r);
          }
          out[k] = clean;
        }
      }
      return out;
    },
    // v4.10 — teamSkills{ tid:{ uid:{ xp, ranks:{nodeId:rank} } } }. Keys are free
    // strings (team/unit ids), so we only validate value SHAPES, not the keys.
    _sanitizeTeamSkills(raw){
      var out = {};
      if (raw && typeof raw === 'object'){
        for (var tid in raw){
          if (!raw.hasOwnProperty(tid) || !tid) continue;
          var units = raw[tid];
          if (!units || typeof units !== 'object') continue;
          var cleanT = {};
          for (var uid in units){
            if (!units.hasOwnProperty(uid) || !uid) continue;
            var rec = units[uid]; if (!rec || typeof rec !== 'object') continue;
            var xp = (typeof rec.xp === 'number' && isFinite(rec.xp) && rec.xp > 0) ? rec.xp : 0;
            var ranks = {}, rr = rec.ranks;
            if (rr && typeof rr === 'object'){
              for (var nid in rr){ if (rr.hasOwnProperty(nid)){ var r = rr[nid];
                if (typeof r === 'number' && isFinite(r) && r > 0) ranks[nid] = Math.floor(r); } }
            }
            cleanT[uid] = { xp:xp, ranks:ranks };
          }
          out[tid] = cleanT;
        }
      }
      return out;
    },

    // class level from class XP — same gentle curve shape as account level.
    classLevelFor(xp){
      xp = (typeof xp === 'number' && xp > 0) ? xp : 0;
      return Math.floor(Math.sqrt(xp / CLASS_XP_DIV)) + 1;
    },
    // class XP needed to BE classLevel l : xp = CLASS_XP_DIV*(l-1)^2
    classXpForLevel(l){
      l = (typeof l === 'number' && l > 1) ? l : 1;
      var n = l - 1;
      return CLASS_XP_DIV * n * n;
    },

    // --- public getters ---
    classXP(id){
      if (!validClassId(id)) return 0;
      var m = this.profile.classXP || (this.profile.classXP = {});
      var v = m[id];
      return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0;
    },
    classLevel(id){ return this.classLevelFor(this.classXP(id)); },

    // award class XP to one class; surfaces level-ups as toasts (skill point ready).
    addClassXP(id, n){
      if (!validClassId(id)) return 0;
      if (typeof n !== 'number' || !isFinite(n) || n === 0) return this.classXP(id);
      var m = this.profile.classXP || (this.profile.classXP = {});
      var oldXP = (typeof m[id] === 'number' && isFinite(m[id])) ? m[id] : 0;
      var oldLvl = this.classLevelFor(oldXP);
      var newXP = Math.max(0, oldXP + n);
      m[id] = newXP;
      var newLvl = this.classLevelFor(newXP);
      if (newLvl > oldLvl){
        var nm = (CA.Classes && CA.Classes[id] && CA.Classes[id].name) ? CA.t(CA.Classes[id].name) : id;
        this._pushToast(nm + CA.t(' — szint ') + newLvl + ' ' + CA.t('(skill pont!)'), '🌟');
      }
      this._saveSoon();
      return newXP;
    },

    // total skill points EARNED for a class = classLevel-1 (level 1 grants none).
    _classPointsEarned(id){ return Math.max(0, this.classLevel(id) - 1); },
    // points already SPENT on a class's tree = sum of node ranks.
    _classPointsSpent(id){
      var ranks = (this.profile.skillRanks && this.profile.skillRanks[id]) || null;
      if (!ranks || typeof ranks !== 'object') return 0;
      var sum = 0;
      for (var nid in ranks){ if (ranks.hasOwnProperty(nid)){ var r = ranks[nid]; if (typeof r === 'number' && r > 0) sum += r; } }
      return sum;
    },
    // available (unspent) skill points for a class.
    skillPoints(id){
      if (!validClassId(id)) return 0;
      return Math.max(0, this._classPointsEarned(id) - this._classPointsSpent(id));
    },

    // current rank (0..node.max) of a tree node for a class.
    skillRank(id, nodeId){
      if (!validClassId(id) || !nodeId) return 0;
      var ranks = (this.profile.skillRanks && this.profile.skillRanks[id]) || null;
      if (!ranks) return 0;
      var r = ranks[nodeId];
      return (typeof r === 'number' && isFinite(r) && r > 0) ? Math.floor(r) : 0;
    },

    // look up a node def in the (possibly absent) class tree to honour `max`.
    _nodeMax(id, nodeId){
      try {
        var def = CA.Classes && CA.Classes[id];
        var tree = def && Array.isArray(def.tree) ? def.tree : null;
        if (!tree) return Infinity;     // tree not loaded yet — don't block
        for (var i=0;i<tree.length;i++){
          if (tree[i] && tree[i].id === nodeId){
            var mx = tree[i].max;
            return (typeof mx === 'number' && mx > 0) ? mx : Infinity;
          }
        }
        return 0;                       // tree loaded but node unknown -> not upgradeable
      } catch(e){ return Infinity; }
    },

    // spend one point on a class's tree node. Returns true on success.
    upgradeSkill(id, nodeId){
      if (!validClassId(id) || !nodeId) return false;
      if (this.skillPoints(id) <= 0) return false;
      var max = this._nodeMax(id, nodeId);
      if (max <= 0) return false;
      var cur = this.skillRank(id, nodeId);
      if (cur >= max) return false;
      var sr = this.profile.skillRanks || (this.profile.skillRanks = {});
      var ranks = sr[id] || (sr[id] = {});
      ranks[nodeId] = cur + 1;
      this.save();
      try { CA.events.emit('skillUpgraded', id, nodeId, ranks[nodeId]); } catch(e){}
      return true;
    },

    /* ====================================================================
     * v4.10 — PER-TEAM / PER-ANIMAL skill progression. The skill tree now
     * belongs to a TEAM (tid) and each ANIMAL in it (uid). The animal's CLASS
     * still defines the tree it spends on. Same XP curve as per-class.
     * Storage: profile.teamSkills[tid][uid] = { xp, ranks:{nodeId:rank} }.
     * ==================================================================== */
    _unitRec(tid, uid, make){
      if (tid == null || uid == null) return null;
      tid = String(tid); uid = String(uid);
      var ts = this.profile.teamSkills || (this.profile.teamSkills = {});
      var t = ts[tid]; if (!t){ if (!make) return null; t = ts[tid] = {}; }
      var u = t[uid]; if (!u){ if (!make) return null; u = t[uid] = { xp:0, ranks:{} }; }
      if (!u.ranks) u.ranks = {};
      return u;
    },
    unitXP(tid, uid){ var r = this._unitRec(tid, uid, false); return r ? (r.xp || 0) : 0; },
    unitLevel(tid, uid){ return this.classLevelFor(this.unitXP(tid, uid)); },
    // points earned = level-1 ; spent = sum of this animal's node ranks.
    _unitPointsSpent(tid, uid){
      var r = this._unitRec(tid, uid, false); if (!r) return 0;
      var sum = 0; for (var nid in r.ranks){ if (r.ranks.hasOwnProperty(nid)){ var v = r.ranks[nid]; if (typeof v === 'number' && v > 0) sum += v; } }
      return sum;
    },
    unitSkillPoints(tid, uid){ return Math.max(0, (this.unitLevel(tid, uid) - 1) - this._unitPointsSpent(tid, uid)); },
    unitSkillRank(tid, uid, nodeId){
      if (!nodeId) return 0;
      var r = this._unitRec(tid, uid, false); if (!r) return 0;
      var v = r.ranks[nodeId];
      return (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
    },
    // spend one point on this animal's class-tree node. cls = the animal's class
    // (needed to honour the node's `max`). Returns true on success.
    upgradeUnitSkill(tid, uid, cls, nodeId){
      if (tid == null || uid == null || !nodeId) return false;
      if (this.unitSkillPoints(tid, uid) <= 0) return false;
      var max = this._nodeMax(cls, nodeId); if (max <= 0) return false;
      var cur = this.unitSkillRank(tid, uid, nodeId); if (cur >= max) return false;
      var r = this._unitRec(tid, uid, true);
      r.ranks[nodeId] = cur + 1;
      this.save();
      try { CA.events.emit('unitSkillUpgraded', tid, uid, nodeId, r.ranks[nodeId]); } catch(e){}
      return true;
    },
    // award XP to one animal; surfaces level-ups as a toast (skill point ready).
    awardUnitXP(tid, uid, n){
      if (tid == null || uid == null) return 0;
      if (typeof n !== 'number' || !isFinite(n) || n === 0) return this.unitXP(tid, uid);
      var r = this._unitRec(tid, uid, true);
      var oldLvl = this.classLevelFor(r.xp || 0);
      r.xp = Math.max(0, (r.xp || 0) + n);
      var newLvl = this.classLevelFor(r.xp);
      if (newLvl > oldLvl){ try { CA.events.emit('unitLeveled', tid, uid, newLvl); } catch(e){} }
      this._saveSoon();
      return r.xp;
    },
    // RESOLVER used by entities.js at spawn: prefer the per-animal rank when the
    // unit carries a team+unit id, else fall back to the per-class rank.
    skillRankForUnit(u, nodeId){
      try {
        if (u && u._tid != null && u._uid != null) return this.unitSkillRank(u._tid, u._uid, nodeId);
        return this.skillRank(u && u.cls, nodeId);
      } catch(e){ return 0; }
    },

    // resolve the class id of the active shooter (or any unit) for XP attribution.
    _classOfShooter(unitId){
      try {
        var u = (unitId != null && typeof CA.getUnit === 'function') ? CA.getUnit(unitId) : null;
        if (!u && typeof CA.activeUnit === 'function') u = CA.activeUnit();
        if (u && u.cls) return u.cls;
        var c = (u && typeof CA.classOf === 'function') ? CA.classOf(u) : null;
        return (c && c.id) ? c.id : null;
      } catch(e){ return null; }
    },
    // award class XP to the shooter's class + remember it played this match.
    _awardClassXP(unitId, n){
      var cls = this._classOfShooter(unitId);
      if (!cls) return;
      this.addClassXP(cls, n);
      var m = this._match;
      if (m){ (m.classesPlayed || (m.classesPlayed = {}))[cls] = true; }
    },

    /* ---- Season / battle-pass track (#23 / #4) --------------------------- */
    // Back-compat shape for screens.js / menu-profile.js: [{tier,xp,reward,label,
    // unlocked}]. `unlocked` = season XP reached the tier threshold. Derived from
    // the real SEASON_PASS (FREE lane reward used as the display label).
    seasonTiers(){
      this._ensureSeason();
      var x = this.profile.seasonXP || 0;
      var out = [];
      for (var i=0;i<SEASON_PASS.length;i++){
        var t = SEASON_PASS[i];
        out.push({
          tier: t.tier,
          xp: t.xp,
          reward: this._rewardLabel(t.free),
          label: this._rewardLabel(t.free),
          unlocked: x >= t.xp
        });
      }
      return out;
    },

    // human-ish label for a reward object (used by the profile season strip).
    _rewardLabel(r){
      if (!r) return '';
      if (r.cosmetic){ var c = COSMETIC_CATALOG[r.cosmetic]; return (c && c.name) ? CA.t(c.name) : r.cosmetic; }
      if (r.chest) return CA.t('Láda');
      if (r.coins) return r.coins + ' ' + CA.t('érme');
      if (r.xp) return r.xp + ' XP';
      return '';
    },

    /* ---- Cosmetic unlocks (#26) ------------------------------------------ */
    _syncCosmetics(silent){
      var lvl = this.profile.level || 1;
      if (!Array.isArray(this.profile.cosmetics)) this.profile.cosmetics = [];
      var changed = false;
      for (var i=0;i<COSMETIC_UNLOCKS.length;i++){
        var c = COSMETIC_UNLOCKS[i];
        if (lvl >= c.level && this.profile.cosmetics.indexOf(c.id) < 0){
          this.profile.cosmetics.push(c.id);
          changed = true;
          if (!silent) this._pushToast(CA.t('Új kinézet: ') + c.id, '🎩');
        }
      }
      if (changed && !silent) this.save();
      return changed;
    },
    _grantCosmetic(id, label){
      if (!id) return false;
      if (!Array.isArray(this.profile.cosmetics)) this.profile.cosmetics = [];
      if (this.profile.cosmetics.indexOf(id) >= 0) return false;
      this.profile.cosmetics.push(id);
      this._pushToast(CA.t('Új kinézet: ') + CA.t(label || id), '🎩');
      this.save();
      return true;
    },
    unlockedCosmetics(){
      this._syncCosmetics(true);
      return Array.isArray(this.profile.cosmetics) ? this.profile.cosmetics.slice() : [];
    },
    // CONTRACT — owned cosmetic ids (alias of unlockedCosmetics; the name the
    // shop / team-editor / other agents call).
    cosmetics(){ return this.unlockedCosmetics(); },
    ownsCosmetic(id){
      if (!id) return false;
      return Array.isArray(this.profile.cosmetics) && this.profile.cosmetics.indexOf(id) >= 0;
    },

    /* ---- Challenges (#24) ------------------------------------------------- */
    _challState(id){
      var cp = this.profile.challengeProgress || (this.profile.challengeProgress = {});
      if (!cp[id] || typeof cp[id] !== 'object') cp[id] = { progress:0, done:false };
      return cp[id];
    },
    // generic advance: add `amt` to every challenge of matching kind, complete & reward.
    // Also forwards to the rotating daily/weekly challenges (#3), which reuse the
    // SAME kinds (hit/crit/combo3/kill/win/playMatch).
    _challengeAdvance(kind, amt){
      amt = (typeof amt === 'number' && amt>0) ? amt : 1;
      for (var i=0;i<CHALLENGE_DEFS.length;i++){
        var def = CHALLENGE_DEFS[i];
        if (def.kind !== kind) continue;
        var st = this._challState(def.id);
        if (st.done) continue;
        st.progress = Math.min(def.goal, (st.progress||0) + amt);
        if (st.progress >= def.goal) this._completeChallenge(def);
      }
      this._rotAdvance(kind, amt);
      this._saveSoon();
    },
    // special: distinct weapons in the CURRENT match → set progress to count.
    _challengeWeaponsMatch(){
      var def = null;
      for (var i=0;i<CHALLENGE_DEFS.length;i++){ if (CHALLENGE_DEFS[i].kind === 'weaponsMatch'){ def = CHALLENGE_DEFS[i]; break; } }
      if (!def) return;
      var st = this._challState(def.id);
      if (st.done) return;
      var n = 0, w = this._match.weaponsUsed;
      for (var k in w){ if (w.hasOwnProperty(k)) n++; }
      st.progress = Math.min(def.goal, n);
      if (st.progress >= def.goal) this._completeChallenge(def);
      this._saveSoon();
    },
    _completeChallenge(def){
      var st = this._challState(def.id);
      if (st.done) return;
      st.done = true;
      st.progress = def.goal;
      var r = def.reward || {};
      if (r.xp) this.addXp(r.xp, 'challenge:'+def.id);
      if (r.cosmetic) this._grantCosmetic(r.cosmetic);
      this._pushToast(CA.t('Kihívás kész: ') + CA.t(def.desc), '🎯');
      try { CA.events.emit('challengeDone', def.id, def); } catch(e){}
      this.save();
    },
    // #24 accessor
    challenges(){
      var out = [];
      for (var i=0;i<CHALLENGE_DEFS.length;i++){
        var def = CHALLENGE_DEFS[i];
        var st = this._challState(def.id);
        out.push({
          id: def.id,
          desc: def.desc,
          progress: Math.min(def.goal, st.progress||0),
          goal: def.goal,
          done: !!st.done
        });
      }
      return out;
    },

    /* ---- Achievements (#39 / #27) ---------------------------------------- */
    // Silently mark every achievement whose threshold is ALREADY met by the
    // loaded stats/level as done — NO toast, NO coin payout. Called on profile
    // load (init + importCloudProfile) so a returning player on a new device, or
    // a veteran after an update that adds achievements, doesn't get a flood of
    // re-unlock toasts for things long since earned. Idempotent; a brand-new
    // profile (all-zero stats) reconciles nothing, so first-time live unlocks
    // still toast normally.
    _reconcileAchievements(){
      var p = this.profile;
      if (!p || !p.achievements) return;
      try {
        if (((p.stats && p.stats.kills) || 0) >= 1) p.achievements['firstBlood'] = true;
        var distinct = 0;
        for (var w in p.weaponsEverUsed){ if (p.weaponsEverUsed.hasOwnProperty(w)) distinct++; }
        if (distinct >= 10) p.achievements['arsenal'] = true;
        for (var i=0;i<this.achievements.length;i++){
          var a = this.achievements[i];
          if (a && typeof a.test === 'function' && !p.achievements[a.id]){
            var ok = false; try { ok = !!a.test(p.stats, p); } catch(e){ ok = false; }
            if (ok) p.achievements[a.id] = true;
          }
        }
      } catch(e){}
      return this;
    },

    check(){
      var p = this.profile;
      // COALESCE the achievement flood: during this pass _tryUnlock collects into
      // _achBatch instead of toasting individually, so a first-match-end that
      // unlocks many stat achievements at once emits ONE summary toast.
      this._achBatch = { n:0, coins:0, lastName:'', lastReward:0 };
      // legacy explicit checks
      if ((p.stats.wins || 0) >= 5) this._tryUnlock('collector');
      var distinct = 0;
      for (var w in p.weaponsEverUsed){ if (p.weaponsEverUsed.hasOwnProperty(w)) distinct++; }
      if (distinct >= 10) this._tryUnlock('arsenal');
      if (this._match && this._match.barrelChain >= 70) this._tryUnlock('demolition');
      // generic test()-driven achievements (centurion/marksman/veteran/levelTen/…)
      for (var i=0;i<this.achievements.length;i++){
        var a = this.achievements[i];
        if (a && typeof a.test === 'function' && !p.achievements[a.id]){
          var ok = false;
          try { ok = !!a.test(p.stats, p); } catch(e){ ok = false; }
          if (ok) this._tryUnlock(a.id);
        }
      }
      // emit the coalesced toast for this pass.
      var b = this._achBatch;
      this._achBatch = null;
      if (b.n === 1){
        // reproduce the original single-achievement toast.
        if (b.lastReward > 0) this._pushToast(b.lastName + ' · +' + b.lastReward + CA.t(' érme'), '🏅');
        else                  this._pushToast(b.lastName, '🏆');
      } else if (b.n >= 2){
        var atxt = b.n + ' ' + CA.t('új eredmény!');
        if (b.coins > 0) atxt += ' (+' + b.coins + CA.t(' érme') + ')';
        this._pushToast(atxt, '🏆');
      }
      return this;
    },

    _tryUnlock(id){
      if (!id) return false;
      if (this.profile.achievements[id]) return false;
      var meta = null;
      for (var i=0;i<this.achievements.length;i++){ if (this.achievements[i].id === id){ meta = this.achievements[i]; break; } }
      if (!meta) return false;
      this.profile.achievements[id] = true;
      // one-off coin reward by tier. The guard above (already-unlocked) makes this
      // idempotent: an achievement can never pay twice.
      var reward = achReward(id);
      if (reward > 0) this.addCoins(reward, 'achievement:'+id);
      // When a check() pass is batching (_achBatch active), suppress the per-unlock
      // toast and accumulate; check() emits one coalesced toast afterwards. Coins,
      // events, Steam, save still happen here exactly as before.
      if (this._achBatch){
        this._achBatch.n++;
        this._achBatch.coins += reward;
        this._achBatch.lastName = CA.t(meta.name);
        this._achBatch.lastReward = reward;
      } else if (reward > 0){
        this._pushToast(CA.t(meta.name) + ' · +' + reward + CA.t(' érme'), '🏅');
      } else {
        this._pushToast(CA.t(meta.name), '🏆');
      }
      try { CA.events.emit('achievement', id, meta); } catch(e){}
      // ACHIEVEMENT unlock jingle — fires once (guarded above against re-unlock).
      try { CA.events.emit('sfx','achievement'); } catch(e){}
      this._steamUnlock(id);   // #27 Steam stub
      this.save();
      return true;
    },

    // #27 — accessor returning {id,name,desc,done}.  (Kept as a method name that
    // does NOT collide with the `achievements` array screens.js relies on.)
    achievementsState(){
      var p = this.profile;
      var out = [];
      for (var i=0;i<this.achievements.length;i++){
        var a = this.achievements[i];
        out.push({ id:a.id, name:a.name, desc:a.desc, reward: achReward(a.id), done: !!(p.achievements && p.achievements[a.id]) });
      }
      return out;
    },

    /* ---- Leaderboard placement reward (one-shot per threshold) ------------
     * Pays a modest coin bonus the FIRST TIME the local player's freshly-banked
     * entry lands at-or-above a placement threshold (top10/top3/top1) on the
     * LOCAL leaderboard. profile.leaderboardClaimed records paid thresholds, so
     * each pays exactly once ever — replaying for the same rank does nothing,
     * which is what makes it abuse-resistant. Idempotent + never throws. */
    _grantLeaderboardReward(entry){
      try {
        var p = this.profile;
        if (!entry) return;
        if (!Array.isArray(p.leaderboardClaimed)) p.leaderboardClaimed = [];
        var rank = p.leaderboard.indexOf(entry) + 1; // 1-based; 0 if not found
        if (rank <= 0) return;
        for (var i=0;i<LEADERBOARD_REWARDS.length;i++){
          var r = LEADERBOARD_REWARDS[i];
          if (rank <= r.rank && p.leaderboardClaimed.indexOf(r.id) < 0){
            p.leaderboardClaimed.push(r.id);
            this.addCoins(r.coins, 'leaderboard:'+r.id);
            this._pushToast(CA.t('Helyezés-jutalom: +') + r.coins + CA.t(' érme'), '🏆');
          }
        }
      } catch(e){}
    },
    // CONTRACT — placement-reward table for the leaderboard screen to render
    // ("what do top placements give"), with whether each is already claimed.
    // [{ id, rank, coins, claimed }]
    leaderboardRewards(){
      var p = this.profile;
      var claimed = Array.isArray(p.leaderboardClaimed) ? p.leaderboardClaimed : [];
      var out = [];
      for (var i=0;i<LEADERBOARD_REWARDS.length;i++){
        var r = LEADERBOARD_REWARDS[i];
        out.push({ id:r.id, rank:r.rank, coins:r.coins, claimed: claimed.indexOf(r.id) >= 0 });
      }
      return out;
    },

    // #27 — Steam unlock stub (no-op now; logs).  Wire to a real Steam layer
    // (greenworks / Steamworks IPC) later; safe to call repeatedly.
    _steamUnlock(id){
      try {
        if (CA.Steam && typeof CA.Steam.unlockAchievement === 'function'){
          CA.Steam.unlockAchievement(id);
        } else {
          console.log('[Steam stub] unlock achievement:', id);
        }
      } catch(e){}
      return true;
    },

    /* ---- Toasts ----------------------------------------------------------- */
    _pushToast(text, icon){
      this.toasts.push({ text:text, icon:icon || '⭐', t:3.0, ts:Date.now() });
      if (this.toasts.length > MAX_TOASTS) this.toasts.splice(0, this.toasts.length - MAX_TOASTS);
    },

    /* ---- Stats accessors (#34 / #25) ------------------------------------- */
    // per-unit attribution bucket
    _perUnit(unitId, teamId){
      if (unitId == null) return { kills:0, damage:0, teamId:teamId };
      var pu = this._match.perUnit;
      if (!pu[unitId]) pu[unitId] = { kills:0, damage:0, teamId:teamId };
      else if (pu[unitId].teamId == null) pu[unitId].teamId = teamId;
      return pu[unitId];
    },

    // computes the MVP unit (most kills, tie-broken by damage) for this match.
    _computeMVP(){
      var pu = this._match.perUnit, bestId = null, best = null;
      for (var id in pu){
        if (!pu.hasOwnProperty(id)) continue;
        var e = pu[id];
        if (!best || e.kills > best.kills || (e.kills === best.kills && e.damage > best.damage)){
          best = e; bestId = id;
        }
      }
      if (!best || (best.kills === 0 && best.damage === 0)) return null;
      // object keys come back as strings; unit ids are numbers → coerce for lookup
      var lookupId = (bestId != null && bestId !== '' && isFinite(+bestId)) ? +bestId : bestId;
      var unit = (typeof CA.getUnit === 'function') ? CA.getUnit(lookupId) : null;
      var team = (best.teamId != null && typeof CA.getTeam === 'function') ? CA.getTeam(best.teamId) : null;
      return {
        unitId: lookupId,
        teamId: best.teamId,
        kills: best.kills,
        damage: Math.round(best.damage),
        name: (unit && unit.name) || (team && team.name) || 'MVP',
        teamName: (team && team.name) || null,
        color: (team && team.color) || null
      };
    },

    // lifetime stats (#25) with computed accuracy + favorite weapon.
    stats(){
      var s = this.profile.stats || {};
      var shots = s.shots || 0, hits = s.hits || 0;
      // favorite weapon = most-used by lifetime tally
      var fav = null, favN = -1, wu = s.weaponUse || {};
      for (var w in wu){ if (wu.hasOwnProperty(w) && wu[w] > favN){ favN = wu[w]; fav = w; } }
      return {
        matches: s.games || 0,
        wins: s.wins || 0,
        kills: s.kills || 0,
        deaths: s.deaths || 0,
        shots: shots,
        hits: hits,
        accuracy: shots > 0 ? +(hits/shots).toFixed(3) : 0,
        favoriteWeapon: fav,
        biggestCombo: s.bestCombo || 0,
        bestStreak: s.bestStreak || 0,
        wavesSurvived: s.wavesSurvived || 0,
        level: this.profile.level || 1,
        xp: this.profile.xp || 0
      };
    },

    // current-match stats (#34) — keeps legacy fields (kills/shots) and ADDS
    // accuracy, combo, crits, and a computed MVP (#25) for the victory screen.
    matchStats(){
      var m = this._match;
      var totalKills = 0;
      for (var k in m.kills){ if (m.kills.hasOwnProperty(k)) totalKills += m.kills[k]; }
      // expose computed extras as own properties WITHOUT clobbering the raw map.
      m.totalKills = totalKills;
      m.accuracy = m.shots > 0 ? +(m.hits/m.shots).toFixed(3) : 0;
      m.mvp = this._computeMVP();
      return m;
    },

    /* ---- Species unlock (#36) -------------------------------------------- */
    isUnlocked(id){
      if (!id) return false;
      if (BASE_UNLOCKED.indexOf(id) >= 0) return true;
      return Array.isArray(this.profile.unlocked) && this.profile.unlocked.indexOf(id) >= 0;
    },
    unlock(id){
      if (!id) return false;
      if (!Array.isArray(this.profile.unlocked)) this.profile.unlocked = BASE_UNLOCKED.slice();
      if (this.profile.unlocked.indexOf(id) >= 0) return false;
      this.profile.unlocked.push(id);
      this.save();
      return true;
    },

    /* ====================================================================
     * #1 — SQUEAK COIN (soft currency). Cosmetic-only. CONTRACT API.
     * ==================================================================== */
    coins(){
      var c = this.profile.coins;
      return (typeof c === 'number' && isFinite(c) && c > 0) ? Math.floor(c) : 0;
    },
    addCoins(n, reason){
      n = (typeof n === 'number' && isFinite(n)) ? Math.floor(n) : 0;
      if (n === 0) return this.coins();
      this.profile.coins = Math.max(0, this.coins() + n);
      if (reason && CA.DEBUG){ try { console.log('[Meta] '+(n>=0?'+':'')+n+' coins ('+reason+')'); } catch(e){} }
      this._saveSoon();
      try { CA.events.emit('coinsChanged', this.profile.coins); } catch(e){}
      // COIN sfx — only on a positive gain (spends go through spendCoins, which
      // stays silent). Each addCoins is a discrete reward event, not per-frame.
      if (n > 0){ try { CA.events.emit('sfx','coin'); } catch(e){} }
      return this.profile.coins;
    },
    // returns true & deducts when affordable, false otherwise (does NOT emit on fail).
    spendCoins(n){
      n = (typeof n === 'number' && isFinite(n)) ? Math.floor(n) : 0;
      if (n <= 0) return true;
      if (this.coins() < n) return false;
      this.profile.coins = this.coins() - n;
      this.save();
      try { CA.events.emit('coinsChanged', this.profile.coins); } catch(e){}
      return true;
    },

    /* ====================================================================
     * #2 — DAILY LOGIN / STREAK. Escalating reward; chest every 7th day.
     * ==================================================================== */
    // day-number (integer days since epoch, local) for "same day" comparison.
    _dayNum(ts){
      var t = (typeof ts === 'number' && ts > 0) ? ts : Date.now();
      var off = new Date().getTimezoneOffset() * 60000;
      return Math.floor((t - off) / DAY_MS);
    },
    // CONTRACT — { claimable, streak }. The home badge reads `claimable`; it now
    // means "the DAILY WHEEL can be spun today" (lastSpin !== today) so the badge
    // lights up until the player has used today's spin. claimDaily() still works.
    dailyStatus(){
      var today = this._dayNum();
      var lastSpin = this.profile.lastSpin || 0;
      return {
        claimable: (lastSpin !== today),
        streak: Math.max(0, Math.floor(this.profile.streak || 0))
      };
    },
    // what streak-day would TODAY be if claimed right now (preview, no mutation).
    // Mirrors the streak math in claimDaily so the UI can show "Day N" + reward
    // BEFORE the player claims. If already claimed today, returns the day already
    // banked (so the screen can render the streak it earned).
    _streakIfClaimedToday(){
      var today = this._dayNum();
      var last = this.profile.lastLogin || 0;
      var cur = Math.max(0, Math.floor(this.profile.streak || 0));
      if (last === today) return Math.max(1, cur);        // already claimed -> today's banked streak
      if (last === today - 1) return Math.max(1, cur + 1); // continuing the streak
      return 1;                                            // missed a day (or first ever) -> reset to 1
    },
    // the reward TODAY's claim would grant (preview; pure data, no mutation/RNG).
    // Same indexing as claimDaily (index = streak-1, capped at the table length).
    _dailyRewardPreview(streakDay){
      var idx = Math.min(Math.max(1, streakDay) - 1, DAILY_REWARDS.length - 1);
      var r = DAILY_REWARDS[idx] || { coins:50 };
      return { coins: r.coins || 0, chest: !!r.chest };
    },
    // CONTRACT (retention) — the clean read the home/daily screen calls on open.
    // IDEMPOTENT & SIDE-EFFECT-FREE: it never grants and never advances the streak;
    // it only reports state, so re-opening the app the same day can't double-grant.
    // -> { day, reward:{coins,chest}, claimedToday, claimable, streak }
    //   day          = the streak-day a claim right now would land on (preview)
    //   reward       = what that claim would grant
    //   claimedToday = today's daily already taken (re-open guard)
    //   claimable    = the inverse (a claim today is still available)
    //   streak       = the current banked consecutive-day streak
    // The screen renders this, then calls claimDaily() (which performs the single
    // idempotent grant + streak advance) when the player taps "Claim".
    checkDailyLogin(){
      var today = this._dayNum();
      var claimedToday = (this.profile.lastLogin || 0) === today;
      var day = this._streakIfClaimedToday();
      return {
        day: day,
        reward: this._dailyRewardPreview(day),
        claimedToday: claimedToday,
        claimable: !claimedToday,
        streak: Math.max(0, Math.floor(this.profile.streak || 0))
      };
    },
    // claim today's daily reward. Returns the awarded reward object (or null if
    // already claimed today). Advances/resets streak based on day continuity.
    claimDaily(){
      var today = this._dayNum();
      var last = this.profile.lastLogin || 0;
      if (last === today) return null;             // already claimed today
      // continue the streak if exactly yesterday, else reset to 1.
      if (last === today - 1) this.profile.streak = Math.max(1, (this.profile.streak||0) + 1);
      else this.profile.streak = 1;
      this.profile.lastLogin = today;
      var idx = Math.min(this.profile.streak - 1, DAILY_REWARDS.length - 1);
      var reward = DAILY_REWARDS[idx] || { coins:50 };
      var got = { coins: reward.coins || 0, chest:false, cosmetic:null };
      if (reward.coins) this.addCoins(reward.coins, 'daily');
      if (reward.chest){ var roll = this._chestRoll(); got.chest = true; got.cosmetic = roll && roll.id; }
      this.save();
      // 7-day milestone bonus (idempotent; fires only when streak hits a multiple of 7)
      var bonus = this._grantStreakBonus();
      if (bonus){ got.streakBonus = bonus; }
      try { CA.events.emit('dailyClaimed', this.profile.streak, got); } catch(e){}
      this._pushToast(CA.t('Napi jutalom: +') + (reward.coins||0) + CA.t(' érme'), '🎁');
      return got;
    },

    /* ====================================================================
     * 7-DAY STREAK MILESTONE BONUS (live grant behind the streak-calendar).
     * Call AFTER the streak counter has been advanced for today (claimDaily /
     * dailySpin). Idempotent: pays exactly once per qualifying streak value via
     * profile.lastStreakBonus (the highest streak already paid). Re-render /
     * reload the same day re-enters here but the guard short-circuits, so the
     * bonus can NEVER double-grant. Returns the granted bonus descriptor
     * { streak, coins, chest } or null when nothing was due.
     * ==================================================================== */
    _grantStreakBonus(){
      var streak = Math.max(0, Math.floor(this.profile.streak || 0));
      // only on a 7-day boundary (7, 14, 21, …)
      if (streak <= 0 || (streak % STREAK_CYCLE) !== 0) return null;
      // already paid for this (or a higher) streak value -> idempotent no-op.
      var paid = Math.max(0, Math.floor(this.profile.lastStreakBonus || 0));
      if (paid >= streak) return null;
      this.profile.lastStreakBonus = streak;
      var bonus = { streak: streak, coins: STREAK_BONUS_COINS, chest: false, cosmetic: null };
      // extra coins on top of today's normal payout
      if (STREAK_BONUS_COINS > 0) this.addCoins(STREAK_BONUS_COINS, 'streakDay7');
      // a bonus chest roll (cosmetic-only; dup auto-refunds via _chestRoll)
      var roll = null;
      try { roll = this._chestRoll(); } catch(e){ roll = null; }
      if (roll){ bonus.chest = true; bonus.cosmetic = roll.dup ? null : (roll.id || null); }
      this.save();
      try { CA.events.emit('streakBonus', bonus); } catch(e){}
      this._pushToast(CA.t('🎉 7 napos sorozat! Bónusz láda + ') + STREAK_BONUS_COINS + CA.t(' érme'), '🎉');
      return bonus;
    },

    /* ====================================================================
     * REWARDED-AD COIN SOURCE (menu-shop). Rate-limited: at most
     * AD_COINS_MAX_PER_DAY grants per local calendar day, AD_COINS_AMOUNT each.
     * The caller is responsible for actually showing the ad via
     * CA.Portal.rewarded(); this just enforces the cap + grants the coins on a
     * confirmed reward. All cosmetic-currency, never real money.
     * ==================================================================== */
    // can the player still earn ad coins today? (cap not yet reached)
    canEarnAdCoins(){
      var today = this._dayNum();
      var used = ((this.profile.adCoinsDay || 0) === today) ? Math.max(0, Math.floor(this.profile.adCoinsCount || 0)) : 0;
      return used < AD_COINS_MAX_PER_DAY;
    },
    // remaining ad-coin grants available today.
    adCoinsLeft(){
      var today = this._dayNum();
      var used = ((this.profile.adCoinsDay || 0) === today) ? Math.max(0, Math.floor(this.profile.adCoinsCount || 0)) : 0;
      return Math.max(0, AD_COINS_MAX_PER_DAY - used);
    },
    // how many coins a single ad grant pays (read by the shop button label).
    adCoinAmount(){ return AD_COINS_AMOUNT; },
    // grant the ad-coin reward (call ONLY after CA.Portal.rewarded() resolved true).
    // Enforces the daily cap; returns the granted amount (0 if the cap was hit).
    grantAdCoins(){
      var today = this._dayNum();
      if ((this.profile.adCoinsDay || 0) !== today){ this.profile.adCoinsDay = today; this.profile.adCoinsCount = 0; }
      if (Math.max(0, Math.floor(this.profile.adCoinsCount || 0)) >= AD_COINS_MAX_PER_DAY) return 0;
      this.profile.adCoinsCount = Math.max(0, Math.floor(this.profile.adCoinsCount || 0)) + 1;
      this.addCoins(AD_COINS_AMOUNT, 'rewardedAd');
      this.save();
      return AD_COINS_AMOUNT;
    },

    /* ====================================================================
     * REWARDED-AD DAILY RE-SPIN (menu-daily). Lets the player earn ONE extra
     * spin AFTER using today's free spin, by watching a rewarded ad. Max one
     * ad-respin per local calendar day (profile.adRespinDay).
     * ==================================================================== */
    // is an ad-respin still available today? (free spin used, ad not yet used)
    canAdRespin(){
      var today = this._dayNum();
      var spunToday = (this.profile.lastSpin || 0) === today;
      var adUsedToday = (this.profile.adRespinDay || 0) === today;
      return spunToday && !adUsedToday;
    },
    // consume the daily ad-respin slot and clear the spin guard so dailySpin() can
    // run once more today. Call ONLY after CA.Portal.rewarded() resolved true.
    // Returns true if a re-spin was unlocked, false if none was available.
    grantAdRespin(){
      var today = this._dayNum();
      if ((this.profile.lastSpin || 0) !== today) return false; // hasn't used the daily spin yet
      if ((this.profile.adRespinDay || 0) === today) return false; // already used today's ad-respin
      this.profile.adRespinDay = today;
      // clearing lastSpin re-opens dailySpin() for exactly one more roll today;
      // the streak does NOT advance again because lastLogin stays == today (the
      // dailySpin streak math leaves it unchanged when already logged in today).
      this.profile.lastSpin = 0;
      this.save();
      return true;
    },

    /* ====================================================================
     * DAILY FORTUNE WHEEL ("Napi pörgetés"). Replaces the always-win daily
     * reward with a weighted prize wheel: a real 0-coin MISS is possible, big
     * prizes are rare. ONE spin per local calendar day (idempotent via
     * profile.lastSpin === today, mirroring claimDaily's lastLogin guard).
     * The returned `index` maps to SPIN_SEGMENTS order so the UI animation
     * can land the pointer on the winning slice.
     * ==================================================================== */
    // ms until the next local midnight (when a new spin becomes available).
    _msToNextDay(){
      var now = Date.now();
      var nextDayStart = (this._dayNum() + 1) * DAY_MS + new Date().getTimezoneOffset() * 60000;
      var ms = nextDayStart - now;
      return ms > 0 ? ms : 0;
    },
    // weighted pick over SPIN_SEGMENTS -> index. Defensive: always returns a valid
    // index even if weights are missing/zero.
    _pickSpinIndex(){
      var total = 0, i;
      for (i=0;i<SPIN_SEGMENTS.length;i++){
        var w = SPIN_SEGMENTS[i].weight;
        total += (typeof w === 'number' && w > 0) ? w : 0;
      }
      if (total <= 0) return 0;
      var r = Math.random() * total, acc = 0;
      for (i=0;i<SPIN_SEGMENTS.length;i++){
        var ww = SPIN_SEGMENTS[i].weight;
        acc += (typeof ww === 'number' && ww > 0) ? ww : 0;
        if (r <= acc) return i;
      }
      return SPIN_SEGMENTS.length - 1;
    },
    // PURE state read for the UI (no side effects, never grants). Lets the screen
    // render the wheel, gate the button, show the last result + a countdown.
    // -> { segments, canSpin, spunToday, lastResult, streak, nextInMs }
    dailySpinState(){
      var today = this._dayNum();
      var lastSpin = this.profile.lastSpin || 0;
      var spunToday = (lastSpin === today);
      return {
        // copies so the UI can't mutate the master table
        segments: SPIN_SEGMENTS.map(function(s){
          return { coins:s.coins||0, label:s.label||'', cosmetic:!!s.cosmetic,
                   miss:!!s.miss, rare:!!s.rare, weight:s.weight||0 };
        }),
        canSpin: !spunToday,
        spunToday: spunToday,
        lastResult: (this.profile.lastSpinResult && typeof this.profile.lastSpinResult === 'object')
                      ? this.profile.lastSpinResult : null,
        streak: Math.max(0, Math.floor(this.profile.streak || 0)),
        nextInMs: spunToday ? this._msToNextDay() : 0
      };
    },
    // Perform today's spin. Idempotent: a second call the same day grants NOTHING
    // and returns { ok:false, already:true, result:<last> }. On a fresh spin it
    // picks a weighted segment, GRANTS it (coins and/or a rolled cosmetic),
    // records the result, stamps the day, advances the login streak (same rule as
    // claimDaily), and returns { ok:true, index, segment, coins, cosmetic, streak }.
    dailySpin(){
      var today = this._dayNum();
      var lastSpin = this.profile.lastSpin || 0;
      if (lastSpin === today){
        return { ok:false, already:true, result:this.profile.lastSpinResult || null };
      }
      var idx = this._pickSpinIndex();
      var seg = SPIN_SEGMENTS[idx] || SPIN_SEGMENTS[0];

      // advance/reset the streak exactly like claimDaily (continuity = yesterday).
      var lastLogin = this.profile.lastLogin || 0;
      if (lastLogin === today - 1 || lastSpin === today - 1){
        this.profile.streak = Math.max(1, (this.profile.streak||0) + 1);
      } else if (lastLogin !== today && lastSpin !== today){
        this.profile.streak = 1;
      } else {
        this.profile.streak = Math.max(1, this.profile.streak||0);
      }
      // stamp BOTH day markers so the wheel and the legacy daily can't both fire
      // (the wheel IS the daily now) and re-opening can't double-grant.
      this.profile.lastSpin = today;
      this.profile.lastLogin = today;

      // grant the prize
      var coins = 0, cosmetic = null;
      if (seg.cosmetic){
        var cid = this._rollCosmeticId();
        if (cid){
          var entry = (COSMETIC_CATALOG[cid] || {});
          if (this.ownsCosmetic(cid)){
            // dup -> refund coins so the rare cosmetic slice is never a dead end
            coins = DUP_REFUND;
            this.addCoins(DUP_REFUND, 'spinDupRefund');
          } else {
            this._grantCosmetic(cid, entry.name);
            cosmetic = cid;
          }
        }
      } else if (seg.coins){
        coins = seg.coins;
        this.addCoins(seg.coins, 'dailySpin');
      }

      var result = {
        index: idx,
        coins: coins,
        cosmetic: cosmetic,
        miss: !!seg.miss,
        rare: !!seg.rare,
        label: seg.label || ''
      };
      this.profile.lastSpinResult = result;

      // 7-day milestone bonus (idempotent; fires only when streak hits a multiple
      // of 7 and only once per streak value — an ad-respin the same day re-enters
      // here but lastStreakBonus already covers it, so it never double-grants).
      var sb = this._grantStreakBonus();
      if (sb){ result.streakBonus = sb; }

      this.save();

      try { CA.events.emit('dailySpun', result, this.profile.streak); } catch(e){}
      // celebratory toast (a miss gets a softer one)
      if (cosmetic){
        // _grantCosmetic already pushed an "Új kinézet" toast; nothing extra needed.
      } else if (coins > 0){
        this._pushToast(CA.t('Napi pörgetés: +') + coins + CA.t(' érme'), '🎡');
      } else {
        this._pushToast(CA.t('Ma lepörgött — holnap újra!'), '😿');
      }

      return {
        ok: true,
        index: idx,
        segment: { coins:seg.coins||0, label:seg.label||'', cosmetic:!!seg.cosmetic,
                   miss:!!seg.miss, rare:!!seg.rare },
        coins: coins,
        cosmetic: cosmetic,
        streak: Math.max(0, Math.floor(this.profile.streak || 0))
      };
    },

    /* ====================================================================
     * #3 — ROTATING DAILY / WEEKLY CHALLENGES. Seeded subset of the pools,
     * with a resetAt window. Reuses _challengeAdvance kinds via _rotAdvance.
     * ==================================================================== */
    // start-of-day / start-of-(7-day)-window timestamps (local).
    _dayStart(){ return this._dayNum() * DAY_MS + new Date().getTimezoneOffset() * 60000; },
    _weekStart(){
      // week boundary = day-number rounded down to a 7-day block (stable, seed-friendly)
      var blk = Math.floor(this._dayNum() / 7) * 7;
      return blk * DAY_MS + new Date().getTimezoneOffset() * 60000;
    },
    _weekSeed(){ return Math.floor(this._dayNum() / 7) + 1; },
    // (re)roll the daily + weekly sets if their window has elapsed.
    _ensureChallenges(){
      var now = Date.now();
      var dc = this.profile.dailyChallenges;
      if (!dc || typeof dc !== 'object' || !dc.resetAt || now >= dc.resetAt){
        var dseed = this.dailySeed();
        var dset = seededSubset(DAILY_POOL, DAILY_COUNT, dseed);
        var ids = []; for (var i=0;i<dset.length;i++) ids.push(dset[i].id);
        this.profile.dailyChallenges = { resetAt: this._dayStart() + DAY_MS, ids: ids, progress: {} };
      }
      var wc = this.profile.weeklyChallenges;
      if (!wc || typeof wc !== 'object' || !wc.resetAt || now >= wc.resetAt){
        var wseed = this._weekSeed();
        var wset = seededSubset(WEEKLY_POOL, WEEKLY_COUNT, wseed);
        var wids = []; for (var j=0;j<wset.length;j++) wids.push(wset[j].id);
        this.profile.weeklyChallenges = { resetAt: this._weekStart() + 7 * DAY_MS, ids: wids, progress: {} };
      }
    },
    _rotDef(id){
      for (var i=0;i<DAILY_POOL.length;i++){ if (DAILY_POOL[i].id === id) return DAILY_POOL[i]; }
      for (var j=0;j<WEEKLY_POOL.length;j++){ if (WEEKLY_POOL[j].id === id) return WEEKLY_POOL[j]; }
      return null;
    },
    // advance every ACTIVE rotating challenge whose kind matches; reward on done.
    _rotAdvance(kind, amt){
      amt = (typeof amt === 'number' && amt > 0) ? amt : 1;
      this._ensureChallenges();
      var buckets = [this.profile.dailyChallenges, this.profile.weeklyChallenges];
      for (var b=0;b<buckets.length;b++){
        var bk = buckets[b];
        if (!bk || !Array.isArray(bk.ids)) continue;
        if (!bk.progress || typeof bk.progress !== 'object') bk.progress = {};
        for (var i=0;i<bk.ids.length;i++){
          var id = bk.ids[i], def = this._rotDef(id);
          if (!def || def.kind !== kind) continue;
          var st = bk.progress[id] || (bk.progress[id] = { progress:0, done:false });
          if (st.done) continue;
          st.progress = Math.min(def.goal, (st.progress||0) + amt);
          if (st.progress >= def.goal){ st.done = true; this._rewardRot(def); }
        }
      }
    },
    _rewardRot(def){
      var r = def.reward || {};
      if (r.coins) this.addCoins(r.coins, 'rotChallenge:'+def.id);
      if (r.xp) this.addXp(r.xp, 'rotChallenge:'+def.id);
      if (r.cosmetic) this._grantCosmetic(r.cosmetic);
      this._pushToast(CA.t('Kihívás kész: ') + CA.t(def.desc), '🎯');
      try { CA.events.emit('challengeDone', def.id, def); } catch(e){}
      this.save();
    },
    // accessor for the agent rendering the rotating challenges UI.
    // -> { daily:[{id,desc,progress,goal,done,reward}], weekly:[...], dailyResetAt, weeklyResetAt }
    rotatingChallenges(){
      this._ensureChallenges();
      var self = this;
      function pack(bk){
        var out = [];
        if (bk && Array.isArray(bk.ids)){
          for (var i=0;i<bk.ids.length;i++){
            var def = self._rotDef(bk.ids[i]); if (!def) continue;
            var st = (bk.progress && bk.progress[bk.ids[i]]) || { progress:0, done:false };
            out.push({ id:def.id, desc:def.desc, goal:def.goal,
              progress: Math.min(def.goal, st.progress||0), done:!!st.done, reward:def.reward });
          }
        }
        return out;
      }
      return {
        daily: pack(this.profile.dailyChallenges),
        weekly: pack(this.profile.weeklyChallenges),
        dailyResetAt: (this.profile.dailyChallenges && this.profile.dailyChallenges.resetAt) || 0,
        weeklyResetAt: (this.profile.weeklyChallenges && this.profile.weeklyChallenges.resetAt) || 0
      };
    },

    // Flat array adapter for the challenges UI (menu-achievements.js contract):
    // [{ id, label, desc, progress, goal, reward, period:'daily'|'weekly', done }].
    activeChallenges(){
      var rc = this.rotatingChallenges();
      var out = [];
      function add(arr, period){
        if (!Array.isArray(arr)) return;
        for (var i=0;i<arr.length;i++){
          var c = arr[i];
          out.push({ id:c.id, label:c.desc, desc:c.desc, progress:c.progress,
                     goal:c.goal, reward:c.reward, period:period, done:c.done });
        }
      }
      add(rc.daily, 'daily'); add(rc.weekly, 'weekly');
      return out;
    },

    /* ====================================================================
     * #4 — SEASON / BATTLE PASS. seasonXP earns tiers; FREE lane claimable by
     * all, PREMIUM lane needs profile.seasonPremium (bought with coins, no P2W).
     * Resets (new id, cleared claims) when seasonEnd passes.
     * ==================================================================== */
    _ensureSeason(){
      var now = Date.now();
      if (!this.profile.seasonId || !this.profile.seasonEnd || now >= this.profile.seasonEnd){
        var first = (!this.profile.seasonId);
        this.profile.seasonId = (this.profile.seasonId || 0) + 1;
        this.profile.seasonEnd = now + SEASON_LEN_DAYS * DAY_MS;
        this.profile.seasonXP = 0;
        this.profile.seasonClaimed = [];
        this.profile.seasonPremium = false;
        if (!first) this._pushToast(CA.t('Új szezon!'), '🌟');
      }
    },
    seasonInfo(){
      this._ensureSeason();
      return {
        id: this.profile.seasonId,
        name: SEASON_NAME,
        endsAt: this.profile.seasonEnd,
        xp: this.profile.seasonXP || 0,
        premium: !!this.profile.seasonPremium,
        premiumPrice: SEASON_PREMIUM_PRICE
      };
    },
    addSeasonXP(n){
      n = (typeof n === 'number' && isFinite(n)) ? n : 0;
      if (n <= 0) return;
      this._ensureSeason();
      this.profile.seasonXP = Math.max(0, (this.profile.seasonXP || 0) + n);
      this._saveSoon();
    },
    // the full pass for the UI: [{tier, xp, reached, free:{reward,claimed,claimable},
    //                             premium:{reward,claimed,claimable,locked}}]
    seasonPass(){
      this._ensureSeason();
      var x = this.profile.seasonXP || 0;
      var claimed = this.profile.seasonClaimed || (this.profile.seasonClaimed = []);
      var prem = !!this.profile.seasonPremium;
      var out = [];
      for (var i=0;i<SEASON_PASS.length;i++){
        var t = SEASON_PASS[i], reached = x >= t.xp;
        var fKey = 'free:'+t.tier, pKey = 'prem:'+t.tier;
        var fClaimed = claimed.indexOf(fKey) >= 0, pClaimed = claimed.indexOf(pKey) >= 0;
        out.push({
          tier: t.tier, xp: t.xp, reached: reached,
          free:    { reward:t.free,    label:this._rewardLabel(t.free),
                     claimed:fClaimed, claimable: reached && !fClaimed },
          premium: { reward:t.premium, label:this._rewardLabel(t.premium),
                     claimed:pClaimed, locked: !prem,
                     claimable: reached && prem && !pClaimed }
        });
      }
      return out;
    },
    // grant one pass reward. lane = 'free' | 'prem'. Returns true on success.
    claimSeasonReward(tier, lane){
      this._ensureSeason();
      lane = (lane === 'prem' || lane === 'premium') ? 'prem' : 'free';
      var def = null;
      for (var i=0;i<SEASON_PASS.length;i++){ if (SEASON_PASS[i].tier === tier){ def = SEASON_PASS[i]; break; } }
      if (!def) return false;
      if ((this.profile.seasonXP || 0) < def.xp) return false;           // tier not reached
      if (lane === 'prem' && !this.profile.seasonPremium) return false;  // premium locked
      var key = lane + ':' + tier;
      var claimed = this.profile.seasonClaimed || (this.profile.seasonClaimed = []);
      if (claimed.indexOf(key) >= 0) return false;                        // already claimed
      var r = (lane === 'prem') ? def.premium : def.free;
      this._grantReward(r, 'season:'+key);
      claimed.push(key);
      this.save();
      try { CA.events.emit('seasonClaimed', tier, lane); } catch(e){}
      return true;
    },
    // unlock the premium lane this season for coins (cosmetic-only).
    buySeasonPremium(){
      this._ensureSeason();
      if (this.profile.seasonPremium) return true;
      if (!this.spendCoins(SEASON_PREMIUM_PRICE)) return false;
      this.profile.seasonPremium = true;
      this.save();
      this._pushToast(CA.t('Prémium feloldva'), '⭐');
      try { CA.events.emit('seasonPremiumUnlocked', this.profile.seasonId); } catch(e){}
      return true;
    },

    /* ====================================================================
     * Generic reward granter (coins / xp / cosmetic / chest) — shared by the
     * level track, season pass, daily and campaign rewards. Returns a summary.
     * ==================================================================== */
    _grantReward(r, reason){
      var got = { coins:0, xp:0, cosmetic:null, chest:false };
      if (!r || typeof r !== 'object') return got;
      if (r.coins){ this.addCoins(r.coins, reason); got.coins = r.coins; }
      if (r.xp){ this.addXp(r.xp, reason); got.xp = r.xp; }
      if (r.cosmetic){ this._grantCosmetic(r.cosmetic); got.cosmetic = r.cosmetic; }
      if (r.chest){ var roll = this._chestRoll(); got.chest = true; got.cosmetic = (roll && roll.id) || got.cosmetic; }
      return got;
    },

    /* ====================================================================
     * #7 — COSMETIC GACHA / CHESTS. rarity-weighted roll over the catalog.
     * Dup -> coin refund. Free timed chest + paid coin chest.
     * ==================================================================== */
    // weighted random pick of a catalog id (by rarity weight). Returns id or null.
    _rollCosmeticId(){
      var ids = [], weights = [], total = 0;
      for (var id in COSMETIC_CATALOG){
        if (!COSMETIC_CATALOG.hasOwnProperty(id)) continue;
        var rar = COSMETIC_CATALOG[id].rarity || 'common';
        var w = RARITY_WEIGHT[rar] || 1;
        ids.push(id); weights.push(w); total += w;
      }
      if (!ids.length) return null;
      var r = Math.random() * total, acc = 0;
      for (var i=0;i<ids.length;i++){ acc += weights[i]; if (r <= acc) return ids[i]; }
      return ids[ids.length - 1];
    },
    // CONTRACT (transparency) — published per-chest drop odds, so a "fair odds"
    // screen can render exactly what _rollCosmeticId() does. The roll is uniform
    // across the whole catalog weighted by rarity, so EVERY chest (free, coin,
    // daily, level/season/campaign) shares these odds. Derived from the live
    // catalog + weights, never hard-coded, so it stays correct if either changes.
    // -> { rarities:[ { rarity, label, weight, chance, count, items:[id,...] } ],
    //      items:[ { id, name, rarity, label, chance } ],
    //      dupRefund, coinChestPrice }
    //   chance values are fractions in 0..1 (multiply by 100 for %); the per-item
    //   chance is its rarity's chance split evenly among items of that rarity.
    chestOdds(){
      var byRarity = {}, total = 0, items = [];
      for (var id in COSMETIC_CATALOG){
        if (!COSMETIC_CATALOG.hasOwnProperty(id)) continue;
        var rar = COSMETIC_CATALOG[id].rarity || 'common';
        var w = RARITY_WEIGHT[rar] || 1;
        if (!byRarity[rar]) byRarity[rar] = { rarity:rar, weight:w, count:0, items:[] };
        byRarity[rar].count++;
        byRarity[rar].items.push(id);
        total += w;
      }
      var rarities = [];
      // stable, intuitive display order
      var order = ['common','rare','epic','legendary'];
      var keys = [];
      for (var k in byRarity){ if (byRarity.hasOwnProperty(k)) keys.push(k); }
      keys.sort(function(a,b){
        var ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      for (var ri=0; ri<keys.length; ri++){
        var rk = keys[ri], grp = byRarity[rk];
        // probability of LANDING on this rarity = sum of its item weights / total.
        var groupChance = total > 0 ? (grp.weight * grp.count) / total : 0;
        var perItem = grp.count > 0 ? groupChance / grp.count : 0;
        rarities.push({
          rarity: rk,
          label: RARITY_LABEL[rk] || rk,
          weight: grp.weight,
          chance: +groupChance.toFixed(4),
          count: grp.count,
          items: grp.items.slice()
        });
        for (var ii=0; ii<grp.items.length; ii++){
          var iid = grp.items[ii], ent = COSMETIC_CATALOG[iid] || {};
          items.push({
            id: iid,
            name: ent.name || iid,
            rarity: rk,
            label: RARITY_LABEL[rk] || rk,
            chance: +perItem.toFixed(4)
          });
        }
      }
      return {
        rarities: rarities,
        items: items,
        dupRefund: DUP_REFUND,
        coinChestPrice: COIN_CHEST_PRICE
      };
    },
    // perform one chest roll: grant a cosmetic (or refund coins on a dup).
    // Returns { id, rarity, dup, refund }.
    _chestRoll(){
      var id = this._rollCosmeticId();
      if (!id) return null;
      var entry = COSMETIC_CATALOG[id] || {};
      var dup = this.ownsCosmetic(id);
      var res = { id:id, name:entry.name||id, rarity:entry.rarity||'common', dup:dup, refund:0 };
      if (dup){
        res.refund = DUP_REFUND;
        this.addCoins(DUP_REFUND, 'chestDup');
        this._pushToast(CA.t('Már megvan ez a kinézet — +érme jóváírva'), '🪙');
      } else {
        this._grantCosmetic(id, entry.name);
        this._pushToast(CA.t('Láda nyitva!'), '🎁');
      }
      try { CA.events.emit('chestOpened', res); } catch(e){}
      // CHEST-open sfx — once per roll (guarded). (A dup also triggers a faint
      // 'coin' via the refund addCoins above — that's fine, you got coins back.)
      try { CA.events.emit('sfx','chest'); } catch(e){}
      this.save();
      return res;
    },
    // is the free (timed) chest available now?
    freeChestReady(){
      var last = this.profile.lastChest || 0;
      return (Date.now() - last) >= FREE_CHEST_COOLDOWN;
    },
    freeChestReadyAt(){ return (this.profile.lastChest || 0) + FREE_CHEST_COOLDOWN; },
    // open the free timed chest. Returns the roll result or null if on cooldown.
    openFreeChest(){
      if (!this.freeChestReady()) return null;
      this.profile.lastChest = Date.now();
      var res = this._chestRoll();
      this.save();
      return res;
    },
    // open a chest paid with coins. Returns the roll result or null if too poor.
    openCoinChest(){
      if (!this.spendCoins(COIN_CHEST_PRICE)) return null;
      return this._chestRoll();
    },

    /* ====================================================================
     * #6 — BUY A COSMETIC DIRECTLY (shop). Spends its catalog price.
     * Returns true on success, false if unaffordable / unknown / already owned.
     * ==================================================================== */
    buyCosmetic(id){
      if (!id || !COSMETIC_CATALOG[id]) return false;
      if (this.ownsCosmetic(id)) return false;
      var price = COSMETIC_CATALOG[id].price || 0;
      if (!this.spendCoins(price)) return false;
      this._grantCosmetic(id, COSMETIC_CATALOG[id].name);
      this._pushToast(CA.t('Megvásárolva!'), '🛍️');
      return true;
    },

    /* ====================================================================
     * #8 / #9 — MASTERIES (data).
     * classMastery: rank from class XP that OVERFLOWS past a fully-bought tree.
     * weaponMastery: tier from the lifetime weaponUse{} tally.
     * ==================================================================== */
    // class XP needed to fully fund the tree = points-to-fill * classXpForLevel step.
    // We approximate "full tree" as the XP for class level (1 + total tree points),
    // then every extra full level past that = +1 mastery rank.
    _classTreeMaxPoints(cls){
      try {
        var def = CA.Classes && CA.Classes[cls];
        var tree = def && Array.isArray(def.tree) ? def.tree : null;
        if (!tree) return 4; // sensible default (trees are 4-node)
        var sum = 0;
        for (var i=0;i<tree.length;i++){ var mx = tree[i] && tree[i].max; sum += (typeof mx === 'number' && mx > 0) ? mx : 1; }
        return sum || 4;
      } catch(e){ return 4; }
    },
    // CONTRACT — class mastery rank (0 until the tree is fundable, then +1 per
    // full class level earned beyond that).
    classMastery(cls){
      if (!validClassId(cls)) return 0;
      var fullLevel = 1 + this._classTreeMaxPoints(cls); // level at which tree can be fully bought
      var fullXP = this.classXpForLevel(fullLevel);
      var xp = this.classXP(cls);
      if (xp <= fullXP) return 0;
      var lvl = this.classLevelFor(xp);
      return Math.max(0, lvl - fullLevel);
    },

    // CONTRACT — weapon mastery from lifetime use. -> { tier, xp } where xp = uses.
    weaponMastery(id){
      var uses = 0;
      if (id){
        var wu = (this.profile.stats && this.profile.stats.weaponUse) || {};
        var v = wu[id];
        if (typeof v === 'number' && isFinite(v) && v > 0) uses = Math.floor(v);
      }
      var tier = 0;
      for (var i=0;i<WEAPON_MASTERY_TIERS.length;i++){ if (uses >= WEAPON_MASTERY_TIERS[i]) tier = i; }
      return { tier: tier, xp: uses };
    },

    /* ====================================================================
     * Campaign stars + one-time rewards. CONTRACT (called by the modes agent).
     * ==================================================================== */
    // store the best star count (0..3) for a campaign level.
    setCampaignStars(level, stars){
      if (level == null) return;
      stars = (typeof stars === 'number' && isFinite(stars)) ? Math.max(0, Math.min(3, Math.floor(stars))) : 0;
      var cs = this.profile.campaignStars || (this.profile.campaignStars = {});
      var key = String(level);
      if ((cs[key] || 0) < stars){ cs[key] = stars; this.save(); }
      return cs[key];
    },
    campaignStars(level){
      var cs = this.profile.campaignStars || {};
      if (level == null) return cs;
      var v = cs[String(level)];
      return (typeof v === 'number') ? v : 0;
    },
    // grant the reward for clearing a campaign level at `stars`, ONCE per star
    // tier reached (so a 3-star replay after a 1-star clear still pays the delta).
    // coins + an occasional cosmetic per milestone level. Returns granted summary.
    grantCampaignReward(level, stars){
      if (level == null) return null;
      stars = (typeof stars === 'number' && isFinite(stars)) ? Math.max(0, Math.min(3, Math.floor(stars))) : 0;
      this.setCampaignStars(level, stars);
      var cr = this.profile.campaignRewarded || (this.profile.campaignRewarded = {});
      var key = String(level);
      var paid = (typeof cr[key] === 'number') ? cr[key] : 0;
      if (stars <= paid) return null; // already paid this tier or better
      var got = { coins:0, cosmetic:null };
      // pay the per-star delta: 100 coins / star, +XP, milestone cosmetic at 3★.
      var deltaStars = stars - paid;
      var coins = deltaStars * 100 + level * 20;
      this.addCoins(coins, 'campaign:'+level); got.coins = coins;
      this.addXp(deltaStars * 40 + 30, 'campaign:'+level);
      // every 3rd level fully 3-starred drops a chest; 3★ ⇒ small chest chance.
      if (stars >= 3){ var roll = this._chestRoll(); got.cosmetic = roll && roll.id; }
      cr[key] = stars;
      this.save();
      try { CA.events.emit('campaignRewarded', level, stars, got); } catch(e){}
      this._pushToast(CA.t('Kampány jutalom: +') + coins + CA.t(' érme'), '🏅');
      return got;
    },

    /* ---- Daily seed (#38) ------------------------------------------------- */
    dailySeed(){
      try {
        var d = new Date();
        return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
      } catch(e){
        return 20260101;
      }
    }
  };
})();
