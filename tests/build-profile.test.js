import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore, DEFAULT_PROFILE_KEY, createDefaultProfile, validateProfile } from '../src/profile.js';
import { BUILD_GEAR, TALENT_NODES, SKILL_FORMS, buildGearById, normalizeBuild, normalizeBuildLoadout, skillFormFor, resolveBuild, talentBudget } from '../src/builds.js';
import { equipmentById } from '../src/content.js';

function fixture(initial) {
  const values = new Map(initial ? [[DEFAULT_PROFILE_KEY, typeof initial === 'string' ? initial : JSON.stringify(initial)]] : []);
  const storage = { writes: 0, failWrite: false, getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { if (this.failWrite) throw Error('quota'); this.writes++; values.set(key, value); } };
  return { values, storage, store: new ProfileStore({ storage }) };
}
const neutral = { armorId: null, relicId: null, talents: [] };

test('six build relics produce six distinct form kinds and provide truthful owned starters', () => {
  assert.equal(SKILL_FORMS.length, 6); assert.equal(new Set(SKILL_FORMS.map(form => form.kind)).size, 6);
  assert.equal(BUILD_GEAR.filter(item => item.slot === 'armor').length, 3);
  assert.equal(TALENT_NODES.length, 9);
  assert.deepEqual(normalizeBuild().ownedGear, ['fire-pillars', 'water-blizzard', 'lightning-chain']);
  assert.deepEqual(normalizeBuildLoadout(normalizeBuild()), neutral);
  assert.equal(Object.isFrozen(BUILD_GEAR[0].price), true);
});

test('a V4 save without build migrates in memory with no equipped gear or automatic storage write', () => {
  const old = createDefaultProfile(); delete old.build; old.gold = 853; old.stats.runs = 3; old.stats.wins = 2;
  const { store, storage, values } = fixture(old), raw = values.get(DEFAULT_PROFILE_KEY);
  assert.equal(store.loadResult.ok, true); assert.equal(store.loadResult.repaired, true); assert.equal(storage.writes, 0);
  assert.equal(store.profile.gold, 853); assert.equal(store.profile.stats.wins, 2);
  assert.deepEqual(store.profile.build, normalizeBuild());
  assert.equal(values.get(DEFAULT_PROFILE_KEY), raw);
  assert.deepEqual(store.prepareRun('old-profile').run.buildLoadout, neutral);
});

test('old pending runs remain neutral even if the camp now equips a starter and spends talents', () => {
  const { store } = fixture(); store.prepareRun('old-pending');
  const old = store.profile; delete old.activeRun; delete old.pendingRun.run.buildLoadout; delete old.build;
  const loaded = fixture(old).store;
  assert.deepEqual(loaded.profile.pendingRun.run.buildLoadout, neutral);
  assert.equal(loaded.equipBuildGear('relic', 'water-blizzard').ok, true);
  assert.equal(loaded.toggleTalent('water-permafrost').ok, true);
  assert.deepEqual(loaded.prepareRun('old-pending').run.buildLoadout, neutral);
});

test('malformed build envelopes and impossible talent combinations preserve raw saves and reject writes', () => {
  const corrupt = [null, [], 'wrong', { ownedGear: null }, { talents: {} }, { talents: ['missing'] },
    { armorId: 'fire-pillars' }, { relicId: 'fire-meteor', ownedGear: [] },
    { talents: ['fire-aftershock'] }, { talents: ['fire-kindling', 'fire-aftershock', 'fire-pressure'] },
    { talents: ['fire-kindling', 'fire-aftershock', 'water-permafrost', 'lightning-conduction'] }];
  for (const build of corrupt) {
    const old = createDefaultProfile(); old.build = build;
    const raw = JSON.stringify(old), { store, storage, values } = fixture(raw);
    assert.equal(store.loadResult.error, 'invalid_build', raw);
    assert.equal(store.equipBuildGear('relic', 'fire-pillars').ok, false);
    assert.equal(store.resetTalents().ok, false); assert.equal(store.save().ok, false);
    assert.equal(values.get(DEFAULT_PROFILE_KEY), raw); assert.equal(storage.writes, 0);
  }
});

test('malformed pending build snapshot cannot be overwritten by a camp adjustment', () => {
  for (const buildLoadout of [null, [], { talents: null }, { relicId: 'unknown' }, { talents: ['lightning-overload'] }]) {
    const { store } = fixture(); store.prepareRun('bad-run'); const old = store.profile;
    old.pendingRun.run.buildLoadout = buildLoadout;
    const { store: loaded, storage } = fixture(old);
    assert.equal(loaded.loadResult.error, 'invalid_pending_run');
    assert.equal(loaded.equipBuildGear('relic', null).ok, false); assert.equal(storage.writes, 0);
  }
});

test('gear purchases charge real currency once and survive reload without a second charge', () => {
  const { store, storage } = fixture();
  const first = store.buyBuildGear('fire-meteor'); assert.equal(first.ok, true); assert.equal(first.duplicate, false);
  assert.deepEqual(first.spent, { gold: 100, essence: 0 }); assert.equal(store.profile.gold, 20);
  assert.equal(store.profile.build.ownedGear.includes('fire-meteor'), true);
  const twice = store.buyBuildGear('fire-meteor'); assert.equal(twice.duplicate, true); assert.equal(store.profile.gold, 20);
  const reload = new ProfileStore({ storage });
  assert.equal(reload.buyBuildGear('fire-meteor').duplicate, true); assert.equal(reload.profile.gold, 20);
  assert.equal(reload.buyBuildGear('ash-mantle').error, 'insufficient_resources');
  assert.equal(reload.profile.build.ownedGear.includes('ash-mantle'), false);
});

test('failed purchase or equipment save leaves currency, ownership, and slots unchanged for a clean retry', () => {
  const { store, storage } = fixture(), before = store.profile; storage.failWrite = true;
  assert.equal(store.buyBuildGear('water-torrent').error, 'save_failed'); assert.deepEqual(store.profile, before);
  assert.equal(store.equipBuildGear('relic', 'water-blizzard').error, 'save_failed'); assert.deepEqual(store.profile, before);
  storage.failWrite = false;
  assert.equal(store.buyBuildGear('water-torrent').ok, true); assert.equal(store.profile.gold, 20);
  assert.equal(store.equipBuildGear('relic', 'water-torrent').ok, true); assert.equal(store.profile.build.relicId, 'water-torrent');
});

test('only owned gear in the matching armor or relic slot can be equipped; emptying a slot is allowed', () => {
  const { store } = fixture(), before = store.profile;
  assert.equal(store.equipBuildGear('armor', 'fire-pillars').error, 'invalid_build_gear');
  assert.equal(store.equipBuildGear('relic', 'fire-meteor').error, 'build_gear_locked');
  assert.equal(store.equipBuildGear('weapon', 'fire-pillars').error, 'invalid_build_slot');
  assert.equal(store.buyBuildGear('unknown').error, 'invalid_build_gear'); assert.deepEqual(store.profile, before);
  assert.equal(store.equipBuildGear('relic', 'fire-pillars').ok, true);
  assert.equal(store.equipBuildGear('relic', null).ok, true); assert.equal(store.profile.build.relicId, null);
});

test('talent prerequisites, mutual exclusions and point limits reject rather than silently alter a build', () => {
  const { store } = fixture(); assert.equal(store.toggleTalent('fire-aftershock').error, 'talent_prerequisite');
  assert.equal(store.toggleTalent('unknown').error, 'invalid_talent');
  for (const id of ['fire-kindling', 'fire-aftershock', 'water-permafrost']) assert.equal(store.toggleTalent(id).ok, true);
  const before = store.profile;
  assert.equal(store.toggleTalent('fire-pressure').error, 'talent_exclusive');
  assert.equal(store.toggleTalent('water-shatter').error, 'talent_budget'); assert.deepEqual(store.profile, before);
  const removed = store.toggleTalent('fire-kindling'); assert.deepEqual(removed.removed, ['fire-kindling', 'fire-aftershock']);
  assert.deepEqual(store.profile.build.talents, ['water-permafrost']);
  assert.equal(store.toggleTalent('water-whiteout').ok, true);
});

test('free talent reset is atomic, preserves money, and does not mutate an active run', () => {
  const { store, storage } = fixture(); store.toggleTalent('fire-kindling'); store.toggleTalent('fire-pressure');
  const run = store.prepareRun('talent-reset').run, before = store.profile;
  storage.failWrite = true; assert.equal(store.resetTalents().error, 'save_failed'); assert.deepEqual(store.profile, before);
  storage.failWrite = false; assert.equal(store.resetTalents().ok, true);
  assert.equal(store.profile.gold, before.gold); assert.deepEqual(store.profile.build.talents, []);
  assert.deepEqual(store.profile.pendingRun.run.buildLoadout, run.buildLoadout);
});

test('three real settled wins add three points while death, retreat and duplicate settlement add none', () => {
  const { store } = fixture(); assert.equal(talentBudget(store.profile), 3);
  for (const [id, outcome, expected] of [['dead', 'dead', 3], ['retreat', 'retreated', 3], ['first', 'won', 4], ['second', 'won', 5], ['third', 'won', 6], ['fourth', 'won', 6]]) {
    store.prepareRun(id); assert.equal(store.settleRun(id, { outcome }).ok, true); assert.equal(talentBudget(store.profile), expected);
    assert.equal(store.settleRun(id, { outcome }).duplicate, true); assert.equal(talentBudget(store.profile), expected);
  }
  for (const id of ['fire-kindling', 'fire-pressure', 'water-permafrost', 'water-shatter', 'lightning-conduction', 'lightning-feedback']) assert.equal(store.toggleTalent(id).ok, true);
  assert.equal(store.profile.build.talents.length, 6);
  assert.equal(validateProfile(store.profile).ok, true);
});

test('camp adjustments and purchase during pending run affect only the next immutable run snapshot', () => {
  const { store, storage } = fixture(); store.equipBuildGear('relic', 'fire-pillars'); store.toggleTalent('fire-kindling');
  const first = store.prepareRun('snapshot-first').run;
  assert.deepEqual(first.buildLoadout, { armorId: null, relicId: 'fire-pillars', talents: ['fire-kindling'] });
  store.buyBuildGear('fire-meteor'); store.equipBuildGear('relic', 'fire-meteor'); store.toggleTalent('fire-aftershock');
  assert.deepEqual(store.profile.pendingRun.run.buildLoadout, first.buildLoadout);
  const reload = new ProfileStore({ storage }); assert.deepEqual(reload.prepareRun('snapshot-first').run.buildLoadout, first.buildLoadout);
  first.buildLoadout.talents.push('water-permafrost'); first.buildLoadout.relicId = 'water-blizzard';
  assert.deepEqual(store.profile.pendingRun.run.buildLoadout, { armorId: null, relicId: 'fire-pillars', talents: ['fire-kindling'] });
  store.settleRun('snapshot-first', { outcome: 'retreated' });
  const next = store.prepareRun('snapshot-next').run;
  assert.deepEqual(next.buildLoadout, { armorId: null, relicId: 'fire-meteor', talents: ['fire-kindling', 'fire-aftershock'] });
});

test('stale pages cannot duplicate purchases, equip changes, or talent spending; sync retains active snapshot', () => {
  const { store, storage } = fixture(); store.prepareRun('cross-page');
  const other = new ProfileStore({ storage }); assert.equal(other.buyBuildGear('ash-mantle').ok, true);
  const before = store.profile;
  assert.equal(store.buyBuildGear('ash-mantle').error, 'storage_conflict');
  assert.equal(store.equipBuildGear('relic', 'fire-pillars').error, 'storage_conflict');
  assert.equal(store.toggleTalent('fire-kindling').error, 'storage_conflict'); assert.deepEqual(store.profile, before);
  assert.equal(store.sync({ runId: 'cross-page' }).ok, true); assert.equal(store.profile.gold, 50);
  assert.equal(store.buyBuildGear('ash-mantle').duplicate, true); assert.equal(store.profile.gold, 50);
  assert.equal(store.equipBuildGear('armor', 'ash-mantle').ok, true);
  assert.deepEqual(store.profile.pendingRun.run.buildLoadout, neutral);
});

test('a mismatched relic preserves the equipped weapon skill and never converts unrelated elements', () => {
  for (const form of SKILL_FORMS) {
    const weapon = equipmentById({ fire: 'fire-sword', water: 'water-staff', lightning: 'lightning-spear' }[form.element]);
    assert.equal(skillFormFor(weapon, { relicId: form.id }).id, form.id);
    assert.equal(skillFormFor(weapon.id, { relicId: form.id }).kind, form.kind);
    const other = equipmentById(form.element === 'fire' ? 'water-staff' : 'fire-sword');
    assert.equal(skillFormFor(other, { relicId: form.id }).id, other.variant);
    assert.equal(skillFormFor(other, { relicId: form.id }).kind, 'legacy');
  }
  assert.equal(skillFormFor('unknown', neutral), null);
});

test('build effects remain fully neutral by default and only modify their matching element', () => {
  const base = resolveBuild(neutral, 'fire');
  assert.deepEqual(resolveBuild(neutral, 'water'), base); assert.deepEqual(resolveBuild(neutral, 'lightning'), base);
  const fire = { armorId: 'ash-mantle', relicId: 'fire-pillars', talents: ['fire-kindling', 'fire-pressure'] };
  assert.deepEqual(resolveBuild(fire, 'water'), base);
  const boosted = resolveBuild(fire, 'fire'); assert.equal(boosted.damageMultiplier, 1.12 * 1.12); assert.equal(boosted.pillarBonus, 2); assert.equal(boosted.radiusMultiplier, 1.15);
  assert.equal(resolveBuild({ talents: ['fire-kindling', 'fire-aftershock'] }, 'fire').aftershock, .4);
  const water = resolveBuild({ armorId: 'glacier-robes', talents: ['water-permafrost', 'water-whiteout'] }, 'water');
  assert.equal(water.chillBonus, 1); assert.equal(water.durationBonus, 2); assert.equal(water.radiusBonus, .8); assert.equal(water.skillCooldownMultiplier, 1.2); assert.equal(water.vsChilledMultiplier, 1.15);
  assert.equal(resolveBuild({ talents: ['water-permafrost', 'water-shatter'] }, 'water').shatter, .4);
  const lightning = resolveBuild({ armorId: 'storm-vest', talents: ['lightning-conduction', 'lightning-overload'] }, 'lightning');
  assert.equal(lightning.chainBonus, 2); assert.equal(lightning.overload, .4); assert.equal(lightning.skillCooldownMultiplier, .92);
  assert.equal(resolveBuild({ talents: ['lightning-conduction', 'lightning-feedback'] }, 'lightning').feedback, .15);
  assert.deepEqual(resolveBuild({ armorId: 'storm-vest', talents: ['lightning-conduction'] }, 'fire'), base);
});

test('each armor purchase is priced at 70 gold and item descriptions correspond to immutable metadata', () => {
  for (const armor of BUILD_GEAR.filter(item => item.slot === 'armor')) {
    const { store } = fixture(); assert.equal(store.buyBuildGear(armor.id).ok, true); assert.equal(store.profile.gold, 50);
    assert.equal(store.equipBuildGear('armor', armor.id).ok, true); assert.equal(buildGearById(armor.id), armor);
    assert.equal(armor.price.essence, 0); assert.ok(armor.name && armor.description && armor.element);
  }
});
