import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProfile, ProfileStore } from '../src/profile.js';
import { EQUIPMENT } from '../src/content.js';
import { Game } from '../src/game.js';
import { initLocale, setLocale } from '../src/i18n.js';
import { normalizeArmorySelection, normalizeBagSelection, weaponComparison, renderArmory, renderBag, weaponForClass } from '../src/camp-inventory.js';

beforeEach(() => initLocale());
afterEach(() => initLocale());
const buttons = html => [...html.matchAll(/<button\b([^>]*)>/g)].map(match => match[1]);
const actionButtons = (html, action) => buttons(html).filter(button => button.includes(`data-action="${action}"`));

test('weapon filtering keeps the inspected selection inside its element without changing a loadout', () => {
  const profile = createDefaultProfile(), original = JSON.stringify(profile);
  const initial = normalizeArmorySelection(profile);
  assert.equal(initial.selectedWeaponId, profile.loadout);
  assert.equal(initial.weapons.length, 6);
  const lightning = normalizeArmorySelection(profile, { selectedWeaponId: 'fire-greatsword', elementFilter: 'lightning' });
  assert.equal(lightning.selectedWeaponId, 'lightning-spear');
  assert.deepEqual(lightning.weapons.map(item => item.id), ['lightning-spear', 'lightning-halberd']);
  assert.equal(normalizeArmorySelection(profile, { selectedWeaponId: 'water-scepter', elementFilter: 'water' }).selectedWeaponId, 'water-scepter');
  assert.equal(normalizeArmorySelection(profile, { selectedWeaponId: 'invalid', elementFilter: 'invalid' }).selectedWeaponId, profile.loadout);
  assert.equal(JSON.stringify(profile), original);
});

test('inventory comparisons match actual starting combat stats with camp growth and a packed tonic', () => {
  const profile = createDefaultProfile();
  profile.campLevel = 2;
  profile.items['damage-tonic'] = 1;
  profile.selectedSupply = 'damage-tonic';
  const original = JSON.stringify(profile);
  for (const weapon of EQUIPMENT) {
    const compare = weaponComparison(profile, weapon.id);
    const actual = new Game({ seed: 7, weaponId: weapon.id, unlockedWeapons: [weapon.id], campBonuses: { maxHp: 20, damageMultiplier: 1.06 }, supply: 'damage-tonic' });
    assert.deepEqual(compare.selected, actual.combatStats, weapon.id);
    assert.equal(compare.currentWeapon.id, 'fire-sword');
  }
  const heavy = weaponComparison(profile, 'fire-greatsword');
  assert.ok(heavy.selected.damage > heavy.current.damage);
  assert.ok(heavy.selected.attackInterval > heavy.current.attackInterval, 'a heavy weapon must show its slower attack interval');
  assert.equal(JSON.stringify(profile), original, 'viewing a weapon cannot consume a supply or start a run');
  assert.equal(weaponComparison(profile, 'invalid'), null);
});

test('an unavailable stale supply does not grant a damage bonus in displayed expedition stats', () => {
  const profile = createDefaultProfile();
  profile.selectedSupply = 'damage-tonic';
  assert.equal(weaponComparison(profile, 'fire-sword').selected.damage, 26);
  assert.match(renderBag(profile), /<b>0 \/ 1<\/b>/);
  assert.equal(normalizeBagSelection(profile).selectedItemId, 'damage-tonic');
});

test('locked weapons can be inspected but offer their real unlock contract instead of an equip action', () => {
  const profile = createDefaultProfile();
  const html = renderArmory(profile, { selectedWeaponId: 'lightning-halberd', elementFilter: 'lightning' });
  assert.match(html, /data-selected-weapon="lightning-halberd"/);
  assert.equal(actionButtons(html, 'inspect-weapon').length, 2);
  assert.equal(actionButtons(html, 'weapon').length, 0);
  assert.match(actionButtons(html, 'unlock')[0], /data-id="gravebreaker"/);
  assert.match(html, /风暴回响/);
  assert.match(html, /攻击间隔/);
  assert.match(html, /3 \/ 6 已收藏/);
  profile.unlockedWeapons.push('lightning-halberd');
  const unlocked = renderArmory(profile, { selectedWeaponId: 'lightning-halberd' });
  assert.equal(actionButtons(unlocked, 'unlock').length, 0);
  assert.match(actionButtons(unlocked, 'weapon')[0], /data-id="lightning-halberd"/);
});

test('empty, packed, insufficient-gold and full-stock supply views reflect real profile data', () => {
  const profile = createDefaultProfile();
  let html = renderBag(profile);
  assert.match(html, /行囊还空着/);
  assert.match(html, /0 件补给/);
  assert.equal(actionButtons(html, 'inspect-supply').length, 2, 'show only the two real supply types');
  assert.match(actionButtons(html, 'supply')[0], /disabled/);
  assert.doesNotMatch(actionButtons(html, 'buy')[0], /disabled/);
  profile.items['ward-charm'] = 3;
  profile.selectedSupply = 'ward-charm';
  assert.equal(normalizeBagSelection(profile).selectedItemId, 'ward-charm');
  html = renderBag(profile);
  assert.match(html, /<b>1 \/ 1<\/b>/);
  assert.match(html, /持有 3 件/);
  assert.match(html, /入场护盾 \+35/);
  for (const button of actionButtons(html, 'supply')) assert.match(button, /data-id=""/);
  profile.gold = 10;
  html = renderBag(profile);
  assert.match(actionButtons(html, 'buy')[0], /disabled/);
  assert.match(html, /还需 25 金币/);
  profile.gold = 500;
  profile.items['ward-charm'] = 99;
  html = renderBag(profile);
  assert.match(actionButtons(html, 'buy')[0], /disabled/);
  assert.match(html, /已达持有上限/);
});

test('pending runs allow next-loadout equipment and packing while blocking purchases and upgrades', () => {
  const profile = createDefaultProfile();
  profile.pendingRun = { runId: 'existing-run' };
  profile.items['ward-charm'] = 1;
  const bag = renderBag(profile, { selectedItemId: 'ward-charm' });
  const armory = renderArmory(profile, { selectedWeaponId: 'lightning-spear' });
  for (const action of ['buy', 'upgrade']) {
    assert.ok(actionButtons(bag, action).length);
    for (const button of actionButtons(bag, action)) assert.match(button, /disabled/);
  }
  for (const button of actionButtons(bag, 'supply')) assert.doesNotMatch(button, /disabled/);
  assert.doesNotMatch(actionButtons(armory, 'weapon')[0], /disabled/);
  assert.doesNotMatch(actionButtons(renderArmory(profile, { selectedWeaponId: 'fire-greatsword' }), 'unlock')[0], /disabled/);
  for (const button of actionButtons(armory, 'inspect-weapon')) assert.doesNotMatch(button, /disabled/);
  for (const button of actionButtons(bag, 'inspect-supply')) assert.doesNotMatch(button, /disabled/);
});

test('class shortcuts preserve equipped gear and choose an owned advanced weapon without unlocking anything', () => {
  const profile = createDefaultProfile();
  assert.equal(weaponForClass(profile, 'fire').id, 'fire-sword');
  profile.unlockedWeapons.push('fire-greatsword', 'water-scepter');
  profile.loadout = 'water-scepter';
  assert.equal(weaponForClass(profile, 'water').id, 'water-scepter');
  assert.equal(weaponForClass(profile, 'fire').id, 'fire-greatsword');
  assert.equal(weaponForClass(profile, 'lightning').id, 'lightning-spear');
  profile.loadout = 'fire-sword';
  assert.equal(weaponForClass(profile, 'fire').id, 'fire-sword', 'an explicitly equipped starter should also be retained');
  assert.equal(weaponForClass(profile, 'invalid'), null);
});

test('camp upgrades show cumulative saved bonuses, the real next cost, and no purchase at max level', () => {
  const profile = createDefaultProfile();
  profile.campLevel = 2;
  let html = renderBag(profile);
  assert.match(html, /当前：生命 \+20 · 伤害 \+6%/);
  assert.match(html, /升级后：生命 \+30 · 伤害 \+9%/);
  assert.match(html, /380 金币 · 4 精华/);
  assert.match(actionButtons(html, 'upgrade')[0], /disabled/);
  profile.gold = 380; profile.essence = 4;
  assert.doesNotMatch(actionButtons(renderBag(profile), 'upgrade')[0], /disabled/);
  profile.campLevel = 3;
  html = renderBag(profile);
  assert.equal(actionButtons(html, 'upgrade').length, 0);
  assert.match(html, /营地已完全强化/);
});

test('rendering inventory never writes or consumes saved supplies', () => {
  const values = new Map(), writes = [];
  const storage = { getItem: key => values.get(key) ?? null, setItem(key, value) { writes.push(key); values.set(key, value); } };
  const store = new ProfileStore({ storage });
  store.buyItem('damage-tonic');
  store.selectSupply('damage-tonic');
  const profile = store.snapshot(), original = JSON.stringify(profile), previousWrites = writes.length;
  renderBag(profile, { selectedItemId: 'ward-charm' });
  renderArmory(profile, { selectedWeaponId: 'water-scepter', elementFilter: 'water' });
  assert.equal(JSON.stringify(profile), original);
  assert.equal(writes.length, previousWrites);
  assert.equal(store.snapshot().items['damage-tonic'], 1);
  assert.equal(store.snapshot().selectedSupply, 'damage-tonic');
});

test('all inventory panels and disabled states render in English without untranslated Chinese', () => {
  setLocale('en');
  const profile = createDefaultProfile();
  profile.items['ward-charm'] = 99; profile.selectedSupply = 'ward-charm'; profile.gold = 0;
  for (const html of [renderArmory(profile), renderArmory(profile, { selectedWeaponId: 'fire-greatsword' }), renderBag(profile), renderBag(profile, { selectedItemId: 'damage-tonic' })]) {
    assert.equal(/\p{Script=Han}/u.test(html), false);
  }
  assert.match(renderBag(profile), /Storage limit reached/);
});
