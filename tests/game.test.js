import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, ROOMS, MAX_ACTIVE_ENEMIES } from '../src/game.js';
import { WORLD, ZONES, isWalkable, constrainMove, canTravel, navigationTarget } from '../src/world.js';

function tickFor(game, seconds, input = {}) {
  for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) game.update(1 / 60, input);
}

function boltAtPlayer(game, damage = 20) {
  game.projectiles.push({ id: 'test-bolt', x: game.player.x, z: game.player.z, vx: 0, vz: 0, radius: 0.3, damage, life: 2, type: 'bolt' });
}

function settleChoices(game) {
  let guard = 0;
  while ((game.status === 'upgrade' || (game.status === 'playing' && game._pendingLevels > 0 && game.enemies.length === 0)) && guard++ < 180) {
    if (game.status === 'upgrade') assert.equal(game.chooseUpgrade(0), true);
    else game.update(1 / 60);
  }
  assert.ok(guard < 180, 'upgrade queue and impact delay must terminate');
}

function walkTo(game, target, { attack = false } = {}) {
  let frames = 0;
  while (Math.hypot(game.player.x - target.x, game.player.z - target.z) > 0.12 && frames++ < 5000) {
    settleChoices(game);
    const dx = target.x - game.player.x, dz = target.z - game.player.z;
    const d = Math.hypot(dx, dz);
    game.update(1 / 60, { moveX: dx / d, moveZ: dz / d, attack });
    assert.ok(isWalkable(game.player.x, game.player.z, game.player.radius), 'travel must stay inside the real floor');
  }
  assert.ok(frames < 5000, `cannot walk to ${target.x}, ${target.z} from ${game.player.x}, ${game.player.z}`);
}

function walkNextPassage(game) {
  const index = game.roomIndex;
  for (const point of WORLD.corridors[index].path) walkTo(game, point);
  assert.equal(game.roomIndex, index + 1, 'entering the next zone starts its encounter');
}

test('same seed yields the same spawns, stats and event stream', () => {
  const first = new Game({ seed: 'ember-42' }).start();
  const second = new Game({ seed: 'ember-42' }).start();
  for (let frame = 0; frame < 240; frame++) {
    const input = { moveX: frame < 120 ? 1 : -1, aimX: 0, aimZ: -1, attack: true, dash: frame === 20, skill: frame === 180 };
    first.update(1 / 60, input);
    second.update(1 / 60, input);
  }
  assert.deepEqual(first.player, second.player);
  assert.deepEqual(first.enemies, second.enemies);
  assert.deepEqual(first.drainEvents(), second.drainEvents());
  const other = new Game({ seed: 'other-seed' }).start();
  assert.notDeepEqual(other.enemies.map(({ x, z }) => [x, z]), first.enemies.map(({ x, z }) => [x, z]));
});

test('movement is normalized, stays inside the world boundary, and aim is a direction', () => {
  const game = new Game({ seed: 1 }).start();
  const initial = { x: game.player.x, z: game.player.z };
  game.update(0.1, { moveX: 1, moveZ: 1, aimX: 1, aimZ: 0 });
  assert.ok(Math.abs(Math.hypot(game.player.x - initial.x, game.player.z - initial.z) - 0.5) < 0.0001);
  assert.ok(Math.abs(game.player.facing - Math.PI / 2) < 0.0001);
  game.player.invulnerable = 999;
  tickFor(game, 8, { moveX: 1, moveZ: 1 });
  assert.ok(game.player.x > 16.3 && game.player.x <= 16.52);
  assert.ok(game.player.z > 12.3 && game.player.z <= 12.52);
  assert.equal(isWalkable(game.player.x, game.player.z, game.player.radius), true);
});

test('melee attacks use a forward arc, hold repeats, and cooldown blocks immediate hits', () => {
  const game = new Game({ seed: 2 }).start();
  const [front, back] = game.enemies;
  game.player.x = 0;
  game.player.z = 0;
  game.player.critChance = 0;
  front.x = 0; front.z = 2; front.hp = front.maxHp = 1000;
  back.x = 0; back.z = -2; back.hp = back.maxHp = 1000;
  game.update(1 / 60, { aimX: 0, aimZ: 1, attack: true });
  assert.equal(front.hp, 974);
  assert.equal(back.hp, 1000);
  game.update(1 / 60, { aimX: 0, aimZ: 1, attack: true });
  assert.equal(front.hp, 974);
  tickFor(game, 0.5, { aimX: 0, aimZ: 1, attack: true });
  assert.equal(front.hp, 948);
});

test('dash gives invulnerability, respects cooldown and triggers once while held', () => {
  const game = new Game({ seed: 3 }).start();
  game.player.invulnerable = 0;
  const hp = game.player.hp;
  boltAtPlayer(game, 80);
  game.update(1 / 60, { dash: true, moveX: 1 });
  assert.equal(game.player.hp, hp);
  assert.ok(game.player.dashCd > 1);
  assert.ok(game.player.invulnerable > 0);
  tickFor(game, 1.6, { dash: true, moveX: 1 });
  assert.equal(game.drainEvents().filter(event => event.type === 'dash').length, 1);
  game.update(1 / 60, {});
  game.update(1 / 60, { dash: true });
  assert.equal(game.drainEvents().filter(event => event.type === 'dash').length, 1);
});

test('skill damages nearby enemies, clears bolts, and cannot ignore cooldown', () => {
  const game = new Game({ seed: 5 }).start();
  const enemy = game.enemies[0];
  enemy.x = game.player.x + 1;
  enemy.z = game.player.z;
  enemy.hp = enemy.maxHp = 1000;
  const damage = game.combatStats.skillDamage, cooldown = game.combatStats.skillCooldown;
  boltAtPlayer(game);
  game.update(1 / 60, { skill: true });
  assert.equal(enemy.hp, 1000 - damage);
  assert.equal(game.projectiles.length, 0);
  assert.ok(game.player.skillCd > cooldown - 0.1);
  game.update(1 / 60, {});
  game.update(1 / 60, { skill: true });
  assert.equal(enemy.hp, 1000 - damage);
});

test('potions preserve full-health inventory and heal only once per press', () => {
  const game = new Game({ seed: 8 }).start();
  game.update(1 / 60, { potion: true });
  assert.equal(game.player.potions, 3);
  game.update(1 / 60, {});
  game.player.hp = 10;
  tickFor(game, 0.9, { potion: true });
  assert.equal(game.player.potions, 2);
  assert.equal(game.player.hp, 65);
  game.update(1 / 60, {});
  game.update(1 / 60, { potion: true });
  assert.equal(game.player.potions, 1);
  assert.equal(game.player.hp, 120);
});

test('telegraphed melee can be dodged before it resolves', () => {
  const game = new Game({ seed: 11 }).start();
  game.enemies = [];
  const enemy = game._spawnEnemy('melee', 0, 1.4);
  game.player.x = 0; game.player.z = 0; game.player.invulnerable = 0;
  enemy.x = 0; enemy.z = 1.4; enemy.spawnTime = 0; enemy.attackCd = 0;
  game.update(1 / 60, {});
  assert.ok(enemy.windup > 0);
  assert.equal(game.telegraphs.length, 1);
  assert.equal(game.player.hp, game.player.maxHp);
  tickFor(game, 0.7, { moveX: 1 });
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.telegraphs.length, 0);
});

test('melee telegraph describes its full damaging sector, including a diagonal landing', () => {
  const game = new Game({ seed: 3 }).start();
  game.enemies = [];
  const enemy = game._spawnEnemy('melee', 0, 0);
  enemy.x = 0; enemy.z = 0; enemy.spawnTime = 0; enemy.attackCd = 0;
  game.player.x = 0; game.player.z = 1.8; game.player.invulnerable = 0;
  game.update(1 / 60, {});
  const warning = { ...game.telegraphs[0] };
  assert.equal(warning.type, 'cone');
  assert.equal(warning.radius, 2.25);
  assert.equal(warning.arc, Math.PI * 0.65);
  assert.equal(warning.angle, 0);
  // This position was entirely outside the former narrow rectangular warning,
  // but lies inside the actual forward sector and must be visibly warned.
  game.player.x = 1.5; game.player.z = 1.5;
  const dx = game.player.x - warning.x;
  const dz = game.player.z - warning.z;
  assert.ok(Math.hypot(dx, dz) < warning.radius);
  assert.ok(Math.abs(Math.atan2(dx, dz) - warning.angle) < warning.arc / 2);
  const hp = game.player.hp;
  tickFor(game, 0.7);
  assert.equal(hp - game.player.hp, 13);
});

test('XP upgrades wait for the wave to clear, pause simulation, reject invalid choices and resume safely', () => {
  const game = new Game({ seed: 14 }).start();
  game.drops.push({ id: 'xp-test', type: 'xp', x: game.player.x, z: game.player.z, value: 250, radius: 0.1, age: 0 });
  game.update(1 / 60, {});
  assert.equal(game.status, 'playing', 'level selection must not interrupt a living pack');
  assert.equal(game.player.level, 3);
  game.enemies = [];
  game.update(1 / 60, {});
  assert.equal(game.status, 'upgrade');
  assert.equal(game.choiceReason, 'level');
  assert.equal(game.choices.length, 3);
  assert.equal(new Set(game.choices.map(choice => choice.id)).size, 3);
  const time = game.time;
  const x = game.player.x;
  game.update(0.1, { moveX: 1, attack: true });
  assert.equal(game.time, time);
  assert.equal(game.player.x, x);
  assert.equal(game.chooseUpgrade(99), false);
  assert.equal(game.chooseUpgrade(0.5), false);
  settleChoices(game);
  assert.equal(game.status, 'playing');
  assert.equal(game.player.level, 3);
  assert.equal(game.boons.reduce((sum, boon) => sum + boon.stacks, 0), 2);
  game.update(1 / 60, { moveX: 1 });
  assert.ok(game.player.x > x);
});

test('all six rooms, waves, reward choices and the final victory are reachable', () => {
  const game = new Game({ seed: 54321 }).start();
  game.player.damage = 100000;
  game.player.attackRange = 50;
  game.player.attackArc = Math.PI * 2;
  game.player.invulnerable = 9999;
  let visited = 0;
  for (let room = 0; room < ROOMS.length; room++) {
    assert.equal(game.roomIndex, room);
    visited++;
    let frames = 0;
    while (!game.roomCleared && game.status !== 'won' && frames++ < 3000) {
      settleChoices(game);
      game.update(1 / 30, { attack: true, aimZ: 1 });
    }
    assert.ok(frames < 3000, `room ${room + 1} should not stall`);
    assert.equal(game.roomCleared, true);
    if (room === ROOMS.length - 1) break;
    settleChoices(game);
    assert.equal(game.rewardReady, true);
    assert.equal(game.interact(), true);
    assert.equal(game.status, 'upgrade');
    assert.equal(game.choiceReason, 'room');
    settleChoices(game);
    assert.equal(game.rewardReady, false);
    assert.equal(game.roomRewardTaken, true);
    const position = { x: game.player.x, z: game.player.z };
    assert.equal(game.interact(), false, 'E never teleports between zones');
    assert.deepEqual({ x: game.player.x, z: game.player.z }, position);
    walkNextPassage(game);
    if (room === 0) {
      for (const point of [...WORLD.corridors[0].path].reverse()) walkTo(game, point);
      walkTo(game, ZONES[0].center);
      assert.equal(game.currentZoneId, ZONES[0].id);
      assert.equal(game.roomIndex, 1, 'backtracking does not replay a cleared encounter');
      assert.ok(game.clearedZoneIds.has(ZONES[0].id));
      for (const point of WORLD.corridors[0].path) walkTo(game, point);
    }
  }
  assert.equal(visited, 6);
  assert.equal(game.status, 'won');
  assert.equal(game.visitedZoneIds.size, 6);
  assert.equal(game.clearedZoneIds.size, 6);
  assert.equal(game.progress, 1);
  assert.ok(game.kills >= 66);
  const events = game.drainEvents();
  assert.equal(events.filter(event => event.type === 'room').length, 6);
  assert.equal(events.filter(event => event.type === 'clear').length, 6);
  assert.equal(events.filter(event => event.type === 'win').length, 1);
});

test('the boss enters a second phase and summons a finite reinforcement group', () => {
  const game = new Game({ seed: 51 }).start();
  // Use public progression, then reduce the boss to its phase threshold.
  game.player.damage = 100000; game.player.attackRange = 50; game.player.attackArc = Math.PI * 2; game.player.invulnerable = 9999;
  while (game.roomIndex < 5) {
    for (let i = 0; i < 1000 && !game.roomCleared; i++) { settleChoices(game); game.update(0.1, { attack: true }); }
    assert.equal(game.roomCleared, true);
    settleChoices(game); game.interact(); settleChoices(game);
    walkNextPassage(game);
  }
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  assert.ok(boss);
  const firstWave = game.enemies.length;
  boss.hp = boss.maxHp * 0.49;
  tickFor(game, 0.8);
  assert.equal(boss.phase, 2);
  const reinforced = game.enemies.length;
  assert.ok(reinforced > firstWave);
  assert.ok(reinforced <= MAX_ACTIVE_ENEMIES);
  tickFor(game, 0.8);
  assert.equal(game.enemies.length, reinforced, 'reinforcements must not repeat every frame');
});

test('death is terminal until reset, and reset restores the original seeded run', () => {
  const game = new Game({ seed: 77 }).start();
  const originalSpawns = game.enemies.map(({ x, z, type }) => ({ x, z, type }));
  game.player.hp = 1;
  game.player.invulnerable = 0;
  boltAtPlayer(game, 999);
  game.update(1 / 60, {});
  assert.equal(game.status, 'dead');
  assert.equal(game.player.hp, 0);
  const time = game.time;
  tickFor(game, 1, { moveX: 1, attack: true, skill: true, potion: true });
  assert.equal(game.time, time);
  assert.equal(game.drainEvents().filter(event => event.type === 'death').length, 1);
  game.reset();
  assert.equal(game.status, 'playing');
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.kills, 0);
  assert.equal(game.time, 0);
  assert.deepEqual(game.enemies.map(({ x, z, type }) => ({ x, z, type })), originalSpawns);
});

test('all six zones are joined by walkable continuous passages, with two reachable alcoves', () => {
  assert.ok(WORLD.bounds.maxX - WORLD.bounds.minX > 140);
  assert.ok(WORLD.bounds.maxZ - WORLD.bounds.minZ > 120);
  for (const corridor of WORLD.corridors) {
    assert.equal(canTravel(ZONES[corridor.from].center.x, ZONES[corridor.from].center.z, corridor.path[0].x, corridor.path[0].z, 0.48), true);
    for (let i = 1; i < corridor.path.length; i++) {
      const a = corridor.path[i - 1], b = corridor.path[i];
      assert.equal(canTravel(a.x, a.z, b.x, b.z, 1.1), true, `boss-sized body must fit ${corridor.id}`);
    }
    const end = corridor.path.at(-1), target = ZONES[corridor.to].center;
    assert.equal(canTravel(end.x, end.z, target.x, target.z, 0.48), true);
  }
  for (const alcove of WORLD.alcoves) {
    const entrance = alcove.path[0];
    assert.equal(canTravel(entrance.x, entrance.z, alcove.center.x, alcove.center.z, 0.48), true);
  }
  assert.equal(isWalkable(0, -50), false);
  assert.equal(isWalkable(200, 200), false);
});

test('a long dash cannot tunnel across the gap at a dogleg, and walls permit sliding', () => {
  assert.equal(isWalkable(16, -4, 0.48), true);
  assert.equal(isWalkable(35, -4, 0.48), true);
  assert.equal(canTravel(16, -4, 35, -4, 0.48), false);
  const stopped = constrainMove(16, -4, 35, -4, 0.48);
  assert.ok(stopped.x < 28.1, 'sweep must stop before the rock gap even when destination is valid');
  assert.ok(isWalkable(stopped.x, stopped.z, 0.48));
  const sliding = constrainMove(-16.4, 0, -20, 5, 0.48);
  assert.ok(sliding.x >= -16.52);
  assert.ok(sliding.z > 4.8, 'pressing into a wall must retain the tangential movement');
});

test('closed passage blocks leaving the first encounter and dash respects its seal', () => {
  const game = new Game({ seed: 18 }).start();
  game.player.x = 16; game.player.z = -4; game.player.invulnerable = 999;
  tickFor(game, 1, { dash: true, moveX: 1 });
  assert.ok(game.player.x <= 16.52);
  assert.equal(game.roomIndex, 0);
  assert.equal(game.visitedZoneIds.size, 1);
});

test('projectiles stop at rock gaps and pursuing enemies choose a real turn', () => {
  const game = new Game({ seed: 6 }).start();
  game._enterRoom(1);
  game.enemies = [];
  game.player.x = 35; game.player.z = -4; game.player.invulnerable = 0;
  const hp = game.player.hp;
  game.projectiles.push({ id: 'gap-bolt', x: 28, z: -4, vx: 420, vz: 0, radius: 0.19, damage: 40, life: 4 });
  game.update(1 / 60, {});
  assert.equal(game.player.hp, hp);
  assert.equal(game.projectiles.length, 0);
  const target = navigationTarget({ x: 28, z: -4 }, { x: 35, z: -4 }, 0.48);
  assert.notDeepEqual(target, { x: 35, z: -4 });
  assert.equal(canTravel(28, -4, target.x, target.z, 0.48), true);
  const pursuer = game._spawnEnemy('melee', 28, -4);
  game.player.invulnerable = 999;
  for (let i = 0; i < 1200; i++) {
    game.update(1 / 60, {});
    assert.equal(isWalkable(pursuer.x, pursuer.z, pursuer.radius), true);
  }
  assert.ok(Math.hypot(pursuer.x - game.player.x, pursuer.z - game.player.z) < 2.2, 'enemy must actually finish the turn and reach the player');
});
