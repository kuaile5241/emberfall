import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { WORLD, isWalkable, canTravel, constrainMove, navigationTarget, unlockedSurfaces } from '../src/world.js';

test('navigation escapes a legal corner inside the cached-radius rounding margin', () => {
  const surfaces = unlockedSurfaces(2, true, WORLD), radius = .48;
  let from = { x: 69.94658959925727, z: -44.70805488008909 };
  const goal = { x: 72, z: -31 };
  assert.equal(isWalkable(from.x, from.z, radius, surfaces), true);
  assert.equal(isWalkable(from.x, from.z, .5, surfaces), false);
  assert.equal(canTravel(from.x, from.z, goal.x, goal.z, radius, surfaces), false);
  for (let frame = 0; frame < 300 && Math.hypot(from.x - goal.x, from.z - goal.z) > .2; frame++) {
    const next = navigationTarget(from, goal, radius, surfaces, WORLD.navPoints);
    const length = Math.hypot(next.x - from.x, next.z - from.z);
    assert.ok(length > .01, 'a walkable endpoint must not be stranded by radius rounding');
    assert.equal(canTravel(from.x, from.z, next.x, next.z, radius, surfaces), true);
    const step = Math.min(length, 5 * [1 / 60, .05, 1 / 30][frame % 3]);
    from = constrainMove(from.x, from.z, from.x + (next.x - from.x) / length * step, from.z + (next.z - from.z) / length * step, radius, surfaces);
    assert.equal(isWalkable(from.x, from.z, radius, surfaces), true);
  }
  assert.ok(Math.hypot(from.x - goal.x, from.z - goal.z) < .2);
});

// Local encounter fixtures set room/position to isolate new combat rules. They
// do not establish natural progression or difficulty; campaign-flow does that.
function tick(game, seconds, input = {}) {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) game.update(1 / 60, input);
}

function mechanismFixture(expeditionId = 'aqueduct') {
  const game = new Game({ expeditionId, seed: 71 }).start();
  const id = expeditionId === 'aqueduct' ? 'sluice-wheel' : 'forge-sigil';
  const point = game.interestPoints.find(item => item.id === id);
  game._enterRoom(point.zoneIndex);
  game.enemies = []; game.roomCleared = true; game.rewardReady = false; game.roomRewardTaken = true;
  game._refreshInterestPoints();
  Object.assign(game.player, { x: point.x, z: point.z, invulnerable: 0 });
  game.drainEvents();
  return { game, point };
}

function arenaFixture() {
  const game = new Game({ expeditionId: 'aqueduct', seed: 73 }).start();
  game._enterRoom(game.rooms.length - 1);
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  game.enemies = [boss]; boss.spawnTime = 0; boss.attackCd = 999;
  Object.assign(game.player, { x: boss.x + 5, z: boss.z, invulnerable: 0 });
  game.drainEvents();
  return { game, boss };
}

test('a remote or uncleared mechanism cannot be operated', () => {
  const { game, point } = mechanismFixture();
  game.player.x = point.x + point.radius + 2;
  tick(game, 3, { interact: true });
  assert.equal(game.interactionChannel, null);
  assert.equal(point.completed, false); assert.equal(game.gold, 0);
  game.update(1 / 60, {});
  game.player.x = point.x; game.roomCleared = false;
  game._refreshInterestPoints();
  const guard = game._spawnEnemy('fodder', point.x + 8, point.z);
  guard.stun = 100;
  game.update(1 / 60, { interact: true });
  assert.equal(game.interactionChannel, null);
  assert.equal(point.completed, false);
});

test('tapping E or walking out of range cancels unfinished operation', () => {
  const { game, point } = mechanismFixture();
  game.update(1 / 60, { interact: true });
  assert.ok(game.interactionChannel);
  game.update(1 / 60, {});
  assert.equal(game.interactionChannel, null);
  tick(game, 1, { interact: true });
  assert.ok(game.interactionChannel.elapsed > .9);
  tick(game, .8, { interact: true, moveX: 1 });
  assert.equal(game.interactionChannel, null);
  assert.equal(point.completed, false); assert.equal(game.gold, 0);
});

test('a real projectile hit interrupts operation and held E cannot silently resume it', () => {
  const { game, point } = mechanismFixture();
  tick(game, 1, { interact: true });
  game.projectiles.push({ id: 9001, type: 'bolt', x: game.player.x, z: game.player.z, vx: 0, vz: 0, radius: .2, damage: 10, life: 1 });
  const beforeHp = game.player.hp;
  game.update(1 / 60, { interact: true });
  assert.ok(game.player.hp < beforeHp);
  assert.equal(game.interactionChannel, null);
  assert.ok(game.drainEvents().some(event => event.type === 'channelcancel' && event.reason === 'hit'));
  tick(game, 3, { interact: true });
  assert.equal(point.completed, false);
  game.update(1 / 60, {});
  tick(game, 2.5, { interact: true });
  assert.equal(point.completed, true);
});

test('a modal suspension does not consume the mechanism hold duration', () => {
  const { game, point } = mechanismFixture();
  tick(game, .6, { interact: true });
  const time = game.time, elapsed = game.interactionChannel.elapsed;
  game.status = 'upgrade';
  tick(game, 5, { interact: true });
  assert.equal(game.time, time); assert.equal(game.interactionChannel.elapsed, elapsed);
  assert.equal(point.completed, false);
  game.status = 'playing';
  tick(game, 1, { interact: true });
  assert.equal(point.completed, false, 'paused wall-clock time did not finish the operation');
  tick(game, 1, { interact: true });
  assert.equal(point.completed, true);
});

for (const expeditionId of ['grave', 'aqueduct']) {
  test(`${expeditionId}: completing a held mechanism gives its actual bonus exactly once`, () => {
    const { game, point } = mechanismFixture(expeditionId);
    const damage = game.player.skillDamage;
    tick(game, 2, { interact: true });
    assert.equal(point.completed, false, 'a partial hold cannot collect the objective');
    tick(game, .5, { interact: true });
    assert.equal(point.completed, true);
    assert.ok(game.completedPoiIds.has(point.id));
    assert.equal(game.gold, point.reward.gold);
    if (expeditionId === 'aqueduct') assert.equal(game.bossWard, .2);
    else assert.equal(game.player.skillDamage, damage + point.reward.skillDamage);
    const earnedGold = game.gold;
    game.update(1 / 60, {}); tick(game, 3, { interact: true });
    assert.equal(game.gold, earnedGold);
    assert.equal(game.drainEvents().filter(event => event.type === 'poi' && event.id === point.id).length, 1);
  });
}

test('tidal ring leaves its centre and distant exterior safe while the annulus deals real damage', () => {
  for (const [distance, harmful] of [[1.5, false], [5, true], [9.5, false]]) {
    const { game, boss } = arenaFixture();
    game.player.x = boss.x + distance;
    const hp = game.player.hp;
    game._beginEnemyAttack(boss);
    assert.equal(game.telegraphs[0].type, 'ring');
    tick(game, 1.5);
    if (harmful) assert.ok(Math.abs(hp - game.player.hp - boss.damage) < 1e-8);
    else assert.equal(game.player.hp, hp);
    assert.ok(game.drainEvents().some(event => event.type === 'enemyAttack' && event.kind === 'tide-ring'));
  }
});

test('a timed dash avoids the tidal ring strike', () => {
  const { game, boss } = arenaFixture();
  const hp = game.player.hp;
  game._beginEnemyAttack(boss);
  tick(game, 1.3);
  game.update(1 / 60, { dash: true, moveX: -1 });
  tick(game, .2, { moveX: -1 });
  assert.equal(game.player.hp, hp);
  assert.ok(game.drainEvents().some(event => event.type === 'dash'));
});

test('the actual sluice bonus reduces boss physical damage and does not weaken ordinary enemies', () => {
  const { game, point } = mechanismFixture();
  tick(game, 2.5, { interact: true });
  assert.equal(point.completed, true);
  game._enterRoom(game.rooms.length - 1);
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  Object.assign(game.player, { x: boss.x + 5, z: boss.z, invulnerable: 0 });
  game.enemies = [boss]; boss.spawnTime = 0; boss.attackCd = 999;
  const hp = game.player.hp;
  game._beginEnemyAttack(boss); tick(game, 1.5);
  assert.ok(Math.abs(hp - game.player.hp - boss.damage * .8) < 1e-8);
  const brute = game._spawnEnemy('brute', game.player.x, game.player.z, false);
  game.player.invulnerable = 0;
  const beforeBrute = game.player.hp;
  game._beginEnemyAttack(brute); game._executeEnemyAttack(brute);
  assert.ok(Math.abs(beforeBrute - game.player.hp - brute.damage) < 1e-8);
});

test('the sluice reduction applies once to boss projectiles and never to ordinary projectiles', () => {
  for (const type of ['boss', 'ranged']) {
    const { game, boss } = arenaFixture();
    game.bossWard = .2;
    Object.assign(game.player, { x: boss.x + 2, z: boss.z, invulnerable: 0 });
    const source = type === 'boss' ? boss : game._spawnEnemy('ranged', boss.x, boss.z);
    game.enemies = [source]; source.spawnTime = 0; source.attackCd = 999;
    const expected = source.damage * (type === 'boss' ? .8 : 1), hp = game.player.hp;
    game._spawnBolt(source, Math.PI / 2, 2.5);
    tick(game, .7);
    assert.ok(Math.abs(hp - game.player.hp - expected) < 1e-8, `${type} projectile must apply its ward factor once`);
    assert.equal(game.projectiles.length, 0);
  }
});

function pressureFixture() {
  const game = new Game({ expeditionId: 'aqueduct', seed: 74 }).start();
  game.enemies = [game.enemies[0]]; game.enemies[0].stun = 100;
  Object.assign(game.player, { x: game.rooms[0].center.x, z: game.rooms[0].center.z, invulnerable: 0 });
  game._hazardClock = 1 / 60;
  game.update(1 / 60);
  return game;
}

test('water pressure warns before damage and leaves enough time for a real movement escape', () => {
  const still = pressureFixture(), hp = still.player.hp;
  const mark = still.telegraphs.find(item => item.hazardId != null);
  assert.ok(mark && mark.duration >= 1.3);
  assert.ok(mark.remaining > 1.25, 'the opening frame does not consume the warning');
  tick(still, 1.2);
  assert.equal(still.player.hp, hp);
  tick(still, .15);
  assert.ok(still.player.hp < hp);
  const moving = pressureFixture(), movingHp = moving.player.hp;
  tick(moving, .6, { moveX: 1 }); tick(moving, .8);
  assert.equal(moving.player.hp, movingHp, 'walking out of the warned circle avoids the strike');
  assert.equal(moving.hazards.length, 0);
});

test('clearing or changing an area removes pending water pressure and does not leave ghost attacks', () => {
  const game = pressureFixture(), initialHazard = game.hazards[0];
  game.enemies = []; game.waveIndex = game.waveCount - 1;
  game.update(1 / 60);
  assert.equal(game.roomCleared, true);
  assert.equal(game.hazards.length, 0);
  assert.ok(game.telegraphs.every(mark => mark.hazardId !== initialHazard.id));
  const hp = game.player.hp;
  tick(game, 2);
  assert.equal(game.player.hp, hp);
  assert.equal(game.hazards.length, 0);
  game._enterRoom(1); game._hazardClock = 1 / 60; game.update(1 / 60);
  assert.ok(game.hazards.length > 0);
  const outgoingIds = new Set(game.hazards.map(hazard => hazard.id));
  game._enterRoom(game.rooms.length - 1);
  assert.equal(game.hazards.length, 0);
  assert.ok(game.telegraphs.every(mark => !outgoingIds.has(mark.hazardId)));
});

test('a blessing that appears during a held mechanism cancels it and permits a fresh hold', () => {
  const { game, point } = mechanismFixture('grave');
  tick(game, .4, { interact: true });
  assert.ok(game.interactionChannel);
  game._offerUpgrades('level');
  assert.equal(game.interactionChannel, null, 'the old channel cannot survive a blessing modal');
  assert.equal(point.completed, false);
  tick(game, 3, { interact: true });
  assert.equal(point.completed, false);
  assert.equal(game.chooseUpgrade(0), true);
  game.update(1 / 60, {});
  tick(game, 2.5, { interact: true });
  assert.equal(point.completed, true);
  assert.equal(game.drainEvents().filter(event => event.type === 'poi' && event.id === point.id).length, 1);
});
