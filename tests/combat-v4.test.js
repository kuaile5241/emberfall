import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, MAX_ACTIVE_ENEMIES } from '../src/game.js';
import { STARTER_WEAPON_IDS } from '../src/content.js';
import { WORLD, isWalkable, navigationTarget } from '../src/world.js';

function sandbox(weaponId = 'fire-sword', loadout = {}) {
  const game = new Game({ seed: 401, weaponId, ...loadout }).start();
  game.enemies = [];
  game.player.x = 0; game.player.z = 0;
  return game;
}
function enemyAt(game, x, z, { type = 'melee', elite = false, hp } = {}) {
  const enemy = game._spawnEnemy(type, x, z, elite);
  if (hp !== undefined) enemy.hp = enemy.maxHp = hp;
  enemy.spawnTime = 999;
  return enemy;
}
function walk(game, target) {
  for (let frame = 0; frame < 6000; frame++) {
    if (Math.hypot(game.player.x - target.x, game.player.z - target.z) < 0.2) return;
    const next = navigationTarget(game.player, target, game.player.radius, game._allowedSurfaces);
    const dx = next.x - game.player.x, dz = next.z - game.player.z, d = Math.hypot(dx, dz) || 1;
    game.update(1 / 60, { moveX: dx / d, moveZ: dz / d });
    assert.ok(isWalkable(game.player.x, game.player.z, game.player.radius));
  }
  assert.fail(`Could not walk to ${target.x},${target.z}`);
}
function chooseAll(game) { while (game.status === 'upgrade') game.chooseUpgrade(0); }
function finishCurrentZone(game) {
  game.enemies = []; game.waveIndex = game.waveCount - 1;
  game.update(1 / 60); chooseAll(game);
  game.interact(); chooseAll(game);
}

test('encounters contain dense harvestable packs and enforce a finite live-enemy cap', () => {
  for (const seed of [1, 401, 901]) {
    const game = new Game({ seed }).start();
    assert.ok(game.enemies.length >= 12 && game.enemies.length <= 16);
    const fodder = game.enemies.filter(enemy => enemy.type === 'fodder');
    assert.ok(fodder.length >= game.enemies.length * 0.65);
    assert.ok(fodder.every(enemy => enemy.hp < game.combatStats.skillDamage));
    assert.ok(fodder.some(a => fodder.filter(b => Math.hypot(a.x - b.x, a.z - b.z) < game.combatStats.skillRadius).length >= 4), 'several weak enemies must fit a single AOE');
    for (const enemy of game.enemies) assert.ok(isWalkable(enemy.x, enemy.z, enemy.radius));
  }
  const game = new Game({ seed: 8 }).start();
  game._enterRoom(4);
  assert.ok(game.enemies.length >= 20 && game.enemies.length <= 28);
  while (game.enemies.length < MAX_ACTIVE_ENEMIES) assert.ok(game._spawnEnemy('fodder', 100, -90));
  assert.equal(game._spawnEnemy('fodder', 100, -90), null);
  assert.equal(game.enemies.length, MAX_ACTIVE_ENEMIES);
  assert.equal(game._spawnEnemy('invalid', 100, -90), null);
});

for (const weaponId of STARTER_WEAPON_IDS) {
  test(`${weaponId} harvests a dozen fodder, reports actual hits and refunds a bounded cooldown`, () => {
    const game = sandbox(weaponId);
    for (let i = 0; i < 12; i++) enemyAt(game, Math.cos(i / 12 * Math.PI * 2) * 3, Math.sin(i / 12 * Math.PI * 2) * 3, { type: 'fodder' });
    const elite = enemyAt(game, 0, 4, { type: 'brute', elite: true, hp: 5000 });
    const cooldown = game.combatStats.skillCooldown;
    game._castSkill();
    const events = game.drainEvents(), skill = events.find(event => event.type === 'skill');
    assert.equal(skill.hitCount, 13); assert.equal(skill.kills, 12); assert.equal(skill.eliteHits, 1);
    assert.equal(game.enemies.length, 1); assert.equal(game.enemies[0], elite);
    assert.ok(elite.hp > 0 && elite.hp < elite.maxHp, 'elite must survive the AOE harvest');
    assert.equal(game.bestCombo, 12);
    assert.equal(game.elementKills[game.weapon.element], 12);
    const rewards = events.filter(event => event.type === 'multikill');
    assert.deepEqual(rewards.map(event => event.kills), [3, 6, 10]);
    const refund = rewards.reduce((sum, event) => sum + event.cooldownRefund, 0);
    assert.ok(refund > 0 && refund <= 2.4);
    assert.ok(Math.abs(cooldown - game.player.skillCd - refund) < 1e-8);
    assert.ok(events.filter(event => event.type === 'kill').every(event => event.fodder && event.element === game.weapon.element));
    assert.equal(game.status, 'playing');
  });
}

test('kill streak expires, cannot over-refund, and does not refund another element', () => {
  const game = sandbox();
  game.skillCooldowns = { fire: 9, lightning: 8, water: 7 };
  for (let i = 0; i < 30; i++) game._damageEnemy(enemyAt(game, 1, 0, { type: 'fodder' }), 1000, 'test');
  assert.ok(Math.abs(game.skillCooldowns.fire - 6.6) < 1e-8);
  assert.equal(game.skillCooldowns.lightning, 8); assert.equal(game.skillCooldowns.water, 7);
  game.time += 2.5;
  game._damageEnemy(enemyAt(game, 1, 0, { type: 'fodder' }), 1000, 'test');
  assert.equal(game._killStreak.count, 1);
  assert.equal(game.bestCombo, 30);
  assert.ok(Math.abs(game.skillCooldowns.fire - 6.6) < 1e-8);
});

test('elemental knockback moves survivors, respects rock collision and barely displaces bosses', () => {
  const game = sandbox('water-staff');
  game.player.x = 14;
  const nearWall = enemyAt(game, 16, 0, { hp: 10000 });
  game._castSkill();
  assert.ok(nearWall.x > 16 && nearWall.x <= 16.52);
  assert.ok(isWalkable(nearWall.x, nearWall.z, nearWall.radius));
  const open = sandbox('water-staff');
  const guard = enemyAt(open, 0, 2, { hp: 10000 });
  const boss = enemyAt(open, 2, 0, { type: 'boss' });
  open._castSkill();
  assert.ok(guard.z > 3.5);
  assert.ok(boss.x > 2 && boss.x < 2.3);
});

test('lingering damage retains its element after swapping weapons and counts rewards once', () => {
  const game = sandbox();
  const target = enemyAt(game, 1, 0, { hp: game.combatStats.skillDamage + 2 });
  enemyAt(game, 12, 0);
  game._castSkill();
  game.equipWeapon('water-staff');
  game._updateAreas(0.6);
  assert.equal(target.dead, true);
  assert.deepEqual(game.elementKills, { fire: 1, lightning: 0, water: 0 });
  game._updateAreas(0.6);
  assert.equal(game.kills, 1);
  const kill = game.drainEvents().find(event => event.type === 'kill');
  assert.equal(kill.source, 'burn'); assert.equal(kill.element, 'fire');
});

test('both side objectives require real approach, grant rewards once and remain completed when backtracking', () => {
  const game = new Game({ seed: 8 }).start();
  game.player.invulnerable = 9999;
  const relic = game.interestPoints.find(point => point.id === 'burial-relic');
  const cache = game.interestPoints.find(point => point.id === 'forge-cache');
  assert.equal(cache.available, false);
  assert.equal(game.interact(), false, 'E away from any side objective must not grant rewards');
  walk(game, relic);
  assert.equal(game.nearestInteraction.id, relic.id);
  const damage = game.player.skillDamage, gold = game.gold;
  assert.equal(game.interact(), true);
  assert.equal(game.player.skillDamage, damage + 10); assert.equal(game.gold, gold + 60);
  assert.equal(game.interact(), false); assert.equal(relic.completed, true);
  for (let zone = 0; zone < 2; zone++) {
    finishCurrentZone(game);
    for (const point of WORLD.corridors[zone].path) walk(game, point);
    assert.equal(game.roomIndex, zone + 1);
  }
  assert.equal(cache.available, false, 'the workshop branch opens with its passage reward');
  finishCurrentZone(game);
  assert.equal(cache.available, true);
  walk(game, cache);
  game.player.hp = 30; game.player.potions = 1;
  assert.equal(game.nearestInteraction.id, cache.id);
  const before = game.gold;
  assert.equal(game.interact(), true);
  assert.equal(game.player.hp, 90); assert.equal(game.player.potions, 3); assert.equal(game.gold, before + 50);
  walk(game, relic);
  assert.equal(game.interact(), false);
  assert.equal(game.runSummary.sideRelics, 2);
  assert.deepEqual(game.runSummary.poiIds, ['burial-relic', 'forge-cache']);
  assert.equal(game.drainEvents().filter(event => event.type === 'poi').length, 2);
});

test('camp loadouts validate ownership and finite bonuses, survive swaps and reset without compounding', () => {
  const game = new Game({ seed: 1, runId: 'camp-run-1', weaponId: 'fire-greatsword', unlockedWeapons: ['fire-greatsword', 'missing', 'fire-greatsword'], campBonuses: { maxHp: 30, damageMultiplier: 1.09 }, supply: { id: 'damage-tonic', damageMultiplier: 999 } }).start();
  const base = new Game({ seed: 1, weaponId: 'fire-greatsword', unlockedWeapons: ['fire-greatsword'] }).start();
  assert.equal(game.player.maxHp, base.player.maxHp + 30);
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.weapon.id, 'fire-greatsword'); assert.equal(game.inventory.length, 4);
  assert.ok(Math.abs(game.combatStats.damage / base.combatStats.damage - 1.09 * 1.12) < 1e-8);
  assert.ok(Math.abs(game.combatStats.skillDamage / base.combatStats.skillDamage - 1.09 * 1.12) < 1e-8);
  const damage = game.combatStats.damage;
  game.equipWeapon('water-staff'); game.equipWeapon('fire-greatsword'); game.reset();
  assert.equal(game.combatStats.damage, damage); assert.equal(game.player.maxHp, 150);
  assert.equal(game.runSummary.runId, 'camp-run-1');
  const invalid = new Game({ weaponId: 'water-scepter', unlockedWeapons: null, bonuses: { maxHp: Infinity, damage: '99', skillDamage: -20, armor: 20, damageMultiplier: NaN }, supply: { id: 'missing', shield: 9999 } }).start();
  assert.equal(invalid.weapon.id, 'fire-sword');
  assert.equal(invalid.player.maxHp, 120); assert.equal(invalid.player.damage, 26);
  assert.ok(invalid.player.armor <= 0.15); assert.equal(invalid.supply, null);
  assert.ok(Number.isFinite(invalid.combatStats.skillDamage));
});

test('a camp ward is finite, survives water-shield expiry and is not restored by equipment swaps', () => {
  const game = sandbox('water-staff', { supply: { id: 'ward-charm', shield: 999 } });
  const reserve = game.player.shield;
  assert.equal(reserve, 35);
  game.player.invulnerable = 0;
  game._hurtPlayer(10, 'test');
  assert.equal(game.player.shield, 25); assert.equal(game.player.hp, 120);
  game._castSkill();
  assert.ok(game.player.shield > 25);
  game.equipWeapon('fire-sword');
  game._updateBuffs(10);
  assert.equal(game.player.shield, 25);
  game._hurtPlayer(30, 'test');
  assert.equal(game.player.shield, 0); assert.equal(game.player.hp, 115);
  game.equipWeapon('water-staff'); assert.equal(game.player.shield, 0);
  game.reset(); assert.equal(game.player.shield, 35);
});

test('run summaries are detached settlement snapshots and death/reset clears run progress', () => {
  const game = sandbox('lightning-spear', { runId: 'summary-1' });
  game._damageEnemy(enemyAt(game, 2, 0, { type: 'brute', elite: true, hp: 1 }), 2, 'test');
  game._damageEnemy(enemyAt(game, 3, 0, { type: 'boss', elite: true, hp: 1 }), 2, 'test');
  game._updateDrops(0, true);
  game.time = 60;
  const summary = game.runSummary;
  assert.equal(summary.eliteKills, 2); assert.equal(summary.bossKills, 1); assert.equal(summary.kills, 2);
  assert.equal(summary.elementKills.lightning, 2); assert.ok(summary.goldEarned > 0);
  assert.equal(summary.duration, 60); assert.equal(summary.outcome, 'abandoned');
  summary.inventory.push('missing'); summary.elementKills.lightning = 999; summary.poiIds.push('missing');
  assert.ok(!game.inventory.includes('missing')); assert.equal(game.elementKills.lightning, 2); assert.equal(game.completedPoiIds.size, 0);
  game.player.invulnerable = 0; game._hurtPlayer(10000, 'test');
  assert.equal(game.runSummary.outcome, 'dead'); assert.equal(game.runSummary.kills, 2);
  game.reset(); assert.equal(game.runSummary.kills, 0); assert.equal(game.runSummary.eliteKills, 0); assert.equal(game.runSummary.bossKills, 0); assert.equal(game.runSummary.time, 0);
  assert.deepEqual(game.runSummary.inventory, STARTER_WEAPON_IDS);
  assert.ok(game.interestPoints.every(point => !point.completed));
});

test('the final AOE kill leaves 0.85 seconds of live feedback before a level card and holds the next wave', () => {
  const game = sandbox();
  for (let i = 0; i < 12; i++) enemyAt(game, Math.cos(i / 12 * Math.PI * 2) * 2, Math.sin(i / 12 * Math.PI * 2) * 2, { type: 'fodder' });
  game._gainXp(game.player.xpNext);
  game._castSkill();
  assert.equal(game.enemies.length, 0);
  assert.equal(game.kills, 12);
  // Also cover a nearly elapsed spawn countdown: a pending blessing owns the
  // transition even if the next wave would otherwise arrive during the effect.
  game._waveTimer = 0.2;
  for (let i = 0; i < 48; i++) game.update(1 / 60, { moveX: 1 });
  assert.equal(game.status, 'playing');
  assert.ok(game.player.x > 3.9, 'movement continues while the final impact is visible');
  assert.ok(game.areas.some(area => area.element === 'fire' && area.remaining > 0));
  assert.equal(game.waveIndex, 0); assert.equal(game.enemies.length, 0);
  assert.ok(game.drainEvents().some(event => event.type === 'multikill'));
  for (let i = 0; i < 3; i++) game.update(1 / 60);
  assert.equal(game.status, 'upgrade');
  assert.equal(game.choiceReason, 'level');
  const pausedTime = game.time;
  for (let i = 0; i < 20; i++) game.update(0.1);
  assert.equal(game.time, pausedTime);
  assert.equal(game.waveIndex, 0); assert.equal(game.enemies.length, 0);
  chooseAll(game);
  game.update(1 / 60);
  assert.equal(game.status, 'playing');
  assert.equal(game.waveIndex, 1);
  assert.ok(game.enemies.length >= 12);
});
