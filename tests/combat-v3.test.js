import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { EQUIPMENT, STARTER_WEAPON_IDS } from '../src/content.js';

function advance(game, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    while (game.status === 'upgrade') game.chooseUpgrade(0);
    game.update(1 / 60, input);
  }
}

function fixture(weaponId = 'fire-sword') {
  const game = new Game({ seed: 903, weaponId }).start();
  game.player.x = 0; game.player.z = 0; game.player.invulnerable = 999;
  game.enemies = [];
  const add = (x, z, hp = 10000) => {
    const enemy = game._spawnEnemy('melee', x, z);
    enemy.hp = enemy.maxHp = hp; enemy.speed = 0; enemy.spawnTime = 999;
    return enemy;
  };
  return { game, add };
}

test('three starter classes are owned and selection/reset rejects locked equipment', () => {
  const game = new Game({ seed: 1, weaponId: 'water-staff' }).start();
  assert.deepEqual(game.inventory, STARTER_WEAPON_IDS);
  assert.equal(game.weapon.element, 'water');
  assert.equal(game.weapon.className, '潮汐使');
  assert.equal(game.equipWeapon('fire-greatsword'), false);
  assert.equal(game.equipWeapon('missing'), false);
  assert.equal(game.equipWeapon('lightning-spear'), true);
  game.reset();
  assert.equal(game.weapon.id, 'water-staff');
  game.reset({ weaponId: 'lightning-spear' });
  assert.equal(game.weapon.id, 'lightning-spear');
  assert.equal(EQUIPMENT.length, 6);
});

test('derived equipment stats preserve base upgrades, HP and attack cooldown across swaps', () => {
  const { game, add } = fixture(); add(3, 0);
  game.player.damage += 7; game.player.attackRange += 0.35;
  game.player.hp = 73; game.player.attackCd = 0.33;
  game.boons.push({ id: 'edge', stacks: 1 });
  const base = { damage: game.player.damage, range: game.player.attackRange };
  for (let i = 0; i < 12; i++) {
    game.equipWeapon('water-staff'); game.equipWeapon('lightning-spear'); game.equipWeapon('fire-sword');
  }
  assert.equal(game.combatStats.damage, 33);
  assert.equal(game.player.damage, base.damage);
  assert.equal(game.player.attackRange, base.range);
  assert.equal(game.player.hp, 73);
  assert.equal(game.player.attackCd, 0.33);
  assert.deepEqual(game.boons, [{ id: 'edge', stacks: 1 }]);
  assert.equal(game.statsForWeapon('fire-greatsword').damage, 33 * 1.28);
});

test('element cooldowns tick while unequipped and cannot be reset by same-element tier swaps', () => {
  const { game, add } = fixture(); add(12, 0);
  assert.equal(game._castSkill(), true);
  const fireCd = game.player.skillCd;
  game._grantEquipment('fire-greatsword');
  game.equipWeapon('fire-greatsword');
  assert.equal(game.player.skillCd, fireCd);
  assert.equal(game._castSkill(), false);
  game.equipWeapon('lightning-spear');
  assert.equal(game.player.skillCd, 0);
  game._castSkill(); const lightningCd = game.player.skillCd;
  advance(game, 1);
  game.equipWeapon('fire-sword');
  assert.ok(Math.abs(game.player.skillCd - (fireCd - 1)) < 1e-7);
  game.equipWeapon('lightning-spear');
  assert.ok(Math.abs(game.player.skillCd - (lightningCd - 1)) < 1e-7);
});

test('fire damages a group, burns the ground, buffs damage and expires without base stat mutation', () => {
  const { game, add } = fixture();
  const a = add(2, 0), b = add(-2, 0), outside = add(8, 0);
  const damage = game.combatStats.skillDamage;
  game._castSkill();
  assert.equal(a.hp, 10000 - damage); assert.equal(b.hp, 10000 - damage); assert.equal(outside.hp, 10000);
  assert.equal(game.areas[0].element, 'fire');
  assert.equal(game.activeBuffs[0].id, 'flame-fury');
  assert.equal(game.combatStats.damage, 26 * 1.2);
  advance(game, 1);
  assert.ok(a.hp < 10000 - damage);
  assert.equal(outside.hp, 10000);
  advance(game, 4.1);
  assert.equal(game.areas.length, 0); assert.equal(game.activeBuffs.length, 0);
  assert.equal(game.player.damage, 26); assert.equal(game.combatStats.damage, 26);
});

test('burning kills use normal kill, XP, gold and life-on-kill processing exactly once', () => {
  const { game, add } = fixture();
  const enemy = add(1, 0, game.combatStats.skillDamage + 4); add(12, 0);
  game.player.hp = 80; game.player.lifeOnKill = 2;
  game._castSkill(); assert.equal(enemy.hp, 4);
  advance(game, 0.8);
  assert.equal(enemy.dead, true); assert.equal(game.kills, 1); assert.equal(game.player.hp, 82);
  assert.equal(game.player.xp, enemy.xp); assert.ok(game.gold > 0);
  advance(game, 1);
  assert.equal(game.kills, 1);
  assert.equal(game.drainEvents().filter(event => event.type === 'kill' && event.id === enemy.id).length, 1);
});

test('lightning chains to distinct targets outside its first ring and accelerates attacks', () => {
  const { game, add } = fixture('lightning-spear');
  const inner = add(5.5, 0), hop1 = add(8.5, 0), hop2 = add(11.5, 0), hop3 = add(14.5, 0), tooFar = add(-12, 0);
  const baseInterval = game.combatStats.attackInterval;
  game._castSkill();
  for (const enemy of [inner, hop1, hop2, hop3]) { assert.ok(enemy.hp < enemy.maxHp); assert.ok(enemy.stun > 0); }
  assert.equal(tooFar.hp, tooFar.maxHp);
  assert.equal(game.combatStats.attackInterval, baseInterval / 1.3);
  const skill = game.drainEvents().find(event => event.type === 'skill');
  assert.equal(skill.chain.length, 3); assert.equal(skill.targets.length, 4);
  assert.equal(new Set(skill.targets.map(target => target.id)).size, 4);
  game.player.attackCd = 0;
  game.update(1 / 60, { attack: true, aimX: 1 });
  const attack = game.drainEvents().find(event => event.type === 'attack');
  assert.equal(attack.duration, game.combatStats.attackInterval);
  assert.equal(attack.element, 'lightning');
});

test('water slows enemies and a finite shield absorbs damage without granting invulnerability', () => {
  const { game, add } = fixture('water-staff'); const enemy = add(3, 0);
  game.player.invulnerable = 0;
  game._castSkill();
  assert.ok(Math.abs(enemy.slowFactor - 0.58) < 1e-9); assert.ok(enemy.slowRemaining > 3);
  const hp = game.player.hp, shield = game.player.shield;
  assert.ok(shield > 30);
  game._hurtPlayer(10, 'test');
  assert.equal(game.player.hp, hp); assert.equal(game.player.shield, shield - 10); assert.equal(game.player.invulnerable, 0);
  game._hurtPlayer(shield, 'test');
  assert.equal(game.player.shield, 0); assert.equal(game.player.hp, hp - 10);
  assert.equal(game.activeBuffs.some(buff => buff.id === 'tide-shield'), false);
  advance(game, 4.1);
  assert.equal(enemy.slowFactor, 1); assert.equal(enemy.slowRemaining, 0);
});

test('water slow changes actual enemy travel distance and unspent shield expires', () => {
  const slowed = fixture('water-staff'), normal = fixture('fire-sword');
  const a = slowed.add(5, 0), b = normal.add(5, 0);
  for (const enemy of [a, b]) { enemy.spawnTime = 0; enemy.speed = 2.05; enemy.attackCd = 999; }
  slowed.game._castSkill(); a.stun = 0;
  const slowStart = a.x, normalStart = b.x;
  advance(slowed.game, 1); advance(normal.game, 1);
  assert.ok((slowStart - a.x) < (normalStart - b.x) * 0.65, 'slow must reduce physical movement after knockback rather than only a UI status');
  assert.ok(slowed.game.player.shield > 0);
  advance(slowed.game, 5.1);
  assert.equal(slowed.game.player.shield, 0);
  assert.equal(slowed.game.activeBuffs.some(buff => buff.id === 'tide-shield'), false);
});

test('buff refresh replaces duration and potency; shield refresh never adds pools', () => {
  const { game, add } = fixture(); add(12, 0);
  game._castSkill(); advance(game, 0.6); game.player.skillCd = 0; game._castSkill();
  assert.equal(game.activeBuffs.length, 1); assert.equal(game.activeBuffs[0].stacks, 1);
  assert.equal(game.activeBuffs[0].remaining, 5); assert.equal(game.combatStats.damage, 31.2);
  game.equipWeapon('water-staff'); game._castSkill(); const shield = game.player.shield;
  game.player.skillCd = 0; game._castSkill();
  assert.equal(game.player.shield, shield);
  assert.equal(game.activeBuffs.filter(buff => buff.id === 'tide-shield').length, 1);
});

test('each tier-two weapon changes skill behavior and Tab cycles elements using highest owned tier', () => {
  const { game, add } = fixture(); add(2, 0);
  for (const weapon of EQUIPMENT.filter(item => item.tier === 2)) game._grantEquipment(weapon.id);
  game.equipWeapon('fire-greatsword'); game._castSkill();
  assert.equal(game.areas[0].duration, 4.5); assert.equal(game.areas[0].variant, 'inferno-ring');
  game.cycleWeapon(); assert.equal(game.weapon.id, 'lightning-halberd'); game._castSkill();
  const lightningArea = game.areas.find(area => area.element === 'lightning');
  assert.equal(lightningArea.interval, 0.65); assert.ok(lightningArea.damage > 0);
  game.cycleWeapon(); assert.equal(game.weapon.id, 'water-scepter'); game._castSkill();
  const waterArea = game.areas.find(area => area.element === 'water');
  assert.equal(waterArea.interval, 0.8); assert.ok(waterArea.damage > 0); assert.ok(game.player.shield > 48);
  game.cycleWeapon(); assert.equal(game.weapon.id, 'fire-greatsword');
});

test('tier-two lightning echo and water pulses actually deal their delayed damage', () => {
  for (const [id, element, wait] of [['lightning-halberd', 'lightning', 0.7], ['water-scepter', 'water', 0.85]]) {
    const { game, add } = fixture(); const enemy = add(2, 0);
    game._grantEquipment(id); game.equipWeapon(id); game._castSkill();
    const hp = enemy.hp; advance(game, wait);
    assert.ok(enemy.hp < hp, `${element} delayed pulse must damage a target`);
    assert.ok(game.drainEvents().some(event => event.type === 'areapulse' && event.element === element));
  }
});

test('AOE, lingering fields and lightning chains never cross the rock gap at a dogleg', () => {
  for (const weaponId of STARTER_WEAPON_IDS) {
    const { game, add } = fixture(weaponId);
    game._enterRoom(1); game.enemies = [];
    game.player.x = 28; game.player.z = -4; game.player.skillRadius = 12;
    const throughWall = add(30, -7.1), near = add(27.9, -4);
    game._castSkill(); advance(game, 1);
    assert.equal(throughWall.hp, throughWall.maxHp, `${weaponId} must respect the rock gap`);
    assert.ok(near.hp < near.maxHp);
    const event = game.drainEvents().find(event => event.type === 'skill');
    assert.ok(!event.targets.some(target => target.id === throughWall.id));
  }
});

test('first-room reward guarantees an upgrade and elite equipment pickups enter inventory once', () => {
  const { game, add } = fixture('water-staff');
  game.enemies = []; game.waveIndex = game.waveCount - 1;
  game.update(1 / 60, {}); assert.equal(game.roomCleared, true);
  game.interact(); game.chooseUpgrade(0);
  assert.ok(game.inventory.includes('water-scepter'));
  const count = game.inventory.length;
  game.interact(); assert.equal(game.inventory.length, count);
  game._enterRoom(2); game.enemies = [];
  const elite = add(game.player.x + 0.2, game.player.z, 1); elite.elite = true;
  game._damageEnemy(elite, 2, 'test');
  const drop = game.drops.find(item => item.type === 'equipment');
  assert.ok(drop); game._updateDrops(0, true);
  assert.ok(game.inventory.includes(drop.weaponId));
  assert.equal(game.inventory.length, count + 1);
  assert.equal(game.drainEvents().filter(event => event.type === 'equipment' && event.weaponId === drop.weaponId).length, 1);
});

test('death and restart clear temporary areas, buffs, shields and cooldowns, then restore starter inventory', () => {
  const { game, add } = fixture(); add(12, 0);
  game._castSkill(); game.equipWeapon('water-staff'); game._castSkill();
  game._grantEquipment('fire-greatsword'); game.player.invulnerable = 0;
  game._hurtPlayer(100000, 'test');
  assert.equal(game.status, 'dead'); assert.equal(game.areas.length, 0); assert.equal(game.activeBuffs.length, 0); assert.equal(game.player.shield, 0);
  assert.deepEqual(game.skillCooldowns, { fire: 0, lightning: 0, water: 0 });
  assert.equal(game.equipWeapon('lightning-spear'), false);
  game.reset();
  assert.deepEqual(game.inventory, STARTER_WEAPON_IDS); assert.equal(game.weapon.id, 'fire-sword');
  assert.equal(game.combatStats.damage, 26); assert.equal(game.areas.length, 0); assert.equal(game.activeBuffs.length, 0);
});
