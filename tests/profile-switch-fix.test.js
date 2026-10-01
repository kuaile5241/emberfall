import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore } from '../src/profile.js';
import { Game } from '../src/game.js';

const key = 'emberfall.profile.switch-fix.test';
function fixture() {
  const values = new Map();
  const storage = {
    values, writes: 0, failRead: false, failWrite: false,
    getItem(id) { if (this.failRead) throw Error('read denied'); return values.get(id) ?? null; },
    setItem(id, value) { if (this.failWrite) throw Error('quota exceeded'); this.writes++; values.set(id, value); },
  };
  return { storage, store: new ProfileStore({ storage, key }) };
}
function pendingFixture() {
  const fixtureData = fixture(), { store } = fixtureData;
  assert.equal(store.buyItem('damage-tonic').ok, true);
  assert.equal(store.buyItem('ward-charm').ok, true);
  assert.equal(store.selectSupply('damage-tonic').ok, true);
  assert.equal(store.acceptQuest('ash-hunt').ok, true);
  const prepared = store.prepareRun('old-run');
  assert.equal(prepared.ok, true);
  assert.equal(store.checkpointRun('old-run', { kills: 12, goldEarned: 81, duration: 35, inventory: ['fire-greatsword'] }).ok, true);
  return { ...fixtureData, run: prepared.run };
}

test('three professions can be prepared while an old run is pending without changing its ledger or consumed supply', () => {
  const { store, run } = pendingFixture();
  const before = store.profile;
  const game = new Game(run).start(), previousDamage = game.combatStats.damage;
  for (const id of ['lightning-spear', 'water-staff', 'fire-sword']) {
    assert.equal(store.selectWeapon(id).ok, true);
    assert.equal(store.profile.loadout, id);
    assert.deepEqual(store.profile.pendingRun, before.pendingRun);
    assert.deepEqual(store.profile.items, before.items);
    assert.deepEqual(store.profile.stats, before.stats);
    assert.equal(store.profile.gold, before.gold);
  }
  assert.equal(store.selectSupply('ward-charm').ok, true);
  assert.equal(store.profile.selectedSupply, 'ward-charm');
  assert.deepEqual(store.profile.pendingRun, before.pendingRun);
  assert.deepEqual(store.profile.items, before.items);
  assert.equal(store.profile.items['damage-tonic'], 0);
  assert.equal(store.profile.items['ward-charm'], 1);
  assert.equal(game.supply, 'damage-tonic');
  assert.equal(game.weapon.id, 'fire-sword');
  assert.equal(game.combatStats.damage, previousDamage);
  assert.equal(store.selectSupply(null).ok, true);
  assert.equal(store.profile.selectedSupply, null);
  assert.deepEqual(store.profile.pendingRun, before.pendingRun);
});

test('settling the old run preserves newly selected equipment and the next supply', () => {
  const { store } = pendingFixture();
  assert.equal(store.selectWeapon('water-staff').ok, true);
  assert.equal(store.selectSupply('ward-charm').ok, true);
  const result = store.settleRun('old-run', { outcome: 'retreated', weaponId: 'fire-sword' });
  assert.equal(result.ok, true);
  assert.equal(result.reward.gold, 20);
  assert.equal(store.profile.loadout, 'water-staff');
  assert.equal(store.profile.selectedSupply, 'ward-charm');
  assert.equal(store.profile.items['ward-charm'], 1);
  assert.equal(store.profile.items['damage-tonic'], 0);
  assert.equal(store.profile.quests['ash-hunt'].progress, 12);
  assert.equal(store.profile.pendingRun, null);
  const prepared = store.prepareRun('next-run');
  assert.equal(prepared.run.weaponId, 'water-staff');
  assert.equal(prepared.run.supply.id, 'ward-charm');
  assert.equal(store.profile.items['ward-charm'], 0);
});

test('pending preparation still rejects locked weapons and exhausted supplies', () => {
  const { store } = pendingFixture(), before = store.profile;
  assert.equal(store.selectWeapon('water-scepter').error, 'weapon_locked');
  assert.equal(store.selectWeapon('unknown').error, 'weapon_locked');
  assert.equal(store.selectSupply('damage-tonic').error, 'supply_unavailable');
  assert.deepEqual(store.profile, before);
});

test('pending preparation does not open purchase, upgrade, quest, reward, or new-run gates', () => {
  const { store } = pendingFixture(), before = store.profile;
  for (const result of [store.buyItem('ward-charm'), store.upgradeCamp(), store.acceptQuest('gravebreaker'), store.claimQuest('ash-hunt'), store.prepareRun('second-run')]) {
    assert.equal(result.error, 'run_pending');
  }
  assert.deepEqual(store.profile, before);
});

test('camp synchronization reads another page without writing, then switching uses the current save', () => {
  const { storage, store } = fixture();
  const other = new ProfileStore({ storage, key });
  assert.equal(other.selectWeapon('water-staff').ok, true);
  assert.equal(store.selectWeapon('lightning-spear').error, 'storage_conflict');
  const writes = storage.writes;
  assert.equal(store.sync().ok, true);
  assert.equal(storage.writes, writes);
  assert.equal(store.profile.loadout, 'water-staff');
  assert.equal(store.selectWeapon('lightning-spear').ok, true);
  assert.equal(JSON.parse(storage.getItem(key)).loadout, 'lightning-spear');
});

test('same-run synchronization allows checkpoints while preserving preparation changed by another page', () => {
  const { storage, store } = pendingFixture();
  const other = new ProfileStore({ storage, key });
  assert.equal(other.selectWeapon('water-staff').ok, true);
  assert.equal(other.selectSupply('ward-charm').ok, true);
  assert.equal(store.checkpointRun('old-run', { goldEarned: 100 }).error, 'storage_conflict');
  const writes = storage.writes;
  assert.equal(store.sync({ runId: 'old-run' }).ok, true);
  assert.equal(storage.writes, writes);
  assert.equal(store.checkpointRun('old-run', { goldEarned: 100, kills: 15 }).ok, true);
  const saved = JSON.parse(storage.getItem(key));
  assert.equal(saved.loadout, 'water-staff');
  assert.equal(saved.selectedSupply, 'ward-charm');
  assert.equal(saved.pendingRun.run.weaponId, 'fire-sword');
  assert.equal(saved.pendingRun.run.supply.id, 'damage-tonic');
  assert.equal(saved.pendingRun.summary.goldEarned, 100);
  assert.equal(saved.pendingRun.summary.kills, 15);
  assert.deepEqual(saved.pendingRun.summary.inventory, ['fire-greatsword']);
});

test('active synchronization cannot adopt a settled, replacement, or deleted run', () => {
  for (const situation of ['settled', 'replacement', 'deleted']) {
    const { storage, store } = pendingFixture(), before = store.profile, raw = store._raw;
    const other = new ProfileStore({ storage, key });
    assert.equal(other.settleRun('old-run', { outcome: 'retreated' }).ok, true);
    if (situation === 'replacement') assert.equal(other.prepareRun('new-run').ok, true);
    if (situation === 'deleted') storage.values.delete(key);
    const latest = storage.getItem(key), writes = storage.writes;
    assert.equal(store.sync({ runId: 'old-run' }).error, 'run_changed');
    assert.deepEqual(store.profile, before);
    assert.equal(store._raw, raw);
    assert.equal(storage.getItem(key), latest);
    assert.equal(storage.writes, writes);
  }
});

test('active synchronization retains memory and original bytes on read or validation failure', () => {
  for (const bad of ['read', '{bad json', 'null', JSON.stringify({ version: 999 })]) {
    const { storage, store } = pendingFixture(), before = store.profile, raw = store._raw;
    if (bad === 'read') storage.failRead = true;
    else storage.values.set(key, bad);
    const writes = storage.writes, latest = storage.values.get(key);
    const result = store.sync({ runId: 'old-run' });
    assert.equal(result.ok, false);
    assert.deepEqual(store.profile, before);
    assert.equal(store._raw, raw);
    assert.equal(storage.values.get(key), latest);
    assert.equal(storage.writes, writes);
  }
});

test('camp synchronization preserves malformed saves and blocked mutations rather than resetting', () => {
  const { storage, store } = fixture();
  assert.equal(store.selectWeapon('water-staff').ok, true);
  const before = store.profile;
  storage.values.set(key, '{bad json');
  const writes = storage.writes;
  assert.equal(store.sync().error, 'invalid_json');
  assert.deepEqual(store.profile, before);
  assert.equal(store.selectWeapon('lightning-spear').error, 'invalid_json');
  assert.equal(storage.getItem(key), '{bad json');
  assert.equal(storage.writes, writes);
});

test('failed pending preparation persistence never changes the previous choice or old run', () => {
  const { storage, store } = pendingFixture(), before = store.profile;
  storage.failWrite = true;
  assert.equal(store.selectWeapon('water-staff').error, 'save_failed');
  assert.equal(store.selectSupply('ward-charm').error, 'save_failed');
  assert.deepEqual(store.profile, before);
});
