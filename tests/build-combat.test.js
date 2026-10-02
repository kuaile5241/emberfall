import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';

const weaponFor = form => form.startsWith('fire') ? 'fire-sword' : form.startsWith('water') ? 'water-staff' : 'lightning-spear';
function fixture(form, build = {}) {
  const game = new Game({ seed: 987, weaponId: weaponFor(form), buildLoadout: { relicId: form, ...build } }).start();
  game.enemies = []; Object.assign(game.player, { x: 0, z: 0, facing: Math.PI }); game.drainEvents();
  return game;
}
function enemy(game, x, z, hp = 1000, type = 'melee') {
  const target = game._spawnEnemy(type, x, z); target.hp = target.maxHp = hp; target.speed = 0; target.attackCd = 999; target.spawnTime = 0;
  return target;
}
function advance(game, seconds) { for (let i = 0; i < seconds * 60; i++) { game._updateSkillEffects(1 / 60); game._updateEnemies(1 / 60); } }

for (const form of ['fire-pillars', 'fire-meteor', 'water-blizzard', 'water-torrent', 'lightning-chain', 'lightning-lances']) {
  test(`${form}: actual geometry damages forward targets without a player-centred nova`, () => {
    const game = fixture(form), front = enemy(game, 0, -6.5), behind = enemy(game, 0, 5), outside = enemy(game, 10, -6.5);
    assert.equal(game.activeSkill.id, form); assert.equal(game._castSkill(), true);
    assert.equal(front.hp, 1000, 'casting does not apply an instant radial hit');
    advance(game, 1.6);
    assert.ok(front.hp < 1000); assert.equal(behind.hp, 1000); assert.equal(outside.hp, 1000);
    assert.equal(game.areas.length, 0, 'the replacement is not the legacy radial field');
  });
}

test('fire pillars warn first, erupt in order, and pressure adds real pillars with larger radius', () => {
  const game = fixture('fire-pillars', { talents: ['fire-kindling', 'fire-pressure'] });
  const first = enemy(game, 0, -1.75), last = enemy(game, 0, -10);
  game._castSkill(); assert.equal(game.skillEffects[0].points.length, 6); assert.equal(game.skillEffects[0].radius, 1.35 * 1.15);
  advance(game, .2); assert.equal(first.hp, 1000); assert.equal(last.hp, 1000);
  advance(game, .15); assert.ok(first.hp < 1000); assert.equal(last.hp, 1000);
  advance(game, 1.3); assert.ok(last.hp < 1000);
  const phases = game.drainEvents().filter(item => item.type === 'skillshape' && item.phase === 'pillar');
  assert.equal(phases.length, 6); assert.ok(phases[0].time <= phases.at(-1).time);
});

test('meteor has a delayed impact, aftershock and persistent burning using a cast-time snapshot', () => {
  const game = fixture('fire-meteor', { armorId: 'ash-mantle', talents: ['fire-kindling', 'fire-aftershock'] });
  const target = enemy(game, 0, -6.5), damage = game.combatStats.skillDamage;
  assert.ok(Math.abs(damage - 104 * 1.12 * 1.12) < 1e-8);
  assert.equal(game.combatStats.damage, 26, 'skill damage gear does not quietly buff basic attacks');
  game._castSkill(); advance(game, .7); assert.equal(target.hp, 1000);
  game.buildLoadout = { armorId: null, relicId: null, talents: [] }; game.equipWeapon('water-staff');
  advance(game, .2); assert.ok(Math.abs(1000 - target.hp - damage * 1.65) < 1e-8);
  advance(game, .5); assert.ok(1000 - target.hp > damage * 1.65 * 1.4);
  assert.equal(game.skillEffects[0].snapshot.element, 'fire');
});

test('blizzard repeatedly chills and freezes with cooldown; Boss cannot be permanently frozen', () => {
  const game = fixture('water-blizzard', { talents: ['water-permafrost', 'water-whiteout'] });
  const normal = enemy(game, -.6, -6.5), boss = enemy(game, .6, -6.5, 5000, 'boss'); boss.summoned = true;
  game._castSkill(); const effect = game.skillEffects[0];
  assert.equal(effect.duration, 6); assert.equal(effect.radius, 4); assert.ok(Math.abs(game.player.skillCd - 5.6 * 1.2) < 1e-8);
  advance(game, .62); assert.ok(normal.frozenRemaining > .7); assert.ok(boss.freezeCooldown > 3.8); assert.ok(boss.frozenRemaining <= .12);
  advance(game, .3); assert.equal(boss.frozenRemaining, 0); assert.equal(boss.stun, 0);
  const events = game.drainEvents().filter(item => item.type === 'freeze');
  assert.equal(events.filter(item => item.id === boss.id).length, 1);
  assert.equal(events.find(item => item.id === boss.id).duration, .12);
});

test('frozen deaths shatter once without recursively exploding adjacent frozen victims', () => {
  const game = fixture('water-blizzard', { talents: ['water-permafrost', 'water-shatter'] });
  const first = enemy(game, 0, -6.5, 40), second = enemy(game, .7, -6.5, 40), witness = enemy(game, 2.8, -6.5, 1000);
  game._castSkill(); const snapshot = game.skillEffects[0].snapshot;
  for (const target of [first, second]) { target.frozenRemaining = .8; target.freezeSnapshot = snapshot; }
  game._damageSkillEnemy(first, 100, snapshot, 'blizzard');
  assert.equal(first.hp <= 0, true); assert.equal(second.hp <= 0, true);
  assert.equal(witness.hp, 1000, 'a shatter death cannot start a second explosion farther out');
  assert.equal(game.drainEvents().filter(item => item.phase === 'shatter').length, 1);
});

test('the moving torrent sweeps distinct targets once and never hits through a wall', () => {
  const game = fixture('water-torrent');
  const near = enemy(game, 0, -2), far = enemy(game, 1, -9), behindWall = enemy(game, 0, -15);
  const base = game.combatStats.skillDamage; game._castSkill(); advance(game, .35); assert.ok(near.slowRemaining > 0); advance(game, 1.15);
  assert.ok(Math.abs(1000 - near.hp - base * 1.35) < 1e-8); assert.ok(Math.abs(1000 - far.hp - base * 1.35) < 1e-8);
  assert.equal(behindWall.hp, 1000);
});

test('chain visits each target once, respects a wall and applies the final overload', () => {
  const game = fixture('lightning-chain', { armorId: 'storm-vest', talents: ['lightning-conduction', 'lightning-overload'] });
  const targets = [enemy(game, 0, -3), enemy(game, 1, -6), enemy(game, 0, -10)], blocked = enemy(game, 0, -15);
  game._castSkill(); assert.equal(game.skillEffects[0].jumps, 7); advance(game, 1.3);
  const jumps = game.drainEvents().filter(item => item.phase === 'jump'); assert.equal(jumps.length, 3);
  assert.equal(new Set(jumps.map(item => `${item.to.x}:${item.to.z}`)).size, 3); assert.ok(targets.every(target => target.hp < 1000)); assert.equal(blocked.hp, 1000);
});

test('lances penetrate a line of enemies once even when a target intersects multiple rays', () => {
  const game = fixture('lightning-lances'); const near = enemy(game, 0, -2), far = enemy(game, 0, -9), side = enemy(game, 5, -5);
  const damage = game.combatStats.skillDamage; game._castSkill(); advance(game, .5);
  assert.ok(Math.abs(1000 - near.hp - damage * 1.4) < 1e-8); assert.ok(Math.abs(1000 - far.hp - damage * 1.4) < 1e-8); assert.equal(side.hp, 1000);
});

test('feedback has its own one-second cast budget and weapon switches cannot clear elemental cooldown', () => {
  const game = fixture('lightning-lances', { armorId: 'storm-vest', talents: ['lightning-conduction', 'lightning-feedback'] });
  for (let i = 0; i < 12; i++) enemy(game, 0, -1 - i * .6, 20);
  game._registerKillStreak = () => {}; // Existing combo refunds are tested separately.
  game._castSkill(); const snapshot = game.skillEffects[0].snapshot, cooldown = game.player.skillCd;
  assert.ok(Math.abs(cooldown - 5.6 * .88 * .92) < 1e-8); advance(game, .3);
  assert.equal(snapshot.refunded, 1); assert.ok(Math.abs(game.player.skillCd - cooldown + 1) < 1e-8);
  game.equipWeapon('fire-sword'); game.equipWeapon('lightning-spear'); assert.equal(game._castSkill(), false);
});

test('ice armor uses actual slowed/frozen state for skill and attack damage, only for water', () => {
  const game = fixture('water-torrent', { armorId: 'glacier-robes' }), target = enemy(game, 0, -2);
  const damage = game.combatStats.skillDamage; game._castSkill(); advance(game, .5);
  assert.ok(Math.abs(1000 - target.hp - damage * 1.35 * 1.15) < 1e-8);
  const baseline = target.hp; target.x = 0; target.z = -2; game.player.critChance = 0; game._attack();
  assert.ok(Math.abs(baseline - target.hp - game.combatStats.damage * 1.15) < 1e-8);
  game.equipWeapon('fire-sword'); assert.equal(game.combatStats.skillDamage, 104);
});

test('legacy defaults, neutral save inputs and reset preserve the original weapon skills', () => {
  const input = { relicId: 'fire-pillars', armorId: 'ash-mantle', talents: ['fire-kindling'] };
  const game = new Game({ buildLoadout: input }); input.talents.length = 0; input.relicId = 'water-blizzard';
  assert.equal(game.activeSkill.id, 'fire-pillars'); assert.deepEqual(game.buildLoadout.talents, ['fire-kindling']);
  game.reset({ buildLoadout: undefined }); assert.equal(game.activeSkill.id, 'fire-pillars');
  game.reset({ buildLoadout: {} }); assert.equal(game.activeSkill.kind, 'legacy'); assert.equal(game.player.maxHp, 120); assert.equal(game.combatStats.skillDamage, 104);
});

test('mouse aim chooses a real near impact point and distant/wall targets clamp to reachable ground', () => {
  for (const form of ['fire-meteor', 'water-blizzard']) {
    const game = fixture(form), close = enemy(game, 0, -2), distant = enemy(game, 0, -6.5);
    game.update(1 / 60, { aimX: 0, aimZ: -2, skill: true });
    assert.ok(Math.abs(game.skillEffects[0].z + 2) < 1e-8); advance(game, 1);
    assert.ok(close.hp < 1000); assert.equal(distant.hp, 1000);
    game.reset(); game.enemies = []; Object.assign(game.player, { x: 0, z: -12, facing: Math.PI });
    game.update(1 / 60, { aimX: 0, aimZ: -50, skill: true });
    assert.ok(game.skillEffects[0].z > -13, 'the centre never travels beyond the real wall');
  }
});
