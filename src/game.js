/**
 * Emberfall's deterministic, renderer-independent combat simulation.
 * Coordinates are metres on an X/Z plane; facing 0 points towards +Z.
 */

import { WORLD, AQUEDUCT_WORLD, ZONES, containsPoint, constrainMove, canTravel, unlockedSurfaces, navigationTarget, zoneAt } from './world.js';
import { EQUIPMENT, STARTER_WEAPON_IDS, DEFAULT_WEAPON_ID, equipmentById } from './content.js';
import { t } from './i18n.js';

const TAU = Math.PI * 2;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export const ROOMS = ZONES;
export const MAX_ACTIVE_ENEMIES = 36;

const ENEMY_STATS = {
  fodder: { hp: 42, damage: 6, speed: 2.55, radius: 0.34, xp: 2, range: 1.65, cooldown: 2.1, windup: 0.72 },
  melee: { hp: 135, damage: 13, speed: 2.05, radius: 0.48, xp: 8, range: 1.9, cooldown: 1.7, windup: 0.6 },
  ranged: { hp: 105, damage: 12, speed: 1.45, radius: 0.44, xp: 10, range: 9, cooldown: 2.5, windup: 0.85 },
  brute: { hp: 270, damage: 24, speed: 1.25, radius: 0.72, xp: 18, range: 2.6, cooldown: 3.1, windup: 1.05 },
  boss: { hp: 4200, damage: 32, speed: 1.2, radius: 1.1, xp: 120, range: 3.5, cooldown: 2.5, windup: 1.15 },
};

const UPGRADES = [
  { id: 'edge', name: '淬火锋刃', description: '普通攻击伤害 +7。', icon: 'sword', apply: p => { p.damage += 7; } },
  { id: 'heart', name: '余火之心', description: '最大生命 +24，并恢复 36 点生命。', icon: 'heart', apply: p => { p.maxHp += 24; p.hp = Math.min(p.maxHp, p.hp + 36); } },
  { id: 'fury', name: '疾风连斩', description: '普通攻击速度 +14%。', icon: 'bolt', available: p => p.attackInterval > 0.23, apply: p => { p.attackInterval = Math.max(0.21, p.attackInterval * 0.86); } },
  { id: 'reach', name: '长夜之刃', description: '攻击范围 +0.35 米，伤害 +2。', icon: 'sword', available: p => p.attackRange < 4, apply: p => { p.attackRange += 0.35; p.damage += 2; } },
  { id: 'critical', name: '猎杀本能', description: '暴击概率 +9%，暴击造成双倍伤害。', icon: 'eye', available: p => p.critChance < 0.53, apply: p => { p.critChance = Math.min(0.6, p.critChance + 0.09); } },
  { id: 'ward', name: '黑曜护甲', description: '受到的伤害降低 8%。', icon: 'shield', available: p => p.armor < 0.39, apply: p => { p.armor = Math.min(0.45, p.armor + 0.08); } },
  { id: 'ember', name: '元素回响', description: '元素技能基础伤害 +22，基础冷却缩短 12%。', icon: 'flame', apply: p => { p.skillDamage += 22; p.skillCooldown = Math.max(3.5, p.skillCooldown * 0.88); } },
  { id: 'step', name: '幻影步', description: '闪避冷却缩短 18%，移动速度 +0.15。', icon: 'wing', available: p => p.dashCooldown > 0.68, apply: p => { p.dashCooldown = Math.max(0.6, p.dashCooldown * 0.82); p.speed += 0.15; } },
  { id: 'siphon', name: '饮魂刻印', description: '每击败一个敌人恢复 2 点生命。', icon: 'drop', apply: p => { p.lifeOnKill += 2; } },
  { id: 'renewal', name: '不灭余烬', description: '每秒恢复 0.7 点生命。', icon: 'sun', available: p => p.regen < 2.5, apply: p => { p.regen += 0.7; } },
  { id: 'flask', name: '炼金遗产', description: '获得 2 瓶药水，药水恢复量 +12。', icon: 'potion', apply: p => { p.potions = Math.min(p.maxPotions, p.potions + 2); p.potionHeal += 12; } },
  { id: 'thorns', name: '荆棘誓约', description: '受到近身攻击时，向攻击者反射 16 点伤害。', icon: 'thorn', apply: p => { p.thorns += 16; } },
];

function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.trunc(seed) >>> 0;
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function rngFromSeed(seed) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeLoadout({ runId = null, weaponId = DEFAULT_WEAPON_ID, unlockedWeapons = [], bonuses, campBonuses, supply = null }) {
  const inventory = [...new Set([...STARTER_WEAPON_IDS, ...(Array.isArray(unlockedWeapons) ? unlockedWeapons.filter(id => equipmentById(id)) : [])])];
  const source = bonuses ?? campBonuses ?? {};
  const limits = { maxHp: 60, skillDamage: 40, damage: 12, armor: 0.15 };
  const safeBonuses = Object.fromEntries(Object.entries(limits).map(([key, max]) => [key, Number.isFinite(source?.[key]) ? Math.max(0, Math.min(max, source[key])) : 0]));
  safeBonuses.damageMultiplier = Number.isFinite(source?.damageMultiplier) ? Math.max(1, Math.min(1.15, source.damageMultiplier)) : 1;
  const supplies = { tonic: 'damage-tonic', ward: 'ward-charm', 'damage-tonic': 'damage-tonic', 'ward-charm': 'ward-charm' };
  const supplyId = typeof supply === 'object' && supply !== null ? supply.id : supply;
  return { runId: typeof runId === 'string' ? runId.slice(0, 128) : null, inventory, weaponId: inventory.includes(weaponId) ? weaponId : DEFAULT_WEAPON_ID, bonuses: safeBonuses, supply: Object.hasOwn(supplies, supplyId) ? supplies[supplyId] : null };
}

export class Game {
  constructor({ seed = Date.now(), difficulty = 'normal', expeditionId = 'grave', ...loadout } = {}) {
    this.seed = normalizeSeed(seed);
    this._setExpedition(expeditionId);
    this.difficulty = ['story', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal';
    this._loadout = normalizeLoadout(loadout);
    this.startingWeaponId = this._loadout.weaponId;
    this._initialize();
  }

  _setExpedition(id) {
    this.expeditionId = id === 'aqueduct' ? 'aqueduct' : 'grave';
    this.world = this.expeditionId === 'aqueduct' ? AQUEDUCT_WORLD : WORLD;
    this.rooms = this.world.zones;
    this.bossName = this.expeditionId === 'aqueduct' ? '幽潮守望者' : '丧钟守卫';
    this.expedition = { id: this.expeditionId, bossName: this.bossName };
  }

  _initialize() {
    this.random = rngFromSeed(this.seed);
    this._nextId = 1;
    this._events = [];
    this._held = {};
    this._pendingLevels = 0;
    this._levelRevealAt = 0;
    this._waveTimer = 0;
    this._roomEnding = false;
    this.status = 'menu';
    this.time = 0;
    this.kills = 0;
    this.eliteKills = 0;
    this.bossKills = 0;
    this.elementKills = { fire: 0, lightning: 0, water: 0 };
    this.bestCombo = 0;
    this._killStreak = { count: 0, lastTime: -Infinity, refund: 0 };
    this.gold = 0;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.roomIndex = 0;
    this.roomName = this.rooms[0].name;
    this.roomSubtitle = this.rooms[0].subtitle;
    this.roomTheme = this.rooms[0].theme;
    this.roomCleared = false;
    this.rewardReady = false;
    this.roomRewardTaken = false;
    this.visitedZoneIds = new Set();
    this.clearedZoneIds = new Set();
    this.completedPoiIds = new Set();
    this.bossWard = 0;
    this.interactionChannel = null;
    this.hazards = [];
    this._hazardClock = 6;
    this.interestPoints = this.world.interestPoints.map(point => ({ ...point, reward: { ...point.reward }, completed: false, available: point.zoneIndex === 0 }));
    this._allowedSurfaces = unlockedSurfaces(0, false, this.world);
    this._waypointCache = null;
    this.waveIndex = 0;
    this.waveCount = this.rooms[0].waves.length;
    this.roomKills = 0;
    this.roomEnemyCount = 0;
    this.choices = [];
    this.choiceReason = null;
    this.enemies = [];
    this.projectiles = [];
    this.telegraphs = [];
    this.drops = [];
    this.boons = [];
    this.inventory = [...this._loadout.inventory];
    this.runId = this._loadout.runId;
    this.supply = this._loadout.supply;
    this.weaponId = this.startingWeaponId;
    this.skillCooldowns = { fire: 0, lightning: 0, water: 0 };
    this.activeBuffs = [];
    this.areas = [];
    this._combo = 0;
    this._lastAttackTime = -Infinity;
    this.exit = { ...this.rooms[0].exit, radius: 3.2 };
    this.chest = null;
    const story = this.difficulty === 'story';
    this.player = {
      ...this.world.spawn, radius: 0.48, facing: Math.PI,
      hp: story ? 150 : 120, maxHp: story ? 150 : 120,
      level: 1, xp: 0, xpNext: 100,
      damage: 26, speed: 5.0,
      potions: 3, maxPotions: 5, potionHeal: 55, potionCd: 0,
      dashCd: 0, dashCooldown: 1.45, dashTime: 0, dashDuration: 0.23,
      skillCd: 0, skillCooldown: 5.6, skillDamage: 104, skillRadius: 6.2,
      attackCd: 0, attackInterval: 0.46, attackRange: 2.75, attackArc: Math.PI * 0.88,
      invulnerable: 0, critChance: 0.08, armor: 0, lifeOnKill: 0, regen: 0, thorns: 0,
      dashX: 0, dashZ: -1, moving: false,
      shield: this.supply === 'ward-charm' ? 35 : 0, wardShield: this.supply === 'ward-charm' ? 35 : 0,
    };
    for (const key of ['maxHp', 'skillDamage', 'damage', 'armor']) this.player[key] += this._loadout.bonuses[key];
    this.player.hp = this.player.maxHp;
    // Existing HUD/controls read and write player.skillCd. The actual timer is
    // owned by the element, so switching two weapons never clears a cooldown.
    Object.defineProperty(this.player, 'skillCd', {
      enumerable: true, configurable: false,
      get: () => this.skillCooldowns[this.weapon.element],
      set: value => { this.skillCooldowns[this.weapon.element] = Math.max(0, Number(value) || 0); },
    });
  }

  start() {
    this._initialize();
    this.status = 'playing';
    this._enterRoom(0);
    return this;
  }

  reset({ seed = this.seed, difficulty = this.difficulty, weaponId = this.startingWeaponId, unlockedWeapons = this._loadout.inventory, bonuses, campBonuses, supply = this._loadout.supply, runId = this.runId, expeditionId = this.expeditionId } = {}) {
    this.seed = normalizeSeed(seed);
    this._setExpedition(expeditionId);
    this.difficulty = ['story', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal';
    this._loadout = normalizeLoadout({ runId, weaponId, unlockedWeapons, bonuses: bonuses ?? campBonuses ?? this._loadout.bonuses, supply });
    this.startingWeaponId = this._loadout.weaponId;
    return this.start();
  }

  get weapon() { return equipmentById(this.weaponId); }
  get runSummary() {
    const won = this.status === 'won';
    return { runId: this.runId, expeditionId: this.expeditionId, outcome: won ? 'won' : this.status === 'dead' ? 'dead' : 'abandoned', won,
      kills: this.kills, eliteKills: this.eliteKills, bossKills: this.bossKills, elementKills: { ...this.elementKills },
      clearedZones: [...this.clearedZoneIds], poiIds: [...this.completedPoiIds], sideRelics: this.interestPoints.filter(point => point.completed && ['relic', 'supply'].includes(point.kind)).length,
      gold: this.gold, goldEarned: this.gold, inventory: [...this.inventory], weaponId: this.weapon.id,
      room: this.roomIndex + 1, time: this.time, duration: this.time, bestCombo: this.bestCombo };
  }

  get nearestInteraction() {
    const candidates = this.interestPoints.filter(point => point.available && !point.completed && distance(this.player, point) <= point.radius && this._lineOfSight(this.player, point));
    if (candidates.length) {
      const point = candidates.sort((a, b) => distance(this.player, a) - distance(this.player, b))[0];
      return { ...point, label: point.name, distance: distance(this.player, point) };
    }
    if (this.rewardReady) return { id: `room-reward-${this.roomIndex}`, kind: 'reward', name: '领取祝福', label: '领取祝福', ...(this.chest ?? this.player), completed: false };
    return null;
  }
  get combatStats() { return this.statsForWeapon(this.weaponId); }
  statsForWeapon(id) {
    const weapon = equipmentById(id);
    if (!weapon) return null;
    const p = this.player, w = weapon.stats;
    const fury = this.activeBuffs.find(b => b.id === 'flame-fury')?.power ?? 0;
    const haste = this.activeBuffs.find(b => b.id === 'storm-haste')?.power ?? 0;
    const loadoutDamage = this._loadout.bonuses.damageMultiplier * (this.supply === 'damage-tonic' ? 1.12 : 1);
    const attackInterval = Math.max(0.12, p.attackInterval * w.attackInterval / (1 + haste));
    return {
      damage: p.damage * w.damage * (1 + fury) * loadoutDamage, attackInterval, attackDuration: attackInterval,
      attackRange: p.attackRange + w.attackRange, attackArc: Math.min(TAU, p.attackArc * w.attackArc),
      skillDamage: p.skillDamage * w.skillDamage * (1 + fury) * loadoutDamage, skillRadius: p.skillRadius + w.skillRadius,
      skillCooldown: Math.max(2, p.skillCooldown * w.skillCooldown),
      speed: p.speed, armor: p.armor, critChance: p.critChance,
    };
  }

  equipWeapon(id) {
    if (!['menu', 'playing', 'upgrade'].includes(this.status) || !this.inventory.includes(id) || !equipmentById(id)) return false;
    if (id === this.weaponId) return true;
    const previousWeaponId = this.weaponId;
    this.weaponId = id;
    this._combo = 0;
    this._emit('equip', { weaponId: id, previousWeaponId, element: this.weapon.element, name: this.weapon.name, className: this.weapon.className });
    return true;
  }

  cycleWeapon() {
    const elements = ['fire', 'lightning', 'water'];
    const element = elements[(elements.indexOf(this.weapon.element) + 1) % elements.length];
    const next = EQUIPMENT.filter(item => item.element === element && this.inventory.includes(item.id)).sort((a, b) => b.tier - a.tier)[0];
    return next ? this.equipWeapon(next.id) : false;
  }

  _grantEquipment(id, source = 'drop') {
    const weapon = equipmentById(id);
    if (!weapon || this.inventory.includes(id)) return false;
    this.inventory.push(id);
    this._emit('equipment', { weaponId: id, name: weapon.name, element: weapon.element, tier: weapon.tier, source });
    return true;
  }

  get progress() { return (this.roomIndex + (this.roomCleared ? 1 : 0)) / this.rooms.length; }
  get roomLabel() { return `${this.roomIndex + 1} / ${this.rooms.length}`; }
  get roomProgress() { return { kills: this.roomKills, total: this.roomEnemyCount, wave: this.waveIndex + 1, waves: this.waveCount }; }
  get currentZoneId() { return zoneAt(this.player.x, this.player.z, this.world)?.id ?? null; }
  get nextWaypoint() {
    const zone = this.rooms[this.roomIndex];
    if (this.status === 'won') return { ...zone.center, kind: 'victory', label: zone.name };
    if (!this.roomCleared) return { ...zone.center, kind: 'fight', label: zone.name };
    if (!this.roomRewardTaken) return { ...(this.chest ?? zone.center), kind: 'reward', label: '领取祝福' };
    const next = this.rooms[this.roomIndex + 1];
    if (!next) return { ...zone.center, kind: 'victory', label: zone.name };
    if (!this._waypointCache || this.time - this._waypointCache.time > 0.4) {
      this._waypointCache = { time: this.time, ...navigationTarget(this.player, next.entry, this.player.radius, this._allowedSurfaces, this.world.navPoints) };
    }
    return { x: this._waypointCache.x, z: this._waypointCache.z, kind: 'travel', label: next.name };
  }
  get objective() {
    if (this.status === 'won') return t('{zone}已清除', { zone: t(this.rooms.at(-1).name) });
    if (!this.roomCleared) return t('清除守卫 · {count} 名', { count: this.enemies.length });
    if (!this.roomRewardTaken) return t('按 E 领取祝福');
    return t('沿墓道前往{zone}', { zone: t(this.rooms[this.roomIndex + 1]?.name ?? '祭坛') });
  }

  drainEvents() {
    const events = this._events;
    this._events = [];
    return events;
  }

  _emit(type, data = {}) {
    this._events.push({ type, time: this.time, ...data });
  }

  update(dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Keep collisions stable even if a caller uses a low frame rate. Hidden-tab
    // time is deliberately discarded instead of killing a player on resume.
    dt = Math.min(dt, 0.1);
    if (this.status !== 'playing') {
      this._held = { dash: !!input.dash, skill: !!input.skill, potion: !!input.potion, interact: !!input.interact };
      return;
    }
    const pressed = {};
    for (const key of ['dash', 'skill', 'potion', 'interact']) pressed[key] = !!input[key] && !this._held[key];
    this._held = { dash: !!input.dash, skill: !!input.skill, potion: !!input.potion, interact: !!input.interact };
    const steps = Math.ceil(dt / (1 / 60));
    for (let step = 0; step < steps && this.status === 'playing'; step++) {
      this._tick(dt / steps, input, step === 0 ? pressed : {});
    }
  }

  _tick(dt, input, pressed) {
    this.time += dt;
    const p = this.player;
    for (const key of ['attackCd', 'dashCd', 'potionCd', 'invulnerable']) p[key] = Math.max(0, p[key] - dt);
    for (const element of Object.keys(this.skillCooldowns)) this.skillCooldowns[element] = Math.max(0, this.skillCooldowns[element] - dt);
    this._updateBuffs(dt);
    if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

    let mx = Number.isFinite(input.moveX) ? input.moveX : 0;
    let mz = Number.isFinite(input.moveZ) ? input.moveZ : 0;
    const moveLength = Math.hypot(mx, mz);
    if (moveLength > 1) { mx /= moveLength; mz /= moveLength; }
    const ax = Number.isFinite(input.aimX) ? input.aimX : 0;
    const az = Number.isFinite(input.aimZ) ? input.aimZ : 0;
    if (Math.hypot(ax, az) > 0.001) p.facing = Math.atan2(ax, az);
    else if (moveLength > 0.001) p.facing = Math.atan2(mx, mz);
    p.moving = moveLength > 0.05 || p.dashTime > 0;

    if (pressed.potion) this._drinkPotion();
    if (pressed.dash && p.dashCd <= 0) {
      const length = Math.hypot(mx, mz);
      p.dashX = length > 0.01 ? mx / length : Math.sin(p.facing);
      p.dashZ = length > 0.01 ? mz / length : Math.cos(p.facing);
      p.dashTime = p.dashDuration;
      p.dashCd = p.dashCooldown;
      p.invulnerable = Math.max(p.invulnerable, p.dashDuration + 0.08);
      this._emit('dash', { x: p.x, z: p.z, facing: Math.atan2(p.dashX, p.dashZ) });
    }
    let targetX = p.x, targetZ = p.z;
    if (p.dashTime > 0) {
      const dashDt = Math.min(dt, p.dashTime);
      targetX += p.dashX * 18 * dashDt;
      targetZ += p.dashZ * 18 * dashDt;
      p.dashTime = Math.max(0, p.dashTime - dt);
    } else {
      targetX += mx * p.speed * dt;
      targetZ += mz * p.speed * dt;
    }
    Object.assign(p, constrainMove(p.x, p.z, targetX, targetZ, p.radius, this._allowedSurfaces));
    this._checkWorldProgress();

    if (input.attack && p.attackCd <= 0) this._attack();
    if (pressed.skill && p.skillCd <= 0) this._castSkill();
    if (pressed.interact) this.interact();
    if (this.status !== 'playing') return;
    this._updateInteraction(dt, !!input.interact);
    this._updateHazards(dt);
    if (this.status !== 'playing') return;

    this._updateAreas(dt);
    this._updateEnemies(dt);
    if (this.status !== 'playing') return;
    this._updateProjectiles(dt);
    if (this.status !== 'playing') return;
    this._updateDrops(dt);
    this._resolveWave(dt);
    if (this.status === 'playing') this._showPendingLevel();
  }

  _attack() {
    const p = this.player;
    const stats = this.combatStats, weapon = this.weapon;
    if (this.time - this._lastAttackTime > 1.6) this._combo = 0;
    const combo = this._combo;
    this._combo = (this._combo + 1) % 3;
    this._lastAttackTime = this.time;
    p.attackCd = stats.attackInterval;
    this._emit('attack', { x: p.x, z: p.z, facing: p.facing, range: stats.attackRange, arc: stats.attackArc, element: weapon.element, weaponId: weapon.id, variant: weapon.variant, combo, duration: stats.attackInterval });
    for (const enemy of [...this.enemies]) {
      if (enemy.hp <= 0) continue;
      const d = distance(p, enemy);
      const angle = Math.atan2(enemy.x - p.x, enemy.z - p.z);
      if (d <= stats.attackRange + enemy.radius && (d < 0.9 || Math.abs(angleDelta(angle, p.facing)) <= stats.attackArc / 2) && canTravel(p.x, p.z, enemy.x, enemy.z, 0.05, this._allowedSurfaces)) {
        const critical = this.random() < stats.critChance;
        this._damageEnemy(enemy, stats.damage * (critical ? 2 : 1) * (combo === 2 ? 1.15 : 1), 'attack', critical);
        const knock = enemy.type === 'boss' ? 0.06 : enemy.type === 'brute' ? 0.14 : 0.34;
        Object.assign(enemy, constrainMove(enemy.x, enemy.z, enemy.x + Math.sin(angle) * knock, enemy.z + Math.cos(angle) * knock, enemy.radius, this._allowedSurfaces));
      }
    }
  }

  _castSkill() {
    if (this.status !== 'playing' || this.player.skillCd > 0) return false;
    const p = this.player, stats = this.combatStats, weapon = this.weapon, config = weapon.skill;
    const targets = [], chain = [], hitIds = new Set(), killsBefore = this.kills;
    p.skillCd = stats.skillCooldown;
    for (const enemy of [...this.enemies]) {
      if (enemy.hp > 0 && distance(p, enemy) <= stats.skillRadius + enemy.radius && this._lineOfSight(p, enemy)) {
        targets.push({ id: enemy.id, x: enemy.x, z: enemy.z, elite: enemy.elite }); hitIds.add(enemy.id);
        this._damageEnemy(enemy, stats.skillDamage, 'skill', false, weapon.element);
        this._stunEnemy(enemy, config.stun);
        this._knockEnemy(enemy, p, config.knockback);
        if (weapon.element === 'water') this._slowEnemy(enemy, config.slow, config.slowDuration);
      }
    }
    if (weapon.element === 'lightning') {
      let origins = targets.length ? [...targets] : [p];
      for (let i = 0; i < config.chainCount; i++) {
        let best = null;
        for (const origin of origins) for (const enemy of this.enemies) {
          const d = distance(origin, enemy);
          if (enemy.hp > 0 && !hitIds.has(enemy.id) && d <= config.chainRange && this._lineOfSight(origin, enemy) && (!best || d < best.distance)) best = { origin, enemy, distance: d };
        }
        if (!best) break;
        const point = { id: best.enemy.id, x: best.enemy.x, z: best.enemy.z, elite: best.enemy.elite };
        chain.push({ from: { x: best.origin.x, z: best.origin.z }, to: point }); targets.push(point); hitIds.add(point.id);
        this._damageEnemy(best.enemy, stats.skillDamage * config.chainScale, 'chain', false, weapon.element);
        this._stunEnemy(best.enemy, config.stun);
        this._knockEnemy(best.enemy, best.origin, config.knockback);
        origins = [point];
      }
      this._applyBuff({ id: 'storm-haste', name: '疾电', element: 'lightning', duration: config.buffDuration, power: config.haste });
    } else if (weapon.element === 'fire') {
      this._applyBuff({ id: 'flame-fury', name: '余火昂扬', element: 'fire', duration: config.buffDuration, power: config.damageBoost });
    } else {
      const shield = config.shield + p.maxHp * config.shieldHealthScale;
      // Refreshing replaces the pool instead of adding another full shield.
      p.shield = shield + p.wardShield;
      this._applyBuff({ id: 'tide-shield', name: '潮汐护盾', element: 'water', duration: config.buffDuration, power: shield });
    }
    this.areas.push({ id: this._nextId++, element: weapon.element, weaponId: weapon.id, variant: weapon.variant, x: p.x, z: p.z,
      radius: stats.skillRadius, duration: config.duration, remaining: config.duration, interval: config.interval ?? Infinity,
      tickRemaining: config.interval ?? Infinity, damage: config.dotScale ? stats.skillDamage * config.dotScale * config.interval : stats.skillDamage * (config.pulseScale ?? 0),
      slow: config.slow ?? 0, slowDuration: config.slowDuration ?? 0 });
    this._emit('skill', { x: p.x, z: p.z, radius: stats.skillRadius, amount: stats.skillDamage, duration: config.duration, element: weapon.element, weaponId: weapon.id, variant: weapon.variant, targets, chain,
      hitCount: targets.length, kills: this.kills - killsBefore, eliteHits: targets.filter(target => target.elite).length });
    // Each visible wave clears bolts only on its own side of a wall.
    this.projectiles = this.projectiles.filter(bolt => distance(p, bolt) > stats.skillRadius || !this._lineOfSight(p, bolt));
    return true;
  }

  _lineOfSight(a, b) { return canTravel(a.x, a.z, b.x, b.z, 0.05, this._allowedSurfaces); }

  _knockEnemy(enemy, origin, strength = 0) {
    if (enemy.hp <= 0 || strength <= 0) return;
    const dx = enemy.x - origin.x, dz = enemy.z - origin.z, length = Math.hypot(dx, dz) || 1;
    const power = strength * (enemy.type === 'boss' ? 0.06 : enemy.type === 'brute' || enemy.elite ? 0.35 : 1);
    Object.assign(enemy, constrainMove(enemy.x, enemy.z, enemy.x + dx / length * power, enemy.z + dz / length * power, enemy.radius, this._allowedSurfaces));
    enemy.navTime = 0;
  }

  _stunEnemy(enemy, duration = 0) {
    if (enemy.hp <= 0 || duration <= 0) return;
    enemy.stun = Math.max(enemy.stun, enemy.type === 'boss' ? Math.min(duration, 0.16) : duration);
    if (enemy.type !== 'boss') this._cancelAttack(enemy);
  }

  _slowEnemy(enemy, strength, duration) {
    if (enemy.hp <= 0) return;
    enemy.slowFactor = Math.min(enemy.slowRemaining > 0 ? enemy.slowFactor : 1, 1 - strength * (enemy.type === 'boss' ? 0.6 : 1));
    enemy.slowRemaining = Math.max(enemy.slowRemaining, duration);
  }

  _applyBuff(data) {
    const existing = this.activeBuffs.find(buff => buff.id === data.id);
    const buff = { ...data, remaining: data.duration, stacks: 1 };
    if (existing) Object.assign(existing, buff);
    else this.activeBuffs.push(buff);
    this._emit('buff', { ...buff, action: existing ? 'refresh' : 'apply' });
  }

  _removeBuff(id) {
    const buff = this.activeBuffs.find(item => item.id === id);
    if (!buff) return;
    this.activeBuffs = this.activeBuffs.filter(item => item.id !== id);
    if (id === 'tide-shield') this.player.shield = this.player.wardShield;
    this._emit('buff', { ...buff, remaining: 0, action: 'expire' });
  }

  _updateBuffs(dt) {
    for (const buff of [...this.activeBuffs]) {
      buff.remaining = Math.max(0, buff.remaining - dt);
      if (buff.remaining <= 0) this._removeBuff(buff.id);
    }
  }

  _updateAreas(dt) {
    for (const area of this.areas) {
      const elapsed = Math.min(dt, area.remaining);
      area.remaining = Math.max(0, area.remaining - dt);
      area.tickRemaining -= elapsed;
      const targets = this.enemies.filter(enemy => enemy.hp > 0 && distance(area, enemy) <= area.radius + enemy.radius && this._lineOfSight(area, enemy));
      for (const enemy of targets) {
        if (area.element === 'fire') enemy.burnRemaining = Math.max(enemy.burnRemaining, Math.min(0.65, area.remaining));
        if (area.slow > 0) this._slowEnemy(enemy, area.slow, 0.6);
      }
      while (area.tickRemaining <= 1e-7) {
        area.tickRemaining += area.interval;
        for (const enemy of targets) {
          this._damageEnemy(enemy, area.damage, area.element === 'fire' ? 'burn' : 'area', false, area.element);
          if (area.element === 'lightning') this._stunEnemy(enemy, 0.25);
        }
        this._emit('areapulse', { id: area.id, element: area.element, variant: area.variant, x: area.x, z: area.z, radius: area.radius });
      }
    }
    this.areas = this.areas.filter(area => area.remaining > 0);
  }

  _drinkPotion() {
    const p = this.player;
    if (p.potions <= 0 || p.potionCd > 0 || p.hp >= p.maxHp) return;
    p.potions--;
    p.potionCd = 0.8;
    const amount = Math.min(p.maxHp - p.hp, p.potionHeal);
    p.hp += amount;
    this._emit('heal', { x: p.x, z: p.z, amount, source: 'potion' });
  }

  _damageEnemy(enemy, amount, source, critical = false, element = this.weapon.element) {
    if (enemy.hp <= 0 || this.status !== 'playing') return;
    const actual = Math.min(enemy.hp, amount);
    enemy.hp -= amount;
    enemy.hitFlash = 0.12;
    this.damageDealt += actual;
    this._emit('hit', { target: 'enemy', id: enemy.id, x: enemy.x, z: enemy.z, amount: Math.round(amount), critical, source, element });
    if (enemy.hp <= 0) this._killEnemy(enemy, element, source);
  }

  _killEnemy(enemy, element = this.weapon.element, source = 'attack') {
    if (enemy.dead) return;
    enemy.dead = true;
    this.kills++;
    this.roomKills++;
    if (enemy.elite) this.eliteKills++;
    if (enemy.type === 'boss') this.bossKills++;
    if (Object.hasOwn(this.elementKills, element)) this.elementKills[element]++;
    this._cancelAttack(enemy);
    this._emit('kill', { id: enemy.id, enemyType: enemy.type, elite: enemy.elite, fodder: enemy.type === 'fodder', element, source, x: enemy.x, z: enemy.z, amount: enemy.xp });
    this._registerKillStreak(enemy, element);
    this.drops.push({ id: this._nextId++, type: 'xp', x: enemy.x, z: enemy.z, value: enemy.xp, radius: 0.17, age: 0 });
    this.drops.push({ id: this._nextId++, type: 'gold', x: enemy.x + 0.3, z: enemy.z + 0.1, value: enemy.elite ? 18 : enemy.type === 'fodder' ? 1 + Math.floor(this.random() * 2) : 3 + Math.floor(this.random() * 4), radius: 0.15, age: 0 });
    // A guaranteed elite flask supplements the random drops.
    if (enemy.elite || this.random() < (enemy.type === 'fodder' ? 0.015 : 0.05)) {
      this.drops.push({ id: this._nextId++, type: 'potion', x: enemy.x - 0.35, z: enemy.z, value: 1, radius: 0.22, age: 0 });
    }
    if (enemy.elite) {
      const available = EQUIPMENT.filter(item => item.tier === 2 && !this.inventory.includes(item.id) && !this.drops.some(drop => drop.weaponId === item.id));
      const weapon = available.find(item => item.element === this.weapon.element) ?? available[Math.floor(this.random() * available.length)];
      if (weapon) this.drops.push({ id: this._nextId++, type: 'equipment', weaponId: weapon.id, element: weapon.element, x: enemy.x, z: enemy.z, value: 1, radius: 0.3, age: 0 });
    }
    const p = this.player;
    if (p.lifeOnKill > 0) p.hp = Math.min(p.maxHp, p.hp + p.lifeOnKill);
    this.enemies = this.enemies.filter(item => item !== enemy);
    // Let the last impact, lingering field and multikill read before opening
    // a modal. This is simulation time, so pausing does not consume the delay.
    if (this.enemies.length === 0) this._levelRevealAt = this.time + 0.85;
  }

  _registerKillStreak(enemy, element) {
    if (this.time - this._killStreak.lastTime > 2.4) this._killStreak = { count: 0, lastTime: this.time, refund: 0 };
    const streak = this._killStreak;
    streak.count++; streak.lastTime = this.time;
    this.bestCombo = Math.max(this.bestCombo, streak.count);
    if (![3, 6, 10, 16, 24].includes(streak.count)) return;
    const requested = Math.min(0.7, 2.4 - streak.refund);
    const cooldownRefund = Math.min(this.skillCooldowns[element] ?? 0, Math.max(0, requested));
    if (Object.hasOwn(this.skillCooldowns, element)) this.skillCooldowns[element] -= cooldownRefund;
    streak.refund += cooldownRefund;
    const gold = Math.min(12, streak.count);
    this.gold += gold;
    this._emit('multikill', { kills: streak.count, combo: streak.count, element, x: enemy.x, z: enemy.z, cooldownRefund, gold });
  }

  _hurtPlayer(amount, source, attacker = null) {
    const p = this.player;
    if (this.status !== 'playing' || p.invulnerable > 0 || p.hp <= 0) return false;
    const incoming = Math.max(1, amount * (1 - this.combatStats.armor) * (attacker?.type === 'boss' ? 1 - this.bossWard : 1));
    if (this.interactionChannel) {
      this.interactionChannel = null;
      this._emit('channelcancel', { reason: 'hit' });
    }
    const absorbed = Math.min(p.shield, incoming);
    p.shield = Math.max(0, p.shield - absorbed);
    p.wardShield = Math.min(p.wardShield, p.shield);
    if (absorbed > 0) {
      this._emit('shield', { absorbed, remaining: p.shield, x: p.x, z: p.z });
      if (p.shield <= 0) this._removeBuff('tide-shield');
    }
    const actual = Math.min(p.hp, incoming - absorbed);
    if (actual > 0) {
      p.hp -= actual;
      p.invulnerable = 0.48;
      this.damageTaken += actual;
      this._emit('hit', { target: 'player', x: p.x, z: p.z, amount: Math.round(actual), source });
    }
    if (p.hp <= 0) {
      this.status = 'dead';
      this.activeBuffs = [];
      this.areas = [];
      p.shield = 0;
      p.wardShield = 0;
      this.skillCooldowns = { fire: 0, lightning: 0, water: 0 };
      this._emit('death', { x: p.x, z: p.z, room: this.roomIndex, kills: this.kills, duration: this.time });
      return true;
    }
    if (p.thorns && attacker && attacker.hp > 0) this._damageEnemy(attacker, p.thorns, 'thorns');
    return true;
  }

  _enterRoom(index) {
    const room = this.rooms[index];
    this.roomIndex = index;
    this.roomName = room.name;
    this.roomSubtitle = room.subtitle;
    this.roomTheme = room.theme;
    this.roomCleared = false;
    this.rewardReady = false;
    this.roomRewardTaken = false;
    this.visitedZoneIds.add(room.id);
    this._allowedSurfaces = unlockedSurfaces(index, false, this.world);
    this._refreshInterestPoints();
    this._waypointCache = null;
    this.exit = { ...room.exit, radius: 3.2 };
    this._roomEnding = false;
    this._waveTimer = 0;
    this.waveIndex = 0;
    this.waveCount = room.waves.length;
    this.roomKills = 0;
    this.roomEnemyCount = room.waves.reduce((sum, n) => sum + n, 0);
    this.enemies = [];
    this.projectiles = [];
    this.telegraphs = [];
    this.hazards = [];
    this._hazardClock = 6;
    this.interactionChannel = null;
    this.chest = null;
    this.player.invulnerable = Math.max(this.player.invulnerable, 1.2);
    this.player.attackCd = 0;
    this._spawnWave();
    this._emit('room', { index, zoneId: room.id, name: room.name, subtitle: room.subtitle, x: room.center.x, z: room.center.z, wave: 1, waves: this.waveCount });
  }

  _checkWorldProgress() {
    if (!this.roomRewardTaken || this.roomIndex >= this.rooms.length - 1) return;
    const next = this.rooms[this.roomIndex + 1];
    if (containsPoint(next.bounds, this.player.x, this.player.z, this.player.radius)) this._enterRoom(this.roomIndex + 1);
  }

  _spawnWave() {
    const count = this.rooms[this.roomIndex].waves[this.waveIndex];
    if (this.roomIndex === this.rooms.length - 1) {
      const center = this.rooms[this.roomIndex].center;
      this._spawnEnemy('boss', center.x, center.z - 3, true);
      this._spawnPack(count - 1);
      this._emit('wave', { wave: 1, waves: 1, amount: count });
      return;
    }
    const eliteIndex = this.roomIndex >= 2 && this.waveIndex === this.waveCount - 1 ? count - 1 : -1;
    this._spawnPack(count, eliteIndex);
    this._emit('wave', { wave: this.waveIndex + 1, waves: this.waveCount, amount: count });
  }

  _spawnPack(count, eliteIndex = -1) {
    let anchor = null;
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      if (this.enemies.length >= MAX_ACTIVE_ENEMIES) break;
      const elite = i === eliteIndex;
      let type = i % 4 !== 3 ? 'fodder' : this.random() < 0.55 ? 'melee' : this.random() < 0.65 ? 'ranged' : 'brute';
      if (this.roomIndex === 0 && type !== 'fodder') type = i === 11 && this.waveIndex > 0 ? 'brute' : 'melee';
      if (elite) type = this.random() < 0.6 ? 'brute' : 'ranged';
      if (i % 5 === 0) anchor = this._spawnPoint();
      const point = this._spawnPoint(anchor);
      if (this._spawnEnemy(type, point.x, point.z, elite)) spawned++;
    }
    return spawned;
  }

  _spawnPoint(anchor = null) {
    const bounds = this.rooms[this.roomIndex].bounds;
    const minX = bounds.minX + 2, maxX = bounds.maxX - 2, minZ = bounds.minZ + 2, maxZ = bounds.maxZ - 2;
    let best = { ...this.rooms[this.roomIndex].center }, bestScore = -Infinity;
    for (let attempt = 0; attempt < 24; attempt++) {
      const origin = anchor ?? this.player;
      const angle = this.random() * TAU;
      const radius = anchor ? 0.6 + this.random() * 2.4 : 8.5 + this.random() * 5;
      const point = { x: Math.max(minX, Math.min(maxX, origin.x + Math.cos(angle) * radius)), z: Math.max(minZ, Math.min(maxZ, origin.z + Math.sin(angle) * radius)) };
      const separation = Math.min(2, ...this.enemies.map(enemy => distance(point, enemy)));
      const score = Math.min(7, distance(point, this.player)) + separation;
      if (score > bestScore) { best = point; bestScore = score; }
      if (distance(point, this.player) > 6.2 && separation > 1.1) return point;
    }
    return best;
  }

  _spawnEnemy(type, x, z, elite = false) {
    const base = ENEMY_STATS[type];
    if (!base || this.enemies.length >= MAX_ACTIVE_ENEMIES) return null;
    const scale = type === 'boss' ? 1 : 1 + this.roomIndex * 0.13;
    const difficultyHp = this.difficulty === 'hard' ? 1.2 : this.difficulty === 'story' ? 0.8 : 1;
    const difficultyDamage = this.difficulty === 'hard' ? 1.3 : this.difficulty === 'story' ? 0.7 : 1;
    const eliteScale = elite && type !== 'boss' ? 1.8 : 1;
    const hp = Math.round((type === 'boss' && this.expeditionId === 'aqueduct' ? 2600 : base.hp) * scale * difficultyHp * eliteScale);
    const enemy = {
      id: this._nextId++, type, x, z, hp, maxHp: hp,
      facing: Math.atan2(this.player.x - x, this.player.z - z),
      radius: base.radius * (elite && type !== 'boss' ? 1.18 : 1),
      damage: base.damage * (1 + this.roomIndex * 0.065) * difficultyDamage * (elite && type !== 'boss' ? 1.3 : 1),
      speed: base.speed * (elite && type !== 'boss' ? 1.12 : 1),
      xp: Math.round(base.xp * (elite ? 1.8 : 1)),
      elite, windup: 0, stun: 0, hitFlash: 0, spawnTime: 0.55,
      attackCd: 0.7 + this.random() * 1.0, attackCount: 0, attack: null,
      phase: 1, summoned: false, dead: false,
      navTime: 0, navTarget: null,
      slowRemaining: 0, slowFactor: 1, burnRemaining: 0,
    };
    this.enemies.push(enemy);
    this._emit('spawn', { id: enemy.id, enemyType: type, x, z, elite });
    return enemy;
  }

  _updateEnemies(dt) {
    const p = this.player;
    for (const enemy of [...this.enemies]) {
      if (enemy.hp <= 0 || this.status !== 'playing') continue;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.attackCd = Math.max(0, enemy.attackCd - dt);
      enemy.spawnTime = Math.max(0, enemy.spawnTime - dt);
      enemy.stun = Math.max(0, enemy.stun - dt);
      enemy.slowRemaining = Math.max(0, enemy.slowRemaining - dt);
      enemy.burnRemaining = Math.max(0, enemy.burnRemaining - dt);
      if (enemy.slowRemaining <= 0) enemy.slowFactor = 1;
      if (enemy.spawnTime > 0 || enemy.stun > 0) continue;

      if (enemy.type === 'boss' && enemy.hp <= enemy.maxHp * 0.5 && !enemy.summoned) {
        enemy.summoned = true;
        enemy.phase = 2;
        enemy.speed *= 1.3;
        this.roomEnemyCount += this._spawnPack(10, 9);
        this._emit('bossphase', { id: enemy.id, phase: 2, x: enemy.x, z: enemy.z, name: this.expeditionId === 'aqueduct' ? '幽潮守望者 · 涨潮' : '丧钟守卫 · 狂焰' });
      }

      if (enemy.attack) {
        enemy.windup = Math.max(0, enemy.windup - dt);
        for (const telegraph of this.telegraphs) {
          if (telegraph.enemyId === enemy.id) telegraph.remaining = enemy.windup;
        }
        if (enemy.windup <= 0) this._executeEnemyAttack(enemy);
        continue;
      }

      const dx = p.x - enemy.x;
      const dz = p.z - enemy.z;
      const d = Math.max(0.001, Math.hypot(dx, dz));
      enemy.facing = Math.atan2(dx, dz);
      const stats = ENEMY_STATS[enemy.type];
      const oldX = enemy.x, oldZ = enemy.z;
      let direction = 1;
      let shouldMove = d > stats.range * 0.82;
      if (enemy.type === 'ranged') {
        direction = d < 4.2 ? -1 : 1;
        shouldMove = d < 4.2 || d > 7.0;
      }
      if (shouldMove) {
        enemy.navTime -= dt;
        if (!enemy.navTarget || enemy.navTime <= 0 || distance(enemy, enemy.navTarget) < 0.3) {
          enemy.navTarget = { ...navigationTarget(enemy, p, enemy.radius, this._allowedSurfaces, this.world.navPoints) };
          enemy.navTime = 0.4;
        }
        const target = direction < 0 ? p : enemy.navTarget;
        const nx = target.x - enemy.x, nz = target.z - enemy.z, nd = Math.max(0.001, Math.hypot(nx, nz));
        enemy.x += (nx / nd) * enemy.speed * enemy.slowFactor * dt * direction;
        enemy.z += (nz / nd) * enemy.speed * enemy.slowFactor * dt * direction;
      }
      // A small separation force keeps silhouettes legible without making
      // actors behave as solid walls that can trap the player.
      for (const other of this.enemies) {
        if (other === enemy || other.hp <= 0) continue;
        const ex = enemy.x - other.x;
        const ez = enemy.z - other.z;
        const ed = Math.hypot(ex, ez);
        const desired = enemy.radius + other.radius + 0.18;
        if (ed > 0.001 && ed < desired) {
          const push = (desired - ed) * dt * 2.8;
          enemy.x += ex / ed * push;
          enemy.z += ez / ed * push;
        }
      }
      Object.assign(enemy, constrainMove(oldX, oldZ, enemy.x, enemy.z, enemy.radius, this._allowedSurfaces));
      if (enemy.attackCd <= 0 && (d <= stats.range || (enemy.type === 'boss' && d <= 18)) && canTravel(enemy.x, enemy.z, p.x, p.z, 0.05, this._allowedSurfaces)) this._beginEnemyAttack(enemy);
    }
  }

  _beginEnemyAttack(enemy) {
    const p = this.player;
    const duration = ENEMY_STATS[enemy.type].windup * (enemy.type === 'boss' && enemy.phase === 2 ? 0.85 : 1);
    const angle = Math.atan2(p.x - enemy.x, p.z - enemy.z);
    enemy.facing = angle;
    enemy.windup = duration;
    enemy.attackCount++;
    let attack;
    if (enemy.type === 'melee' || enemy.type === 'fodder') {
      attack = { kind: 'melee', x: enemy.x, z: enemy.z, angle, range: enemy.type === 'fodder' ? 1.9 : 2.25, arc: Math.PI * 0.65 };
      this._addTelegraph(enemy, { type: 'cone', x: enemy.x, z: enemy.z, angle, radius: attack.range, arc: attack.arc, length: 0, width: 0 }, duration);
    } else if (enemy.type === 'ranged') {
      attack = { kind: 'bolt', x: enemy.x, z: enemy.z, angle };
      this._addTelegraph(enemy, { type: 'line', x: enemy.x, z: enemy.z, angle, length: 10, width: 0.38, radius: 0.2 }, duration);
    } else if (enemy.type === 'brute') {
      attack = { kind: 'slam', x: enemy.x, z: enemy.z, radius: 2.85 };
      this._addTelegraph(enemy, { type: 'circle', x: enemy.x, z: enemy.z, radius: 2.85, angle: 0, length: 0, width: 0 }, duration);
    } else if (this.expeditionId === 'aqueduct') {
      const pattern = enemy.attackCount % 3;
      if (pattern === 1) {
        attack = { kind: 'tide-ring', x: enemy.x, z: enemy.z, radius: enemy.phase === 2 ? 9 : 8, innerRadius: 3 };
        this._addTelegraph(enemy, { type: 'ring', ...attack }, duration + .3);
        enemy.windup = duration + .3;
      } else if (pattern === 2) {
        attack = { kind: 'tide-surge', x: p.x, z: p.z, radius: 2.4, points: [{ x: p.x, z: p.z }, { x: p.x + Math.cos(angle) * 4, z: p.z - Math.sin(angle) * 4 }] };
        for (const point of attack.points) this._addTelegraph(enemy, { type: 'circle', ...point, radius: attack.radius, element: 'water' }, duration);
      } else {
        attack = { kind: 'boss-fan', x: enemy.x, z: enemy.z, angle };
        for (let i = -2; i <= 2; i++) this._addTelegraph(enemy, { type: 'line', x: enemy.x, z: enemy.z, angle: angle + i * .22, length: 12, width: .45, radius: .25, element: 'water' }, duration);
      }
    } else {
      const pattern = enemy.attackCount % 3;
      if (pattern === 1) {
        attack = { kind: 'boss-slam', x: p.x, z: p.z, radius: 3.0 };
        this._addTelegraph(enemy, { type: 'circle', x: p.x, z: p.z, radius: 3.0, angle: 0, length: 0, width: 0 }, duration);
      } else if (pattern === 2) {
        attack = { kind: 'boss-fan', x: enemy.x, z: enemy.z, angle };
        for (let i = -2; i <= 2; i++) this._addTelegraph(enemy, { type: 'line', x: enemy.x, z: enemy.z, angle: angle + i * 0.22, length: 12, width: 0.45, radius: 0.25 }, duration);
      } else {
        attack = { kind: 'boss-ring', x: enemy.x, z: enemy.z, angle: enemy.attackCount * 0.17 };
        this._addTelegraph(enemy, { type: 'circle', x: enemy.x, z: enemy.z, radius: 4.0, angle: 0, length: 0, width: 0 }, duration);
      }
    }
    enemy.attack = attack;
    this._emit('windup', { id: enemy.id, enemyType: enemy.type, x: enemy.x, z: enemy.z, kind: attack.kind, duration });
  }

  _addTelegraph(enemy, data, duration) {
    this.telegraphs.push({ id: this._nextId++, enemyId: enemy.id, ...data, remaining: duration, duration });
  }

  _cancelAttack(enemy) {
    enemy.attack = null;
    enemy.windup = 0;
    this.telegraphs = this.telegraphs.filter(mark => mark.enemyId !== enemy.id);
  }

  _executeEnemyAttack(enemy) {
    const attack = enemy.attack;
    if (!attack) return;
    this._cancelAttack(enemy);
    enemy.attackCd = ENEMY_STATS[enemy.type].cooldown * (enemy.type === 'boss' && enemy.phase === 2 ? 0.78 : 1);
    const p = this.player;
    if (attack.kind === 'melee') {
      const d = distance(p, attack);
      const angle = Math.atan2(p.x - attack.x, p.z - attack.z);
      if (d <= attack.range + p.radius && Math.abs(angleDelta(angle, attack.angle)) <= attack.arc / 2 && canTravel(attack.x, attack.z, p.x, p.z, 0.05, this._allowedSurfaces)) this._hurtPlayer(enemy.damage, 'melee', enemy);
    } else if (attack.kind === 'slam' || attack.kind === 'boss-slam') {
      if (distance(p, attack) <= attack.radius + p.radius * 0.5 && canTravel(attack.x, attack.z, p.x, p.z, 0.05, this._allowedSurfaces)) this._hurtPlayer(enemy.damage, 'slam', enemy);
      this._emit('enemyAttack', { id: enemy.id, x: attack.x, z: attack.z, radius: attack.radius, kind: attack.kind });
    } else if (attack.kind === 'bolt') {
      this._spawnBolt(enemy, attack.angle, 7.4);
      if (enemy.elite) {
        this._spawnBolt(enemy, attack.angle - 0.15, 7.4);
        this._spawnBolt(enemy, attack.angle + 0.15, 7.4);
      }
    } else if (attack.kind === 'boss-fan') {
      for (let i = -2; i <= 2; i++) this._spawnBolt(enemy, attack.angle + i * 0.22, 8.1);
    } else if (attack.kind === 'boss-ring') {
      const count = enemy.phase === 2 ? 16 : 12;
      for (let i = 0; i < count; i++) this._spawnBolt(enemy, attack.angle + TAU * i / count, 5.6);
      this._emit('enemyAttack', { id: enemy.id, x: enemy.x, z: enemy.z, radius: 4, kind: 'boss-ring' });
    } else if (attack.kind === 'tide-ring') {
      const d = distance(p, attack);
      if (d + p.radius * .5 >= attack.innerRadius && d - p.radius * .5 <= attack.radius && this._lineOfSight(attack, p)) this._hurtPlayer(enemy.damage, 'tide', enemy);
      this._emit('enemyAttack', { id: enemy.id, ...attack, element: 'water' });
    } else if (attack.kind === 'tide-surge') {
      for (const point of attack.points) {
        if (distance(p, point) <= attack.radius + p.radius * .5 && this._lineOfSight(point, p)) this._hurtPlayer(enemy.damage, 'tide', enemy);
        this._emit('enemyAttack', { id: enemy.id, ...point, radius: attack.radius, kind: attack.kind, element: 'water' });
      }
    }
  }

  _spawnBolt(enemy, angle, speed) {
    const dx = Math.sin(angle);
    const dz = Math.cos(angle);
    this.projectiles.push({
      id: this._nextId++, ownerId: enemy.id, type: enemy.type === 'boss' ? this.expeditionId === 'aqueduct' ? 'water' : 'fire' : 'bolt',
      x: enemy.x + dx * (enemy.radius + 0.2), z: enemy.z + dz * (enemy.radius + 0.2),
      vx: dx * speed, vz: dz * speed, radius: enemy.type === 'boss' ? 0.25 : 0.19,
      damage: enemy.damage * (enemy.type === 'boss' ? 1 - this.bossWard : 1), life: 4.5, facing: angle,
    });
  }

  _updateProjectiles(dt) {
    const p = this.player;
    for (const bolt of this.projectiles) {
      const x = bolt.x + bolt.vx * dt, z = bolt.z + bolt.vz * dt;
      bolt.life -= dt;
      if (!canTravel(bolt.x, bolt.z, x, z, bolt.radius, this._allowedSurfaces)) { bolt.life = 0; continue; }
      bolt.x = x; bolt.z = z;
      if (distance(bolt, p) <= bolt.radius + p.radius) {
        this._hurtPlayer(bolt.damage, 'projectile');
        bolt.life = 0;
      }
    }
    this.projectiles = this.projectiles.filter(bolt => bolt.life > 0);
  }

  _updateDrops(dt, force = false) {
    const p = this.player;
    for (const drop of this.drops) {
      drop.age += dt;
      const d = distance(drop, p);
      if (drop.type === 'potion' && p.potions >= p.maxPotions) continue;
      const attraction = this.roomCleared || force || (drop.type !== 'potion' && d < 4.6);
      if (attraction && d > 0.5) {
        const step = Math.min(d, dt * (this.roomCleared || force ? 22 : 12));
        drop.x += (p.x - drop.x) / d * step;
        drop.z += (p.z - drop.z) / d * step;
      }
      if (force || distance(drop, p) < 0.95) {
        drop.collected = true;
        if (drop.type === 'xp') this._gainXp(drop.value);
        else if (drop.type === 'potion') p.potions = Math.min(p.maxPotions, p.potions + drop.value);
        else if (drop.type === 'equipment') this._grantEquipment(drop.weaponId, 'drop');
        else this.gold += drop.value;
        this._emit('pickup', { x: p.x, z: p.z, item: drop.type, amount: drop.value, ...(drop.weaponId ? { weaponId: drop.weaponId } : {}) });
      }
    }
    this.drops = this.drops.filter(drop => !drop.collected);
  }

  _gainXp(amount) {
    const p = this.player;
    p.xp += amount;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = Math.round(p.xpNext * 1.26 + 18);
      p.hp = Math.min(p.maxHp, p.hp + 14);
      this._pendingLevels++;
      this._emit('level', { level: p.level, x: p.x, z: p.z });
    }
  }

  _showPendingLevel() {
    if (this._pendingLevels > 0 && this.status === 'playing' && this.enemies.length === 0 && this.time + 1e-7 >= this._levelRevealAt) {
      this._pendingLevels--;
      this._offerUpgrades('level');
    }
  }

  _offerUpgrades(reason) {
    const pool = UPGRADES.filter(upgrade => !upgrade.available || upgrade.available(this.player));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.choices = pool.slice(0, 3).map(({ id, name, description, icon }) => ({ id, name, description, icon }));
    this.choiceReason = reason;
    this.interactionChannel = null;
    this.status = 'upgrade';
    this._emit('choices', { reason, choices: this.choices });
  }

  chooseUpgrade(index) {
    if (this.status !== 'upgrade' || !Number.isInteger(index) || !this.choices[index]) return false;
    const selected = this.choices[index];
    const upgrade = UPGRADES.find(item => item.id === selected.id);
    upgrade.apply(this.player);
    const existing = this.boons.find(item => item.id === upgrade.id);
    if (existing) existing.stacks++;
    else this.boons.push({ id: upgrade.id, name: upgrade.name, description: upgrade.description, icon: upgrade.icon, stacks: 1 });
    if (this.choiceReason === 'room') {
      this.rewardReady = false;
      this.roomRewardTaken = true;
      this._allowedSurfaces = unlockedSurfaces(this.roomIndex, true, this.world);
      this._refreshInterestPoints();
      this._waypointCache = null;
      if (this.chest) this.chest.opened = true;
      if (this.roomIndex === 0) this._grantEquipment(EQUIPMENT.find(item => item.tier === 2 && item.element === this.weapon.element).id, 'room');
    }
    this._emit('upgrade', { id: upgrade.id, name: upgrade.name, reason: this.choiceReason });
    this.status = 'playing';
    this.choices = [];
    this.choiceReason = null;
    this.player.invulnerable = Math.max(this.player.invulnerable, 0.6);
    this._showPendingLevel();
    return true;
  }

  _resolveWave(dt) {
    if (this.roomCleared || this.status !== 'playing' || this.enemies.length > 0) return;
    if (this.waveIndex < this.waveCount - 1) {
      if (this._waveTimer === 0) {
        this._waveTimer = 1.8;
        this._emit('waveclear', { wave: this.waveIndex + 1, nextWave: this.waveIndex + 2 });
      }
      this._waveTimer -= dt;
      if (this._waveTimer <= 0) {
        // A pending choice always takes precedence, including XP collected
        // during the lull. Never put a new pack behind an opening modal.
        if (this._pendingLevels > 0) { this._waveTimer = 0.001; return; }
        this._waveTimer = 0;
        this.waveIndex++;
        this._spawnWave();
      }
    } else this._finishRoom();
  }

  _finishRoom() {
    if (this._roomEnding) return;
    this._roomEnding = true;
    this.roomCleared = true;
    this.clearedZoneIds.add(this.rooms[this.roomIndex].id);
    this.projectiles = [];
    this.telegraphs = [];
    this.hazards = [];
    this._updateDrops(0, true);
    const p = this.player;
    const heal = Math.min(p.maxHp - p.hp, p.maxHp * 0.24);
    p.hp += heal;
    this._emit('clear', { index: this.roomIndex, zoneId: this.rooms[this.roomIndex].id, name: this.roomName, x: this.exit.x, z: this.exit.z });
    this._refreshInterestPoints();
    if (heal > 0) this._emit('heal', { x: p.x, z: p.z, amount: Math.round(heal), source: 'room' });
    if (this.roomIndex === this.rooms.length - 1) {
      this.status = 'won';
      this._pendingLevels = 0;
      this.choices = [];
      this.choiceReason = null;
      this._emit('win', { x: p.x, z: p.z, kills: this.kills, duration: this.time, gold: this.gold });
    } else {
      this.rewardReady = true;
      const zone = this.rooms[this.roomIndex];
      this.chest = { x: zone.center.x, z: zone.center.z - 2, opened: false };
    }
  }

  interact() {
    if (this.status !== 'playing') return false;
    const target = this.nearestInteraction;
    if (target && target.kind !== 'reward') {
      if (['story', 'mechanism'].includes(target.kind)) {
        this.interactionChannel ??= { id: target.id, elapsed: 0, duration: 2.4 };
        return true;
      }
      return this._completeInterestPoint(target.id);
    }
    if (!this.roomCleared) return false;
    if (this._pendingLevels > 0) { this._showPendingLevel(); return true; }
    // The reward remains reachable anywhere. Afterwards the player follows the
    // physical passage; interaction never repositions the player or reloads a room.
    if (this.rewardReady) { this._offerUpgrades('room'); return true; }
    return false;
  }

  _refreshInterestPoints() {
    for (const point of this.interestPoints) point.available = !point.completed &&
      (point.zoneIndex < this.roomIndex || (point.zoneIndex === this.roomIndex && (!point.requiresReward || this.roomRewardTaken) && (!point.requiresClear || this.roomCleared)));
  }

  _updateInteraction(dt, held) {
    const channel = this.interactionChannel;
    if (!channel) return;
    const point = this.interestPoints.find(item => item.id === channel.id);
    if (!held || !point?.available || distance(this.player, point) > point.radius || !this._lineOfSight(this.player, point)) {
      this.interactionChannel = null;
      return;
    }
    channel.elapsed += dt;
    if (channel.elapsed >= channel.duration) {
      this.interactionChannel = null;
      this._completeInterestPoint(point.id);
    }
  }

  _updateHazards(dt) {
    if (this.expeditionId !== 'aqueduct') return;
    if (!this.roomCleared && this.roomIndex < this.rooms.length - 1) {
      this._hazardClock -= dt;
      if (this._hazardClock <= 0) {
        this._hazardClock = 7;
        const hazard = { id: this._nextId++, x: this.player.x, z: this.player.z, radius: 2.6, remaining: 1.3 };
        this.hazards.push(hazard);
        this.telegraphs.push({ ...hazard, enemyId: null, hazardId: hazard.id, type: 'circle', element: 'water', duration: 1.3 });
      }
    }
    for (const hazard of this.hazards) {
      hazard.remaining -= dt;
      const mark = this.telegraphs.find(item => item.hazardId === hazard.id);
      if (mark) mark.remaining = hazard.remaining;
      if (hazard.remaining <= 0) {
        if (distance(this.player, hazard) <= hazard.radius + this.player.radius * .5 && this._lineOfSight(hazard, this.player)) this._hurtPlayer(12, 'water-pressure');
        this._emit('enemyAttack', { ...hazard, kind: 'tide-surge', element: 'water' });
        this.telegraphs = this.telegraphs.filter(item => item.hazardId !== hazard.id);
      }
    }
    this.hazards = this.hazards.filter(hazard => hazard.remaining > 0);
  }

  _completeInterestPoint(id) {
    const point = this.interestPoints.find(item => item.id === id);
    if (!point || point.completed || !point.available || distance(this.player, point) > point.radius || !this._lineOfSight(this.player, point)) return false;
    point.completed = true; point.available = false;
    this.completedPoiIds.add(point.id);
    const reward = { ...point.reward }, p = this.player;
    this.gold += reward.gold ?? 0;
    p.skillDamage += reward.skillDamage ?? 0;
    if (reward.bossWard) this.bossWard = Math.max(this.bossWard, reward.bossWard);
    if (reward.potions) { const before = p.potions; p.potions = Math.min(p.maxPotions, p.potions + reward.potions); reward.potions = p.potions - before; }
    if (reward.heal) { const before = p.hp; p.hp = Math.min(p.maxHp, p.hp + reward.heal); reward.heal = p.hp - before; }
    this._emit('poi', { id: point.id, name: point.name, kind: point.kind, x: point.x, z: point.z, reward });
    return true;
  }
}

export default Game;
