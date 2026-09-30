import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore, SUPPLIES, CAMP_LEVELS, QUESTS, createDefaultProfile, validateProfile } from '../src/profile.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, failRead: false, failWrite: false, writes: 0,
    getItem(key) { if (this.failRead) throw Error('read denied'); return values.get(key) ?? null; },
    setItem(key, value) { if (this.failWrite) throw Error('quota exceeded'); this.writes++; values.set(key, value); } };
}
const key = 'emberfall.profile.v4.test';
function fixture(profile) { const storage = memoryStorage(profile ? { [key]: JSON.stringify(profile) } : {}); return { storage, store: new ProfileStore({ storage, key }) }; }
const won = { outcome: 'won', gold: 100, kills: 12, eliteKills: 2, sideRelics: 1, bossKills: 1, duration: 300 };

test('fresh profile imports only selected legacy records and never writes legacy keys', () => {
  const storage = memoryStorage({ 'emberfall.records.v1': 'old-records', 'emberfall.settings.v1': 'old-settings' });
  const store = new ProfileStore({ storage, key, legacyRecords: { runs: 8, wins: 2, bestKills: 71, fastestVictory: 490, gold: 80000 } });
  assert.equal(store.profile.gold, 120); assert.equal(store.profile.stats.runs, 8); assert.equal(storage.writes, 0);
  assert.equal(store.save().ok, true); assert.equal(storage.getItem('emberfall.records.v1'), 'old-records'); assert.equal(storage.getItem('emberfall.settings.v1'), 'old-settings');
});

test('purchases use real budget; invalid counts and insufficient funds do not change inventory', () => {
  const { store } = fixture();
  assert.equal(store.buyItem('damage-tonic', 2).ok, true); assert.equal(store.profile.gold, 30); assert.equal(store.profile.items['damage-tonic'], 2);
  const before = store.profile;
  for (const [id, quantity] of [['ward-charm', 1], ['damage-tonic', -1], ['damage-tonic', Infinity], ['damage-tonic', .5], ['fake', 1]]) assert.equal(store.buyItem(id, quantity).ok, false);
  assert.deepEqual(store.profile, before);
});

test('starting consumes one selected supply atomically and retry does not consume twice', () => {
  const { storage, store } = fixture(); store.buyItem('ward-charm', 2); store.selectSupply('ward-charm');
  const first = store.prepareRun('supply-run'); assert.equal(first.ok, true); assert.equal(first.run.supply.shield, 35); assert.equal(store.profile.items['ward-charm'], 1);
  const second = store.prepareRun('supply-run'); assert.equal(second.reused, true); assert.deepEqual(second.run, first.run); assert.equal(store.profile.items['ward-charm'], 1);
  assert.equal(store.prepareRun('second-run').error, 'run_pending'); assert.equal(store.buyItem('ward-charm').error, 'run_pending');
  const reload = new ProfileStore({ storage, key }); assert.equal(reload.profile.pendingRun.runId, 'supply-run'); assert.equal(reload.prepareRun('supply-run').reused, true);
});

test('failed prepare preserves supply and creates no pending run', () => {
  const { storage, store } = fixture(); store.buyItem('damage-tonic'); store.selectSupply('damage-tonic'); const before = store.profile;
  storage.failWrite = true; assert.equal(store.prepareRun('failed-start').ok, false); assert.deepEqual(store.profile, before);
  storage.failWrite = false; assert.equal(store.prepareRun('failed-start').ok, true); assert.equal(store.profile.items['damage-tonic'], 0); assert.equal(store.profile.selectedSupply, null);
});

test('winning, dying, and retreating use explicit ratios, essence and bonus', () => {
  for (const [outcome, gold, essence] of [['won', 181, 4], ['dead', 60, 2], ['retreated', 25, 0], ['abandoned', 25, 0]]) {
    const { store } = fixture(); store.prepareRun(`ratio-${outcome}`);
    const result = store.settleRun(`ratio-${outcome}`, { ...won, outcome, gold: 101, eliteKills: 4 });
    assert.equal(result.reward.gold, gold); assert.equal(result.reward.essence, essence); assert.equal(store.profile.gold, 120 + gold); assert.equal(store.profile.pendingRun, null);
  }
});

test('settlement is idempotent across calls and process reloads', () => {
  const { storage, store } = fixture(); store.prepareRun('once'); const first = store.settleRun('once', won); const before = store.profile;
  const again = store.settleRun('once', { ...won, gold: 999999 }); assert.equal(again.duplicate, true); assert.deepEqual(again.reward, first.reward); assert.deepEqual(store.profile, before);
  const reload = new ProfileStore({ storage, key }); assert.equal(reload.settleRun('once', won).duplicate, true); assert.deepEqual(reload.profile, before); assert.equal(reload.prepareRun('once').ok, false);
  assert.equal(reload.settleRun('never-started', won).ok, false);
});

test('failed settlement does not award, discard pending run, or consume retry', () => {
  const { storage, store } = fixture(); store.prepareRun('quota'); const before = store.profile;
  storage.failWrite = true; assert.equal(store.settleRun('quota', won).error, 'save_failed'); assert.deepEqual(store.profile, before);
  storage.failWrite = false; assert.equal(store.settleRun('quota', won).ok, true); assert.equal(store.profile.stats.runs, 1);
});

test('checkpoint is monotonic; after reload only recorded income is recovered', () => {
  const { storage, store } = fixture(); store.acceptQuest('ash-hunt'); store.prepareRun('reload');
  assert.equal(store.checkpointRun('reload', { goldEarned: 83, kills: 12, duration: 30 }).ok, true);
  store.checkpointRun('reload', { gold: 20, kills: 4, duration: 10 });
  const reload = new ProfileStore({ storage, key }); const pending = reload.profile.pendingRun;
  assert.equal(pending.summary.goldEarned, 83); assert.equal(pending.summary.kills, 12);
  const result = reload.settleRun(pending.runId, { ...pending.summary, outcome: 'retreated' });
  assert.equal(result.reward.gold, 20); assert.equal(reload.profile.quests['ash-hunt'].progress, 12); assert.equal(reload.profile.pendingRun, null);
  assert.equal(reload.prepareRun('after-recovery').ok, true);
});

test('checkpoint save failure retains previous recoverable summary', () => {
  const { storage, store } = fixture(); store.prepareRun('checkpoint'); store.checkpointRun('checkpoint', { gold: 50, kills: 9 }); storage.failWrite = true;
  assert.equal(store.checkpointRun('checkpoint', { gold: 100 }).ok, false); assert.equal(store.profile.pendingRun.summary.goldEarned, 50);
});

test('quests count only a quest accepted before that run, across multiple runs', () => {
  const { store } = fixture(); store.prepareRun('before'); store.settleRun('before', { ...won, kills: 100 }); assert.equal(store.profile.quests['ash-hunt'].progress, 0);
  store.acceptQuest('ash-hunt'); store.prepareRun('after1'); store.settleRun('after1', { outcome: 'dead', kills: 35 }); assert.equal(store.profile.quests['ash-hunt'].progress, 35);
  store.prepareRun('after2'); store.settleRun('after2', { outcome: 'retreated', kills: 25 }); assert.equal(store.profile.quests['ash-hunt'].status, 'completed');
  assert.equal(store.profile.unlockedWeapons.includes('fire-greatsword'), false);
  assert.equal(store.claimQuest('ash-hunt').ok, true); assert.equal(store.profile.unlockedWeapons.includes('fire-greatsword'), true);
  const before = store.profile; assert.equal(store.claimQuest('ash-hunt').ok, false); assert.deepEqual(store.profile, before); assert.equal(store.selectWeapon('fire-greatsword').ok, true);
});

test('all four quest metrics can be completed and unlock their actual rewards', () => {
  const { store } = fixture();
  for (const quest of QUESTS) { store.acceptQuest(quest.id); store.prepareRun(quest.id); const result = store.settleRun(quest.id, { ...won, [quest.metric]: quest.target, kills: Math.max(60, quest.target) }); assert.equal(result.reward.questProgress.completed, true); assert.equal(store.claimQuest(quest.id).ok, true); }
  assert.equal(store.profile.unlockedWeapons.length, 6); assert.equal(Object.values(store.profile.quests).every(q => q.status === 'claimed'), true);
});

test('quest claim failure keeps reward claimable and cannot double award on retry', () => {
  const { storage, store } = fixture(); store.acceptQuest('side-search'); store.prepareRun('quest-quota'); store.settleRun('quest-quota', { ...won, sideRelics: 2 }); const before = store.profile;
  storage.failWrite = true; assert.equal(store.claimQuest('side-search').ok, false); assert.deepEqual(store.profile, before);
  storage.failWrite = false; assert.equal(store.claimQuest('side-search').ok, true); assert.equal(store.claimQuest('side-search').ok, false);
});

test('camp upgrades have three real paid levels and derive exact engine bonuses', () => {
  const profile = createDefaultProfile(); profile.gold = 1000; profile.essence = 10; const { store } = fixture(profile);
  for (const next of CAMP_LEVELS) { const before = store.profile; assert.equal(store.upgradeCamp().ok, true); assert.equal(store.profile.gold, before.gold - next.cost.gold); assert.equal(store.profile.essence, before.essence - next.cost.essence); }
  assert.equal(store.upgradeCamp().error, 'max_camp_level'); const run = store.prepareRun('camp').run; assert.deepEqual(run.campBonuses, { maxHp: 30, damageMultiplier: 1.09 });
});

test('only known unlocked weapons and owned supplies can be selected', () => {
  const { store } = fixture(); assert.equal(store.selectWeapon('water-scepter').ok, false); assert.equal(store.selectWeapon('water-staff').ok, true); assert.equal(store.selectSupply('ward-charm').ok, false); assert.equal(store.selectSupply(null).ok, true);
});

test('earned weapon loot unlocks once after wins, deaths, and retreat', () => {
  for (const outcome of ['won', 'dead', 'retreated']) { const { store } = fixture(); store.prepareRun(outcome); store.settleRun(outcome, { ...won, outcome, inventory: ['water-scepter', 'unknown'] }); assert.equal(store.profile.unlockedWeapons.includes('water-scepter'), true); }
});

test('malformed JSON and future versions are preserved and writes are blocked', () => {
  for (const raw of ['{bad json', JSON.stringify({ version: 500 }), 'null', '[]']) {
    const storage = memoryStorage({ [key]: raw }); const store = new ProfileStore({ storage, key });
    assert.equal(store.loadResult.ok, false); assert.equal(store.buyItem('ward-charm').ok, false); assert.equal(store.prepareRun('broken').ok, false); assert.equal(store.save().ok, false); assert.equal(storage.getItem(key), raw); assert.equal(storage.writes, 0);
  }
});

test('known-version field validation removes nonfinite values and unsafe gear', () => {
  const raw = createDefaultProfile(); Object.assign(raw, { gold: Infinity, essence: -12, campLevel: 100, loadout: 'evil', unlockedWeapons: ['evil'], selectedSupply: 'ward-charm' }); raw.items['ward-charm'] = NaN; raw.items['damage-tonic'] = 9999; raw.stats.runs = Infinity;
  const { profile, ok } = validateProfile(raw); assert.equal(ok, true); assert.equal(profile.gold, 0); assert.equal(profile.essence, 0); assert.equal(profile.campLevel, 3); assert.equal(profile.items['damage-tonic'], 99); assert.equal(profile.selectedSupply, null); assert.equal(profile.loadout, 'fire-sword'); assert.equal(profile.stats.runs, 0);
  function finiteNumbers(value) { if (typeof value === 'number') assert.equal(Number.isFinite(value), true); else if (value && typeof value === 'object') Object.values(value).forEach(finiteNumbers); }
  finiteNumbers(profile);
});

test('malformed ledger/pending run is rejected instead of silently forgetting processed runs', () => {
  for (const patch of [{ processedRuns: [] }, { processedRuns: { constructor: {} } }, { pendingRun: { runId: 'r' } }]) { const profile = { ...createDefaultProfile(), ...patch }; assert.equal(validateProfile(profile).ok, false); }
  const profile = createDefaultProfile(); profile.processedRuns.previous = { outcome: 'won', reward: null }; assert.equal(validateProfile(profile).ok, true);
});

test('storage unavailability and stale instances report failure without pretending persistence', () => {
  const storage = memoryStorage(); storage.failRead = true; const unavailable = new ProfileStore({ storage, key }); assert.equal(unavailable.loadResult.ok, false); assert.equal(unavailable.save().ok, false);
  storage.failRead = false; const first = new ProfileStore({ storage, key }); const stale = new ProfileStore({ storage, key }); first.buyItem('ward-charm'); const before = stale.profile;
  assert.equal(stale.buyItem('damage-tonic').error, 'storage_conflict'); assert.deepEqual(stale.profile, before); assert.equal(stale.load().ok, true); assert.equal(stale.profile.gold, 85);
});

test('profile snapshots cannot mutate store state or engine tuning', () => {
  const { store } = fixture(); const snapshot = store.profile; snapshot.gold = 9999; snapshot.unlockedWeapons.push('evil'); assert.equal(store.profile.gold, 120); assert.equal(store.profile.unlockedWeapons.includes('evil'), false);
  assert.equal(Object.isFrozen(SUPPLIES[0].effect), true); assert.equal(store.prepareRun('__proto__').ok, false);
});
