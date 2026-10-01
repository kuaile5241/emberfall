import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore } from '../src/profile.js';
import { Game } from '../src/game.js';
import { WORLD, AQUEDUCT_WORLD, isWalkable } from '../src/world.js';
import { campaignNodeState, expeditionUnlocked } from '../src/campaign.js';
import { playCampaignRun } from '../tools/campaign-bot.mjs';

function freshCamp(weaponId, seed) {
  const values = new Map(), key = `emberfall.campaign-flow.${weaponId}.${seed}`;
  const storage = { getItem(id) { return values.get(id) ?? null; }, setItem(id, value) { values.set(id, value); } };
  const store = new ProfileStore({ storage, key });
  assert.equal(store.selectWeapon(weaponId).ok, true);
  assert.equal(store.buyItem('damage-tonic', 1).ok, true);
  assert.equal(store.selectSupply('damage-tonic').ok, true);
  return { store, storage, key };
}
function startRun(store, id, seed, expeditionId) {
  const prepared = store.prepareRun(id, { expeditionId });
  assert.equal(prepared.ok, true, prepared.error);
  const game = new Game({ ...prepared.run, seed, difficulty: 'normal' }).start();
  assert.equal(game.player.hp, 120, 'normal base health is not inflated');
  assert.equal(game.player.damage, 26);
  assert.equal(game.player.speed, 5);
  return game;
}
const trace = game => `${game.expeditionId}: ${Math.round(game.time)}s, room ${game.roomLabel}, ${game.kills} kills, ${Math.round(game.player.hp)} HP`;
function claimChain(store, ids) {
  for (const id of ids) {
    assert.equal(campaignNodeState(store.profile, id), 'completed', `${id} needs real evidence and its claimed predecessor`);
    const before = store.profile, result = store.claimStory(id);
    assert.equal(result.ok, true, `${id}: ${result.error}`);
    assert.equal(store.profile.gold, before.gold + result.reward.gold);
    assert.equal(store.profile.essence, before.essence + result.reward.essence);
    assert.equal(campaignNodeState(store.profile, id), 'claimed');
    const claimed = store.profile;
    assert.equal(store.claimStory(id).error, 'story_not_claimable');
    assert.deepEqual(store.profile, claimed, `${id} cannot pay twice`);
  }
}

for (const [weaponId, graveSeed, waterSeed] of [
  ['fire-sword', 913, 41], ['lightning-spear', 1701, 604], ['water-staff', 604, 1701],
]) {
  test(`${weaponId}: input-only story evidence, two maps, both bosses, persisted ending and exactly-once rewards`, t => {
    const { store, storage, key } = freshCamp(weaponId, graveSeed);
    assert.equal(expeditionUnlocked(store.profile, 'aqueduct'), false);
    assert.equal(store.selectExpedition('aqueduct').error, 'expedition_locked');
    const grave = startRun(store, `campaign-grave-${weaponId}-${graveSeed}`, graveSeed, 'grave');
    const graveRun = playCampaignRun(grave, { store });
    t.diagnostic(trace(grave));
    assert.equal(grave.status, 'won', trace(grave));
    assert.equal(grave.clearedZoneIds.size, 6);
    assert.ok(grave.kills >= 280);
    assert.ok(grave.time < 600, 'real input navigation cannot stall');
    assert.deepEqual(new Set(graveRun.pois), new Set(['burial-relic', 'forge-cache', 'forge-sigil']));
    assert.ok(graveRun.channelFrames >= 70, 'forge investigation takes a held interaction');
    assert.ok(graveRun.checkpoints > 1);
    assert.equal(grave.bossKills, 1);
    assert.equal(store.settleRun(grave.runId, grave.runSummary).ok, true);
    const settledGrave = store.profile;
    assert.equal(store.settleRun(grave.runId, grave.runSummary).duplicate, true);
    assert.deepEqual(store.profile, settledGrave);
    assert.equal(store.claimStory('bell').error, 'story_not_claimable', 'ending cannot skip unclaimed predecessors');
    assert.equal(expeditionUnlocked(store.profile, 'aqueduct'), false, 'winning alone does not bypass the story chain');
    claimChain(store, ['watch', 'names', 'forge', 'bell']);
    assert.equal(expeditionUnlocked(store.profile, 'aqueduct'), true);
    assert.equal(store.selectExpedition('aqueduct').ok, true);
    assert.equal(store.selectWeapon(grave.weaponId).ok, true);
    assert.equal(store.buyItem('damage-tonic', 1).ok, true);
    assert.equal(store.selectSupply('damage-tonic').ok, true);

    const water = startRun(store, `campaign-water-${weaponId}-${waterSeed}`, waterSeed, 'aqueduct');
    assert.strictEqual(water.world, AQUEDUCT_WORLD);
    assert.notDeepEqual(water.world.zones.map(zone => zone.bounds), grave.world.zones.map(zone => zone.bounds));
    const waterRun = playCampaignRun(water, { store });
    t.diagnostic(trace(water));
    assert.equal(water.status, 'won', trace(water));
    assert.deepEqual([...water.clearedZoneIds], ['cistern', 'sluice', 'drowned-throne']);
    assert.equal(water.bossName, '幽潮守望者');
    assert.equal(water.bossKills, 1);
    assert.ok(water.kills >= 100);
    assert.ok(water.time < 600, 'second map paths are traversed using its navigation graph');
    assert.deepEqual(waterRun.pois, ['sluice-wheel']);
    assert.ok(waterRun.channelFrames >= 70, 'wheel cannot be collected by an instant tap');
    assert.equal(water.bossWard, .2, 'actual wheel interaction weakens incoming boss damage');
    assert.ok(waterRun.warnings.includes('ring'), 'the distinct boss ring pattern was exercised');
    assert.ok(waterRun.warnings.includes('pressure'), 'the second map environmental hazard was exercised');
    assert.equal(isWalkable(water.player.x, water.player.z, water.player.radius, water.world.walkable), true);
    assert.equal(store.settleRun(water.runId, water.runSummary).ok, true);
    claimChain(store, ['descent', 'sluice', 'undertow']);
    assert.deepEqual(store.profile.campaign.clears, { grave: 1, aqueduct: 1 });
    assert.equal(store.profile.stats.runs, 2);
    assert.equal(store.profile.stats.wins, 2);
    assert.equal(store.profile.pendingRun, null);
    const ended = store.profile, bytes = storage.getItem(key);
    const reloaded = new ProfileStore({ storage, key });
    assert.deepEqual(reloaded.profile, ended, 'reload preserves narrative, economy and selected expedition');
    assert.equal(reloaded.settleRun(water.runId, water.runSummary).duplicate, true);
    for (const id of ['watch', 'names', 'forge', 'bell', 'descent', 'sluice', 'undertow']) {
      assert.equal(reloaded.claimStory(id).error, 'story_not_claimable');
    }
    assert.equal(storage.getItem(key), bytes, 'duplicates perform no writes after reload');
    assert.deepEqual(reloaded.profile, ended);
  });
}

test('the second map uses connected left-turn routes and its own reachable navigation points', () => {
  assert.notStrictEqual(WORLD, AQUEDUCT_WORLD);
  assert.ok(AQUEDUCT_WORLD.zones.every(zone => zone.center.x <= 0));
  assert.ok(WORLD.zones.some(zone => zone.center.x > 80));
  assert.ok(AQUEDUCT_WORLD.navPoints.length > AQUEDUCT_WORLD.zones.length);
  for (const point of AQUEDUCT_WORLD.navPoints) assert.equal(isWalkable(point.x, point.z, .48, AQUEDUCT_WORLD.walkable), true);
  assert.equal(AQUEDUCT_WORLD.zones.length, 3);
  assert.ok(AQUEDUCT_WORLD.corridors.every(route => route.from < route.to));
});
