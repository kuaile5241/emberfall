import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore } from '../src/profile.js';
import { Game } from '../src/game.js';
import { buildGearById, talentBudget } from '../src/builds.js';
import { campaignNodeState, expeditionUnlocked } from '../src/campaign.js';
import { isWalkable } from '../src/world.js';
import { playBuildRun } from '../tools/build-bot.mjs';

const builds = [
  { weapon: 'fire-sword', armor: 'ash-mantle', starter: 'fire-pillars', alternate: 'fire-meteor',
    core: 'fire-kindling', branch: 'fire-aftershock', alternateBranch: 'fire-pressure', seeds: [913, 41, 604, 1701] },
  { weapon: 'water-staff', armor: 'glacier-robes', starter: 'water-blizzard', alternate: 'water-torrent',
    core: 'water-permafrost', branch: 'water-shatter', alternateBranch: 'water-whiteout', seeds: [604, 1701, 41, 913] },
  { weapon: 'lightning-spear', armor: 'storm-vest', starter: 'lightning-chain', alternate: 'lightning-lances',
    core: 'lightning-conduction', branch: 'lightning-overload', alternateBranch: 'lightning-feedback', seeds: [1701, 604, 913, 41] },
];
const phases = { 'fire-pillars': 'pillar', 'fire-meteor': 'impact', 'water-blizzard': 'snow',
  'lightning-chain': 'jump', 'lightning-lances': 'lances' };
const sources = { 'water-blizzard': 'blizzard', 'water-torrent': 'torrent',
  'lightning-chain': 'chain', 'lightning-lances': 'lance' };

function freshCamp(id) {
  const values = new Map(), key = `emberfall.build-flow.${id}`;
  const storage = { getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, value); } };
  return { storage, key, store: new ProfileStore({ storage, key }) };
}

function equipBuild(store, build, form, branch) {
  assert.equal(store.selectWeapon(build.weapon).ok, true);
  assert.equal(store.equipBuildGear('armor', build.armor).ok, true);
  assert.equal(store.equipBuildGear('relic', form).ok, true);
  assert.equal(store.resetTalents().ok, true);
  assert.equal(store.toggleTalent(build.core).ok, true);
  assert.equal(store.toggleTalent(branch).ok, true);
  assert.deepEqual(store.profile.build.talents, [build.core, branch]);
}

function claimStory(store, ids) {
  for (const id of ids) {
    assert.equal(campaignNodeState(store.profile, id), 'completed', `${id} requires actual exploration and boss evidence`);
    assert.equal(store.claimStory(id).ok, true);
  }
}

function trace(game, form) {
  return `${form}/${game.expeditionId}: ${game.status}, ${Math.round(game.time)}s, room ${game.roomLabel}, ${game.kills} kills, ${Math.round(game.player.hp)} HP, boss ${game.bossKills}`;
}

function runChapter(store, build, form, branch, expeditionId, seed, t, index) {
  assert.equal(store.selectExpedition(expeditionId).ok, true);
  assert.equal(store.buyItem('damage-tonic', 1).ok, true, 'supplies are bought from earned currency');
  assert.equal(store.selectSupply('damage-tonic').ok, true);
  const runId = `build-${form}-${expeditionId}-${seed}-${index}`;
  const expected = { armorId: build.armor, relicId: form, talents: [build.core, branch] };
  const prepared = store.prepareRun(runId);
  assert.equal(prepared.ok, true, prepared.error);
  assert.deepEqual(prepared.run.buildLoadout, expected, 'the normal prepareRun path captures real equipment and talents');
  const repeated = store.prepareRun(runId);
  assert.equal(repeated.reused, true);
  assert.deepEqual(repeated.run.buildLoadout, expected, 'preparation retries retain the same snapshot');
  const game = new Game({ ...prepared.run, seed, difficulty: 'normal' }).start();
  assert.equal(game.player.hp, 120, 'normal starting HP is unchanged');
  assert.equal(game.player.damage, 26, 'base attack stat is unchanged');
  assert.equal(game.player.speed, 5, 'base speed is unchanged');
  assert.equal(game.activeSkill.id, form);
  assert.deepEqual(game.buildLoadout, expected);
  const result = playBuildRun(game, { store });
  t.diagnostic(`${trace(game, form)}; ${result.casts.length} casts; peak effects ${result.peakEffects}, areas ${result.peakAreas}, projectiles ${result.peakProjectiles}`);
  assert.equal(game.status, 'won', trace(game, form));
  assert.equal(game.bossKills, 1, 'the actual boss must be defeated');
  assert.equal(game.clearedZoneIds.size, expeditionId === 'grave' ? 6 : 3);
  assert.ok(game.kills >= (expeditionId === 'grave' ? 280 : 100));
  assert.ok(game.time < 600, 'natural input navigation and combat cannot stall');
  assert.ok(result.casts.length > 0, 'this build must actually cast skills');
  assert.ok(result.casts.some(event => event.form === form),
    'skill events must report the selected new form, rather than merely labeling a legacy circle');
  assert.ok(result.peakEffects > 0, 'a cast creates a real timed shape in the simulation');
  if (phases[form]) assert.ok(result.events.some(event => event.type === 'skillshape' && event.form === form && event.phase === phases[form]),
    `${form} must execute its timed ${phases[form]} phase`);
  if (sources[form]) assert.ok(result.events.some(event => event.type === 'hit' && event.target === 'enemy' && event.source === sources[form]),
    `${form} must actually damage enemies through its own hit rule`);
  if (form === 'fire-pillars' && branch === 'fire-aftershock') assert.ok(result.events.some(event => event.type === 'skillshape' && event.phase === 'pillar-echo'),
    'the selected aftershock talent changes real pillar timing');
  if (form === 'water-blizzard') assert.ok(result.events.some(event => event.type === 'freeze'), 'the selected storm build actually accumulates chill and freezes enemies');
  if (form === 'lightning-chain' && branch === 'lightning-overload') assert.ok(result.events.some(event => event.type === 'skillshape' && event.phase === 'overload'),
    'the selected overload talent creates an actual chain-end explosion');
  assert.ok(result.checkpoints > 1);
  assert.ok(result.channelFrames >= 70, 'the chapter mechanism is completed by held interaction');
  assert.equal(isWalkable(game.player.x, game.player.z, game.player.radius, game.world.walkable), true);
  assert.deepEqual(new Set(result.pois), new Set(expeditionId === 'grave'
    ? ['burial-relic', 'forge-cache', 'forge-sigil'] : ['sluice-wheel']));
  const ended = store.settleRun(runId, game.runSummary);
  assert.equal(ended.ok, true, ended.error);
  assert.equal(ended.duplicate, false);
  assert.equal(store.profile.pendingRun, null);
  const settled = store.profile;
  assert.equal(store.settleRun(runId, game.runSummary).duplicate, true);
  assert.deepEqual(store.profile, settled, 'a duplicate settlement cannot pay extra equipment currency');
  return result;
}

for (const build of builds) {
  test(`${build.starter} + ${build.alternate}: equipped/talented normal input victories across both chapters, earned purchases and reload`, t => {
    const { store, storage, key } = freshCamp(build.starter);
    assert.equal(store.profile.gold, 120);
    assert.equal(talentBudget(store.profile), 3);
    assert.ok(store.profile.build.ownedGear.includes(build.starter));
    assert.ok(!store.profile.build.ownedGear.includes(build.alternate));
    assert.equal(store.buyBuildGear(build.armor).ok, true);
    assert.equal(store.profile.gold, 120 - buildGearById(build.armor).price.gold);
    equipBuild(store, build, build.starter, build.branch);

    runChapter(store, build, build.starter, build.branch, 'grave', build.seeds[0], t, 0);
    claimStory(store, ['watch', 'names', 'forge', 'bell']);
    assert.equal(expeditionUnlocked(store.profile, 'aqueduct'), true);
    runChapter(store, build, build.starter, build.branch, 'aqueduct', build.seeds[1], t, 1);
    claimStory(store, ['descent', 'sluice', 'undertow']);
    assert.deepEqual(store.profile.campaign.clears, { grave: 1, aqueduct: 1 });
    assert.equal(store.profile.stats.wins, 2);
    assert.equal(talentBudget(store.profile), 5);

    const earned = store.profile.gold;
    assert.ok(earned > 120, 'new relic purchase is funded by actual victorious runs and story rewards');
    assert.equal(store.buyBuildGear(build.alternate).ok, true);
    assert.equal(store.profile.gold, earned - buildGearById(build.alternate).price.gold);
    equipBuild(store, build, build.alternate, build.alternateBranch);
    assert.ok(!store.profile.build.talents.includes(build.branch), 'changing branch removes the earlier mutually exclusive talent');
    runChapter(store, build, build.alternate, build.alternateBranch, 'grave', build.seeds[2], t, 2);
    runChapter(store, build, build.alternate, build.alternateBranch, 'aqueduct', build.seeds[3], t, 3);
    assert.deepEqual(store.profile.campaign.clears, { grave: 2, aqueduct: 2 });
    assert.equal(store.profile.stats.runs, 4);
    assert.equal(store.profile.stats.wins, 4);
    assert.equal(talentBudget(store.profile), 6, 'natural victories reach the point cap');
    assert.equal(store.profile.campaign.claimed.length, 7);
    const ended = store.profile, bytes = storage.getItem(key);
    const reloaded = new ProfileStore({ storage, key });
    assert.deepEqual(reloaded.profile, ended, 'reload preserves earned gear, talents, story and reward ledger');
    assert.equal(storage.getItem(key), bytes);
  });
}
