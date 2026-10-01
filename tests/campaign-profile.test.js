import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore, createDefaultProfile, DEFAULT_PROFILE_KEY } from '../src/profile.js';
import { STORY_NODES, campaignNodeState, currentStoryNode, normalizeCampaign, storyEvidenceFromRun } from '../src/campaign.js';

function fixture(initial) {
  const data = new Map(initial ? [[DEFAULT_PROFILE_KEY, JSON.stringify(initial)]] : []);
  const storage = { failWrite: false, writes: 0,
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { if (this.failWrite) throw Error('disk full'); this.writes++; data.set(key, value); } };
  return { storage, store: new ProfileStore({ storage }) };
}
const graveEvidence = { clearedZones: ['gate', 'crypt', 'shrine', 'forge', 'stairs', 'throne'], poiIds: ['burial-relic', 'forge-sigil'] };
function completeGrave(store, id = 'grave-clear') {
  assert.equal(store.prepareRun(id).ok, true);
  assert.equal(store.settleRun(id, { ...graveEvidence, outcome: 'won', kills: 10, bossKills: 1 }).ok, true);
}
function unlockAqueduct(store) {
  completeGrave(store);
  for (const id of ['watch', 'names', 'forge', 'bell']) assert.equal(store.claimStory(id).ok, true);
}

test('a pre-campaign V4 save migrates without claiming historical wins or writing on load', () => {
  const old = createDefaultProfile(); delete old.campaign;
  old.stats.runs = 100; old.stats.wins = 100;
  const { storage, store } = fixture(old);
  assert.equal(store.loadResult.ok, true); assert.equal(store.loadResult.repaired, true);
  assert.equal(storage.writes, 0); assert.deepEqual(store.profile.campaign, normalizeCampaign());
  assert.equal(store.profile.stats.wins, 100); assert.equal(currentStoryNode(store.profile).id, 'watch');
  assert.equal(store.selectExpedition('aqueduct').error, 'expedition_locked');
});

test('one complete run records all exploration; sequential claims need no repeated farming', () => {
  const { store, storage } = fixture(); completeGrave(store);
  assert.deepEqual(store.profile.campaign.evidence, ['grave:gate', 'grave:burial-relic', 'grave:forge-sigil', 'grave:boss']);
  assert.equal(campaignNodeState(store.profile, 'watch'), 'completed');
  assert.equal(campaignNodeState(store.profile, 'names'), 'locked');
  assert.equal(store.claimStory('bell').ok, false);
  let totalGold = store.profile.gold, totalEssence = store.profile.essence;
  for (const node of STORY_NODES.filter(node => node.chapterId === 'grave')) {
    assert.equal(campaignNodeState(store.profile, node), 'completed');
    const result = store.claimStory(node.id); assert.equal(result.ok, true);
    totalGold += node.reward.gold; totalEssence += node.reward.essence;
    assert.equal(store.profile.gold, totalGold); assert.equal(store.profile.essence, totalEssence);
    const before = store.profile; assert.equal(store.claimStory(node.id).ok, false); assert.deepEqual(store.profile, before);
  }
  assert.equal(store.selectExpedition('aqueduct').ok, true);
  const reload = new ProfileStore({ storage });
  assert.equal(currentStoryNode(reload.profile).id, 'descent');
  assert.equal(reload.profile.campaign.selectedExpedition, 'aqueduct');
  assert.equal(reload.profile.campaign.clears.grave, 1);
});

test('death and retreat recover saved exploration but cannot award a boss victory', () => {
  for (const outcome of ['dead', 'retreated']) {
    const { store, storage } = fixture(); store.prepareRun(`lost-${outcome}`);
    store.checkpointRun(`lost-${outcome}`, { ...graveEvidence, kills: 2, bossKills: 1 });
    const reload = new ProfileStore({ storage });
    const result = reload.settleRun(`lost-${outcome}`, { outcome });
    assert.equal(result.ok, true);
    assert.deepEqual(result.reward.storyUnlocked, ['grave:gate', 'grave:burial-relic', 'grave:forge-sigil']);
    assert.equal(reload.profile.campaign.clears.grave, 0);
    assert.equal(reload.profile.campaign.evidence.includes('grave:boss'), false);
  }
});

test('checkpoint unions are monotonic and bound to fixed pending expedition identity', () => {
  const { store, storage } = fixture(); unlockAqueduct(store);
  assert.equal(store.prepareRun('water-run', { expeditionId: 'aqueduct' }).ok, true);
  assert.equal(store.selectExpedition('grave').ok, true);
  assert.equal(store.profile.pendingRun.run.expeditionId, 'aqueduct');
  store.checkpointRun('water-run', { clearedZones: ['cistern', 'gate'], poiIds: ['sluice-wheel', 'forge-sigil'] });
  store.checkpointRun('water-run', { clearedZones: ['sluice'], poiIds: [] });
  const reload = new ProfileStore({ storage });
  assert.equal(reload.prepareRun('water-run', { expeditionId: 'grave' }).run.expeditionId, 'aqueduct');
  assert.deepEqual(reload.profile.pendingRun.summary.clearedZones, ['cistern', 'sluice']);
  assert.deepEqual(reload.profile.pendingRun.summary.poiIds, ['sluice-wheel']);
  const result = reload.settleRun('water-run', { outcome: 'won', kills: 5, bossKills: 1 });
  assert.deepEqual(result.reward.storyUnlocked, ['aqueduct:cistern', 'aqueduct:sluice-wheel', 'aqueduct:boss']);
  assert.equal(reload.profile.campaign.clears.aqueduct, 1);
  for (const id of ['descent', 'sluice', 'undertow']) assert.equal(reload.claimStory(id).ok, true);
  assert.equal(currentStoryNode(reload.profile), null);
});

test('unavailable expeditions cannot consume a selected supply or create a pending run', () => {
  const { store } = fixture(); store.buyItem('ward-charm'); store.selectSupply('ward-charm');
  const before = store.profile;
  assert.equal(store.prepareRun('locked', { expeditionId: 'aqueduct' }).error, 'expedition_locked');
  assert.deepEqual(store.profile, before);
  assert.equal(store.prepareRun('invalid', { expeditionId: '__proto__' }).error, 'invalid_expedition');
  assert.deepEqual(store.profile, before);
});

test('settlement and claim failures are atomic; reload cannot duplicate campaign rewards', () => {
  const { store, storage } = fixture(); store.prepareRun('retry');
  const before = store.profile; storage.failWrite = true;
  assert.equal(store.settleRun('retry', { ...graveEvidence, kills: 3, bossKills: 1, outcome: 'won' }).error, 'save_failed');
  assert.deepEqual(store.profile, before);
  storage.failWrite = false;
  const result = store.settleRun('retry', { ...graveEvidence, kills: 3, bossKills: 1, outcome: 'won' });
  const settled = store.profile; storage.failWrite = true;
  assert.equal(store.claimStory('watch').error, 'save_failed'); assert.deepEqual(store.profile, settled);
  storage.failWrite = false; assert.equal(store.claimStory('watch').ok, true);
  const reload = new ProfileStore({ storage }), claimed = reload.profile;
  assert.deepEqual(reload.settleRun('retry', { outcome: 'won' }).reward, result.reward);
  assert.deepEqual(reload.profile, claimed); assert.equal(reload.claimStory('watch').ok, false);
});

test('a stale tab cannot claim rewards or change the destination over a newer save', () => {
  const { store, storage } = fixture(); completeGrave(store);
  const stale = new ProfileStore({ storage });
  assert.equal(store.claimStory('watch').ok, true);
  assert.equal(stale.claimStory('watch').error, 'storage_conflict');
  assert.equal(stale.selectExpedition('grave').error, 'storage_conflict');
  assert.equal(stale.load().ok, true); assert.equal(stale.claimStory('watch').ok, false);
});

test('pending story claims are blocked while choosing the next destination preserves current map', () => {
  const { store } = fixture(); unlockAqueduct(store); store.prepareRun('ongoing-water', { expeditionId: 'aqueduct' });
  assert.equal(store.claimStory('descent').error, 'run_pending');
  assert.equal(store.selectExpedition('grave').ok, true);
  assert.equal(store.profile.pendingRun.run.expeditionId, 'aqueduct');
  assert.equal(store.profile.campaign.selectedExpedition, 'grave');
});

test('unknown map evidence and missing boss kill do not advance the story', () => {
  assert.deepEqual(storyEvidenceFromRun('grave', { clearedZones: ['cistern'], poiIds: ['sluice-wheel'], bossKills: 0 }, 'won'), []);
  assert.deepEqual(storyEvidenceFromRun('aqueduct', { clearedZones: ['gate'], poiIds: ['forge-sigil'], bossKills: 1 }, 'dead'), []);
  assert.deepEqual(normalizeCampaign({ claimed: ['bell'], selectedExpedition: 'aqueduct', evidence: ['evil'], clears: { grave: Infinity, aqueduct: -1 } }), normalizeCampaign());
});

test('broken campaign envelopes and pending map IDs preserve raw save and block writes', () => {
  for (const patch of [{ campaign: [] }, { campaign: 'wrong' }]) {
    const raw = { ...createDefaultProfile(), ...patch }, { storage, store } = fixture(raw);
    assert.equal(store.loadResult.error, 'invalid_campaign'); assert.equal(store.save().ok, false);
    assert.equal(storage.getItem(DEFAULT_PROFILE_KEY), JSON.stringify(raw)); assert.equal(storage.writes, 0);
  }
  const { store, storage } = fixture(); store.prepareRun('map-tamper');
  const raw = store.profile; delete raw.activeRun; raw.pendingRun.run.expeditionId = 'unavailable-map';
  storage.setItem(DEFAULT_PROFILE_KEY, JSON.stringify(raw));
  const reload = new ProfileStore({ storage }); assert.equal(reload.loadResult.error, 'invalid_pending_run');
  const beforeWrites = storage.writes; assert.equal(reload.save().ok, false); assert.equal(storage.writes, beforeWrites);
});
