import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getLocale, initLocale, onLocaleChange, setLocale, t } from '../src/i18n.js';
import { EQUIPMENT, ELEMENTS } from '../src/content.js';
import { ProfileStore, SUPPLIES, QUESTS, CAMP_LEVELS } from '../src/profile.js';
import { Game } from '../src/game.js';
import { blessingMarkup } from '../src/blessing-cards.js';

const LOCALE_KEY = 'emberfall.locale.v1';
const PROFILE_KEY = 'emberfall.profile.v4';
const han = /\p{Script=Han}/u;
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values, writes: [], failRead: false, failWrite: false,
    getItem(key) { if (this.failRead) throw Error('read denied'); return values.get(key) ?? null; },
    setItem(key, value) {
      if (this.failWrite) throw Error('write denied');
      this.writes.push(key);
      values.set(key, value);
    },
  };
}

beforeEach(() => initLocale({ storage: memoryStorage() }));
afterEach(() => initLocale({ storage: memoryStorage() }));

test('locale starts in Chinese and restores only a supported saved preference', () => {
  assert.equal(getLocale(), 'zh-CN');
  initLocale({ storage: memoryStorage({ [LOCALE_KEY]: 'en' }) });
  assert.equal(getLocale(), 'en');
  for (const invalid of ['fr', 'EN', 'null', '"en"', '']) {
    initLocale({ storage: memoryStorage({ [LOCALE_KEY]: invalid }) });
    assert.equal(getLocale(), 'zh-CN', `invalid stored locale: ${invalid}`);
  }
  const unavailable = memoryStorage();
  unavailable.failRead = true;
  setLocale('en');
  assert.doesNotThrow(() => initLocale({ storage: unavailable }));
  assert.equal(getLocale(), 'zh-CN');
});

test('language preference persists without touching game records or production data from QA', () => {
  const original = {
    [PROFILE_KEY]: '{"existing":"camp save"}',
    'emberfall.settings.v1': '{"volume":0.5}',
    'emberfall.records.v1': '{"runs":8}',
  };
  const storage = memoryStorage(original);
  initLocale({ storage });
  assert.equal(storage.writes.length, 0, 'reading the preference must not write a save');
  setLocale('en');
  assert.equal(storage.getItem(LOCALE_KEY), 'en');
  initLocale({ storage, key: `${LOCALE_KEY}.qa` });
  assert.equal(getLocale(), 'zh-CN');
  setLocale('en');
  setLocale('zh-CN');
  assert.equal(storage.getItem(`${LOCALE_KEY}.qa`), 'zh-CN');
  assert.equal(storage.getItem(LOCALE_KEY), 'en');
  for (const [key, value] of Object.entries(original)) assert.equal(storage.getItem(key), value);
  assert.deepEqual([...new Set(storage.writes)], [LOCALE_KEY, `${LOCALE_KEY}.qa`]);
});

test('invalid locale requests do not change the current language or write storage', () => {
  const storage = memoryStorage();
  initLocale({ storage });
  for (const invalid of ['de', 'EN', '', null, undefined, { locale: 'en' }]) {
    assert.equal(setLocale(invalid), false);
    assert.equal(getLocale(), 'zh-CN');
  }
  assert.deepEqual(storage.writes, []);
});

test('blocked browser storage does not prevent an in-session language change', () => {
  const storage = memoryStorage();
  storage.failWrite = true;
  initLocale({ storage });
  assert.doesNotThrow(() => setLocale('en'));
  assert.equal(getLocale(), 'en');
  assert.notEqual(t('选择祝福'), '选择祝福');
  assert.deepEqual(storage.writes, []);
});

test('subscribers fire once per language transition and unsubscribe cleanly', () => {
  const seen = [];
  const listener = locale => seen.push(locale);
  const stop = onLocaleChange(listener);
  const stopDuplicate = onLocaleChange(listener);
  try {
    setLocale('zh-CN');
    setLocale('en');
    setLocale('en');
    setLocale('fr');
    setLocale('zh-CN');
    assert.deepEqual(seen, ['en', 'zh-CN']);
  } finally {
    stop();
    stopDuplicate();
  }
  setLocale('en');
  assert.deepEqual(seen, ['en', 'zh-CN']);
});

test('translation falls back to its source and interpolates zero values without dropping unknown fields', () => {
  for (const locale of ['zh-CN', 'en']) {
    setLocale(locale);
    assert.equal(t('Unknown item {name}: {count} / {missing}', { name: 'Ember', count: 0 }), 'Unknown item Ember: 0 / {missing}');
    assert.equal(t('An untranslated phrase'), 'An untranslated phrase');
    assert.equal(t('constructor'), 'constructor');
    assert.equal(t(null), '');
  }
});

test('all equipment, class, skill, supply and quest descriptions have English display text', () => {
  const source = JSON.stringify({ EQUIPMENT, ELEMENTS, SUPPLIES, QUESTS, CAMP_LEVELS });
  const text = [
    ...EQUIPMENT.flatMap(item => [item.name, item.className, item.description, item.skillName, item.skillDescription]),
    ...Object.values(ELEMENTS).flatMap(item => [item.name, item.className, item.buffName]),
    ...SUPPLIES.flatMap(item => [item.name, item.description]),
    ...QUESTS.flatMap(item => [item.name, item.description]),
    ...CAMP_LEVELS.map(item => item.name),
  ];
  setLocale('en');
  for (const value of text) {
    assert.ok(t(value).trim(), `English text is empty: ${value}`);
    assert.equal(han.test(t(value)), false, `missing English translation: ${value}`);
  }
  setLocale('zh-CN');
  for (const value of text) assert.equal(t(value), value);
  assert.equal(JSON.stringify({ EQUIPMENT, ELEMENTS, SUPPLIES, QUESTS, CAMP_LEVELS }), source,
    'localization must not rewrite equipment IDs, tuning or shared source content');
});

test('every blessing renders in either language while retaining its choice index and reward identity', () => {
  const game = new Game({ seed: 917 }).start();
  const encountered = new Set();
  for (let draw = 0; draw < 40; draw++) {
    game._offerUpgrades(draw % 2 ? 'room' : 'level');
    const choices = JSON.stringify(game.choices);
    for (const locale of ['en', 'zh-CN']) {
      setLocale(locale);
      const markup = blessingMarkup(game);
      for (const [index, choice] of game.choices.entries()) {
        encountered.add(choice.id);
        assert.ok(markup.includes(`data-choice="${index}"`));
        assert.ok(markup.includes(`data-blessing="${choice.id}"`));
        assert.ok(markup.includes(t(choice.name)), `rendered blessing name: ${choice.id} / ${locale}`);
      }
      if (locale === 'en') assert.equal(han.test(markup), false, 'all visible and accessible card text must be English');
    }
    assert.equal(JSON.stringify(game.choices), choices, 'rendering must not alter offered rewards');
  }
  assert.equal(encountered.size, 12, 'exercise all current blessing definitions');
});

test('changing language during a run preserves the current run, inventory and persisted profile', () => {
  const storage = memoryStorage();
  const store = new ProfileStore({ storage });
  assert.equal(store.buyItem('ward-charm').ok, true);
  assert.equal(store.selectSupply('ward-charm').ok, true);
  assert.equal(store.acceptQuest('ash-hunt').ok, true);
  assert.equal(store.prepareRun('bilingual-run').ok, true);
  const game = new Game({ seed: 917 }).start();
  game.enemies = [];
  game._offerUpgrades('room');
  const runBefore = JSON.stringify(game);
  const profileBefore = store.profile;
  const rawBefore = storage.getItem(PROFILE_KEY);
  const writesBefore = storage.writes.length;
  initLocale({ storage });
  for (const locale of ['en', 'zh-CN', 'en']) {
    setLocale(locale);
    blessingMarkup(game);
    t(game.weapon.name);
    assert.equal(JSON.stringify(game), runBefore);
    assert.deepEqual(store.profile, profileBefore);
    assert.equal(storage.getItem(PROFILE_KEY), rawBefore);
  }
  assert.ok(storage.writes.slice(writesBefore).every(key => key === LOCALE_KEY));
});
