import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProfile, ProfileStore, validateProfile } from '../src/profile.js';
import { BUILD_GEAR, TALENT_NODES, SKILL_FORMS, normalizeBuild } from '../src/builds.js';
import { EQUIPMENT } from '../src/content.js';
import { renderBuildSummary, renderBuildWorkshop } from '../src/build-ui.js';
import buildsEnglish from '../src/locales/builds-en.js';
import { initLocale, setLocale, t } from '../src/i18n.js';

afterEach(() => initLocale({ storage: null }));
const han = /\p{Script=Han}/u;
const button = (html, action, id) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]).find(markup => markup.includes(`data-action="${action}"`) && (id === undefined || markup.includes(`data-id="${id}"`)));
const gearCard = (html, id) => [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(match => match[0]).find(markup => markup.includes(`data-build-gear="${id}"`));
const disabled = markup => /\bdisabled(?:[\s=>])/.test(markup);
const weaponFor = element => EQUIPMENT.find(item => item.starter && item.element === element);

test('a fresh build workshop previews the real default weapon skill and keeps starter relics unequipped', () => {
  const profile = createDefaultProfile(), original = JSON.stringify(profile), weapon = weaponFor('fire');
  const html = renderBuildWorkshop(profile);
  assert.ok(html.includes(`data-active-form="${weapon.variant}"`)); assert.ok(html.includes(weapon.skillName));
  assert.ok(html.includes('原有护甲')); assert.ok(html.includes('原生技能')); assert.ok(html.includes('构筑工坊'));
  const relic = gearCard(html, 'fire-pillars');
  assert.ok(relic.includes('已收藏')); assert.ok(relic.includes('aria-pressed="false"')); assert.ok(relic.includes('装备'));
  assert.equal(relic.includes('is-equipped'), false);
  assert.equal(button(html, 'build-buy', 'fire-pillars'), undefined);
  assert.equal(JSON.stringify(profile), original);
  assert.equal(html.includes('undefined'), false);
});

test('every matching relic previews its actual skill form and distinct icon; mismatches preserve weapon skills', () => {
  for (const form of SKILL_FORMS) {
    const weapon = weaponFor(form.element), summary = renderBuildSummary(weapon, { relicId: form.id });
    assert.ok(summary.includes(`data-active-form="${form.id}"`)); assert.ok(summary.includes(`data-glyph="${form.id}"`));
    assert.ok(summary.includes(form.name)); assert.ok(summary.includes(form.description));
    const other = weaponFor(form.element === 'fire' ? 'water' : 'fire');
    const mismatched = renderBuildSummary(other, { relicId: form.id });
    assert.ok(mismatched.includes(`data-active-form="${other.variant}"`)); assert.ok(mismatched.includes(other.skillName));
    assert.ok(mismatched.includes('当前使用原生技能')); assert.equal(mismatched.includes(form.description), false);
  }
});

test('equipment cards show ownership, real purchase prices, insufficient funds, and the remove action', () => {
  const profile = createDefaultProfile();
  let html = renderBuildWorkshop(profile, 'fire');
  let meteor = gearCard(html, 'fire-meteor'), purchase = button(meteor, 'build-buy', 'fire-meteor');
  assert.ok(meteor.includes('100')); assert.ok(purchase.includes('购入收藏')); assert.equal(disabled(purchase), false);
  profile.gold = 30; html = renderBuildWorkshop(profile, 'fire');
  purchase = button(html, 'build-buy', 'fire-meteor'); assert.equal(disabled(purchase), true); assert.ok(purchase.includes('金币不足'));
  for (const item of BUILD_GEAR.filter(item => item.slot === 'armor')) {
    const card = gearCard(html, item.id); assert.ok(card.includes('70')); assert.equal(disabled(button(card, 'build-buy', item.id)), true);
  }
  profile.build.ownedGear.push('fire-meteor'); profile.build.relicId = 'fire-meteor';
  html = renderBuildWorkshop(profile, 'fire'); meteor = gearCard(html, 'fire-meteor');
  assert.ok(meteor.includes('is-equipped')); assert.equal(button(meteor, 'build-buy', 'fire-meteor'), undefined);
  const remove = button(meteor, 'build-equip', ''); assert.ok(remove.includes('data-slot="relic"')); assert.ok(remove.includes('aria-pressed="true"')); assert.ok(remove.includes('取下'));
});

test('talent buttons explain prerequisites, disable the other branch, and always permit selected-node removal', () => {
  const profile = createDefaultProfile();
  let html = renderBuildWorkshop(profile, 'fire');
  const missing = button(html, 'build-talent', 'fire-aftershock'); assert.equal(disabled(missing), true); assert.ok(missing.includes('需要先选择引燃'));
  assert.equal(disabled(button(html, 'build-talent', 'fire-kindling')), false);
  assert.equal(disabled(button(html, 'build-reset')), true);
  profile.build.talents = ['fire-kindling', 'fire-aftershock']; html = renderBuildWorkshop(profile, 'fire');
  const excluded = button(html, 'build-talent', 'fire-pressure'); assert.equal(disabled(excluded), true); assert.ok(excluded.includes('先移除另一分支'));
  for (const id of profile.build.talents) {
    const chosen = button(html, 'build-talent', id); assert.equal(disabled(chosen), false); assert.ok(chosen.includes('aria-pressed="true"')); assert.ok(chosen.includes('点击移除'));
  }
  assert.equal(disabled(button(html, 'build-reset')), false);
});

test('the workshop uses total budget including spent points and never displays more than six', () => {
  const profile = createDefaultProfile(); profile.build.talents = ['fire-kindling', 'water-permafrost', 'lightning-conduction'];
  let html = renderBuildWorkshop(profile, 'fire');
  assert.match(html, /剩余天赋点 <b>0<i> \/ 3<\/i>/);
  assert.ok(button(html, 'build-talent', 'fire-pressure').includes('天赋点不足'));
  assert.equal(disabled(button(html, 'build-talent', 'fire-kindling')), false);
  profile.stats.runs = profile.stats.wins = 3; html = renderBuildWorkshop(profile, 'fire');
  assert.match(html, /剩余天赋点 <b>3<i> \/ 6<\/i>/); assert.equal(disabled(button(html, 'build-talent', 'fire-pressure')), false);
  profile.build.talents = ['fire-kindling', 'fire-pressure', 'water-permafrost', 'water-shatter', 'lightning-conduction'];
  html = renderBuildWorkshop(profile, 'lightning'); assert.match(html, /剩余天赋点 <b>1<i> \/ 6<\/i>/);
  assert.equal(disabled(button(html, 'build-talent', 'lightning-feedback')), false);
  profile.build.talents.push('lightning-feedback'); profile.stats.runs = profile.stats.wins = 999;
  html = renderBuildWorkshop(profile, 'lightning'); assert.match(html, /剩余天赋点 <b>0<i> \/ 6<\/i>/);
  assert.equal(disabled(button(html, 'build-talent', 'lightning-feedback')), false);
});

test('a pending expedition keeps its own summary while the workshop clearly previews next-run equipment', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const store = new ProfileStore({ storage }); store.equipBuildGear('relic', 'fire-pillars');
  const run = store.prepareRun('ui-snapshot').run;
  store.equipBuildGear('relic', 'water-blizzard'); store.selectWeapon('water-staff');
  const camp = renderBuildWorkshop(store.profile), battle = renderBuildSummary(weaponFor('fire'), run.buildLoadout, { battle: true });
  assert.ok(camp.includes('data-active-form="water-blizzard"')); assert.ok(camp.includes('当前战场保持原配装'));
  assert.ok(battle.includes('data-active-form="fire-pillars"')); assert.ok(battle.includes('本局配装'));
  assert.equal(battle.includes('白夜暴雪'), false);
});

test('all build metadata and profile errors translate precisely through the merged locale dictionary', () => {
  setLocale('en');
  const sources = [...SKILL_FORMS, ...BUILD_GEAR, ...TALENT_NODES].flatMap(item => [item.name, item.description]);
  for (const source of sources) {
    assert.equal(Object.hasOwn(buildsEnglish, source), true, `missing build dictionary key: ${source}`);
    assert.equal(han.test(t(source)), false, `untranslated metadata: ${source}`);
  }
  const values = new Map(), store = new ProfileStore({ storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
  const failures = [
    store.equipBuildGear('missing', null), store.equipBuildGear('armor', 'fire-pillars'), store.equipBuildGear('relic', 'fire-meteor'), store.buyBuildGear('unknown'),
    store.toggleTalent('unknown'), store.toggleTalent('fire-aftershock'),
    validateProfile({ ...createDefaultProfile(), build: [] }),
  ];
  store.toggleTalent('fire-kindling'); store.toggleTalent('fire-aftershock'); failures.push(store.toggleTalent('fire-pressure'));
  store.toggleTalent('water-permafrost'); failures.push(store.toggleTalent('water-shatter'));
  store.buyBuildGear('fire-meteor'); failures.push(store.buyBuildGear('storm-vest'));
  for (const failure of failures) {
    assert.equal(failure.ok, false); assert.equal(han.test(t(failure.message)), false, `untranslated error: ${failure.message}`);
  }
  for (const [source, translated] of Object.entries(buildsEnglish)) {
    assert.equal(han.test(translated), false, `Chinese characters in translation: ${source}`);
    assert.equal(t(source), translated, `unmerged translation: ${source}`);
  }
  assert.equal(t('{cooldown} 秒冷却', { cooldown: '4.2' }), '4.2s cooldown');
  assert.equal(t('右键 / K · {seconds} 秒冷却\n{description}', { seconds: 3.2, description: t('奔潮') }), 'Right Click / K · 3.2s cooldown\nTorrent');
});

test('English workshops have no Chinese text across gear, talent, ownership, and mismatch states', () => {
  setLocale('en');
  const fresh = createDefaultProfile(), poor = createDefaultProfile(), progressed = createDefaultProfile(); poor.gold = 0;
  progressed.build = normalizeBuild({ ownedGear: BUILD_GEAR.map(item => item.id), armorId: 'ash-mantle', relicId: 'fire-meteor', talents: ['fire-kindling', 'fire-aftershock', 'water-permafrost'] });
  for (const profile of [fresh, poor, progressed]) for (const element of ['fire', 'water', 'lightning']) {
    const html = renderBuildWorkshop(profile, element); assert.equal(han.test(html), false, `untranslated ${element} workshop`); assert.equal(html.includes('undefined'), false);
  }
  for (const item of EQUIPMENT) {
    const mismatched = item.element === 'fire' ? 'water-blizzard' : 'fire-pillars';
    assert.equal(han.test(renderBuildSummary(item, { relicId: mismatched }, { battle: true })), false);
  }
});

test('switching locale changes display names and action text without altering build IDs or selected state', () => {
  const profile = createDefaultProfile(); profile.build.relicId = 'fire-pillars'; profile.build.talents = ['fire-kindling'];
  const original = JSON.stringify(profile), chinese = renderBuildWorkshop(profile, 'fire');
  assert.ok(chinese.includes('地脉焚柱')); assert.ok(chinese.includes('引燃'));
  setLocale('en'); const english = renderBuildWorkshop(profile, 'fire');
  assert.ok(english.includes('Earthfire Pillars')); assert.ok(english.includes('Kindling')); assert.ok(english.includes('Build Workshop'));
  assert.ok(english.includes('data-active-form="fire-pillars"')); assert.ok(english.includes('data-id="fire-kindling" aria-pressed="true"'));
  assert.equal(JSON.stringify(profile), original);
});
