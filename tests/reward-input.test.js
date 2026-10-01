import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Game } from '../src/game.js';
import { blessingMarkup, markBlessingSelected } from '../src/blessing-cards.js';
import { t, getLocale, setLocale, initLocale } from '../src/i18n.js';

// Exercise the shipped input/overlay code, rather than a copy of its state machine.
// Rendering, audio, persistence and browser scheduling are the only substituted edges.
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function sourceBetween(start, end) {
  const from = mainSource.indexOf(start);
  const to = mainSource.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `main.js integration boundary missing: ${start}`);
  return mainSource.slice(from, to);
}
const uiLogic = [
  sourceBetween('function clearInput()', '\nfunction syncAudio()'),
  sourceBetween('function showOverlay(', '\nfunction updateRecordLabel()'),
  sourceBetween('function openPause(', '\nfunction closePopup()'),
  sourceBetween('let pendingBlessingIndex = null;', '\nfunction showResult()'),
  sourceBetween('function consumeEvents()', '\nfunction flashSkill('),
  sourceBetween('function action(', '\nui.world.tabIndex'),
  sourceBetween("addEventListener('keydown',", "\naddEventListener('keyup',"),
  mainSource.match(/^addEventListener\('keyup',.*$/m)?.[0],
  mainSource.match(/^ui\.pause\.addEventListener\('click',.*$/m)?.[0],
  sourceBetween('function frame(', '\nasync function initialize()'),
].join('\n');

class StubElement {
  constructor() {
    this.dataset = {};
    this.style = {};
    this.listeners = new Map();
    this.attributes = new Map();
    const classes = new Set();
    this.classList = { add: name => classes.add(name), remove: name => classes.delete(name) };
    this.children = [];
    this.hand = null;
  }
  set innerHTML(value) {
    this.html = value;
    this.children = [...value.matchAll(/data-choice="(\d+)"/g)].map(match => {
      const button = new StubElement();
      button.dataset.choice = match[1];
      return button;
    });
    this.hand = value.includes('blessing-hand') ? new StubElement() : null;
  }
  get innerHTML() { return this.html ?? ''; }
  querySelectorAll(selector) { return selector === '[data-choice]' ? this.children : []; }
  querySelector(selector) {
    if (selector === '.blessing-hand') return this.hand;
    const choice = selector.match(/^\[data-choice="(\d+)"\]$/);
    return choice ? this.children.find(node => node.dataset.choice === choice[1]) : this.children[0] ?? null;
  }
  replaceChildren() { this.children = []; this.hand = null; this.html = ''; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatch(type) { for (const callback of this.listeners.get(type) ?? []) callback({ target: this }); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  matches() { return false; }
  focus() {}
}

function fixture({ reducedMotion = false, locale = 'zh-CN', expeditionId = 'grave' } = {}) {
  initLocale();
  setLocale(locale);
  const game = new Game({ seed: 917, expeditionId }).start();
  game.enemies = [];
  game.player.invulnerable = 9999;
  game.drainEvents();
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new StubElement());
    return elements.get(id);
  };
  const listeners = new Map();
  const timers = new Map();
  let timerId = 0, timerNow = 0, frameNow = 0;
  const noop = () => {};
  const context = vm.createContext({
    game, ready: true, overlay: null, blessingSelectionPending: false, pauseMessage: '', qaManualDrive: false,
    held: new Set(), pulses: { dash: false, skill: false, potion: false, interact: false },
    pointer: { active: false, attack: false, buttonAttack: false }, queuedAttack: false,
    document: { hidden: false }, Element: StubElement,
    ui: new Proxy({}, { get: (_, id) => element(id) }), $: element,
    settings: { volume: .8, muted: false, quality: 'high', bloom: true, shake: true, effects: 1 },
    view: { render: noop, effect: noop }, audio: { play: noop }, campPreview: null,
    previousFrame: 0, hudClock: 0, checkpointClock: 0, impactTime: 0,
    flash: 0, killBannerTimer: 0, lastRoom: -1,
    blessingMarkup, markBlessingSelected, t, getLocale, setLocale,
    syncAudio: noop, updateHud: noop, checkpointExpedition: noop,
    floatText: noop, flashSkill: noop, showToast: noop,
    showResult: () => assert.fail('fixture unexpectedly reached a run result'),
    escape: String, openHelp: noop, openBuild: noop, closePopup: noop, cycleWeapon: noop,
    startGame: noop, showMenu: noop,
    addEventListener: (type, callback) => listeners.set(type, callback),
    requestAnimationFrame: noop,
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout: (callback, delay) => {
      const id = ++timerId;
      timers.set(id, { callback, due: timerNow + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(uiLogic, context, { filename: 'main.js:reward-input-integration' });
  return {
    game, context,
    offerLevels(count = 1) {
      for (let i = 0; i < count; i++) game._gainXp(game.player.xpNext);
      game._showPendingLevel();
      context.consumeEvents();
      assert.equal(context.overlay, 'upgrade');
    },
    clickChoice(index) {
      const button = element('overlay-content').children[index];
      assert.ok(button, `visible choice ${index} must exist`);
      button.dispatch('click');
    },
    clickPause() { element('pause').dispatch('click'); },
    key(code, type = 'keydown', repeat = false) {
      let prevented = false;
      listeners.get(type)({ code, repeat, target: element('world'), preventDefault() { prevented = true; } });
      return prevented;
    },
    advance(ms) {
      const until = timerNow + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, value]) => value.due <= until)
          .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (!next) break;
        timerNow = next[1].due;
        timers.delete(next[0]);
        next[1].callback();
      }
      timerNow = until;
    },
    frame(milliseconds = 1000 / 60) { frameNow += milliseconds; context.frame(frameNow); },
  };
}

// Local mechanism fixtures establish a cleared room and a valid approach
// position. The assertions then use the shipped key listeners and main.frame;
// natural navigation and progression are covered by campaign-flow separately.
function mechanismKeyboardFixture(expeditionId) {
  const harness = fixture({ expeditionId });
  const { game } = harness;
  const id = expeditionId === 'aqueduct' ? 'sluice-wheel' : 'forge-sigil';
  const point = game.interestPoints.find(item => item.id === id);
  game._enterRoom(point.zoneIndex);
  game.enemies = [];
  game.roomCleared = true; game.roomRewardTaken = true; game.rewardReady = false;
  game._refreshInterestPoints();
  Object.assign(game.player, { x: point.x, z: point.z });
  game.drainEvents();
  return { harness, point };
}

function renderKeyboardFrames(harness, count) {
  for (let frame = 0; frame < count; frame++) harness.frame(1000 / 30);
}

for (const expeditionId of ['grave', 'aqueduct']) {
  test(`${expeditionId}: one real E keydown held across main frames completes a mechanism once`, () => {
    const { harness, point } = mechanismKeyboardFixture(expeditionId);
    const gold = harness.game.gold;
    harness.key('KeyE');
    renderKeyboardFrames(harness, 60);
    assert.equal(point.completed, false, 'two seconds is shorter than the required hold');
    assert.ok(harness.game.interactionChannel?.elapsed > 1.9,
      'the actual main input path keeps E held after its first-frame pulse');
    renderKeyboardFrames(harness, 60);
    harness.key('KeyE', 'keyup');
    assert.equal(point.completed, true);
    assert.equal(harness.game.gold, gold + point.reward.gold);
    if (expeditionId === 'aqueduct') assert.equal(harness.game.bossWard, .2);
    harness.key('KeyE'); renderKeyboardFrames(harness, 120); harness.key('KeyE', 'keyup');
    assert.equal(harness.game.gold, gold + point.reward.gold, 'another keyboard hold cannot collect the same objective twice');
  });

  test(`${expeditionId}: a real short E press and release clears the channel without awarding it`, () => {
    const { harness, point } = mechanismKeyboardFixture(expeditionId);
    harness.key('KeyE'); renderKeyboardFrames(harness, 15);
    assert.ok(harness.game.interactionChannel);
    harness.key('KeyE', 'keyup'); harness.frame();
    assert.equal(harness.game.interactionChannel, null);
    renderKeyboardFrames(harness, 120);
    assert.equal(point.completed, false);
    assert.equal(harness.game.gold, 0);
    assert.equal(harness.context.held.has('KeyE'), false);
  });

  test(`${expeditionId}: pausing a held operation freezes it and resuming without held E cannot continue it`, () => {
    const { harness, point } = mechanismKeyboardFixture(expeditionId);
    harness.key('KeyE'); renderKeyboardFrames(harness, 15);
    const elapsed = harness.game.interactionChannel.elapsed, time = harness.game.time;
    harness.key('Escape');
    assert.equal(harness.context.overlay, 'pause');
    assert.equal(harness.context.held.has('KeyE'), false, 'the actual pause path clears the prior held key');
    harness.key('KeyE', 'keyup');
    renderKeyboardFrames(harness, 120);
    assert.equal(harness.game.time, time);
    assert.equal(harness.game.interactionChannel.elapsed, elapsed);
    harness.key('Escape'); renderKeyboardFrames(harness, 120);
    assert.equal(harness.context.overlay, null);
    assert.equal(harness.game.interactionChannel, null);
    assert.equal(point.completed, false); assert.equal(harness.game.gold, 0);
    harness.key('KeyE'); renderKeyboardFrames(harness, 120); harness.key('KeyE', 'keyup');
    assert.equal(point.completed, true, 'a fresh held key can start the operation after resume');
  });
}

const boonCount = game => game.boons.reduce((sum, boon) => sum + boon.stacks, 0);
function assertKeyboardMoves(harness) {
  const before = { x: harness.game.player.x, z: harness.game.player.z };
  harness.key('KeyD');
  harness.frame();
  harness.key('KeyD', 'keyup');
  assert.ok(Math.hypot(harness.game.player.x - before.x, harness.game.player.z - before.z) > .01,
    'the actual keydown → frame → Game input path must move after the last reward');
}

for (const locale of ['zh-CN', 'en']) {
for (const reducedMotion of [false, true]) {
  test(`a single clicked blessing releases keyboard movement and Escape (${locale}, reduced motion: ${reducedMotion})`, () => {
    const harness = fixture({ reducedMotion, locale });
    harness.offerLevels();
    harness.clickChoice(0);
    harness.advance(reducedMotion ? 0 : 200);
    assert.equal(boonCount(harness.game), 1);
    assert.equal(harness.game.status, 'playing');
    assert.equal(harness.context.overlay, null);
    assertKeyboardMoves(harness);
    harness.key('Escape');
    assert.equal(harness.context.overlay, 'pause', 'Escape must work after rewarding');
    harness.key('Escape');
    assert.equal(harness.context.overlay, null);
  });
}

test(`two queued levels accept their own keyboard choice and release movement after the final card (${locale})`, () => {
  const harness = fixture({ locale });
  harness.offerLevels(2);
  harness.key('Digit1');
  harness.advance(200);
  assert.equal(boonCount(harness.game), 1);
  assert.equal(harness.game.status, 'upgrade');
  assert.equal(harness.context.overlay, 'upgrade');
  harness.key('Digit2');
  harness.advance(200);
  assert.equal(boonCount(harness.game), 2);
  assert.equal(harness.game.status, 'playing');
  assertKeyboardMoves(harness);
});

test(`E claims a cleared-room blessing, unlocks its passage and leaves keyboard movement usable (${locale})`, () => {
  const harness = fixture({ locale });
  harness.game._finishRoom();
  const lockedSurfaceCount = harness.game._allowedSurfaces.length;
  harness.key('KeyE');
  harness.frame();
  harness.key('KeyE', 'keyup');
  assert.equal(harness.game.choiceReason, 'room');
  assert.equal(harness.context.overlay, 'upgrade');
  harness.clickChoice(1);
  harness.advance(200);
  assert.equal(harness.game.roomRewardTaken, true);
  assert.equal(harness.game.rewardReady, false);
  assert.ok(harness.game._allowedSurfaces.length > lockedSurfaceCount);
  assertKeyboardMoves(harness);
});

test(`repeated clicks and number keys during the 200ms flourish grant exactly one blessing (${locale})`, () => {
  const harness = fixture({ locale });
  harness.offerLevels();
  harness.clickChoice(0);
  harness.clickChoice(0);
  harness.clickChoice(1);
  harness.key('Digit2');
  harness.key('Digit3');
  harness.key('Digit1', 'keydown', true);
  harness.advance(199);
  assert.equal(boonCount(harness.game), 0);
  harness.advance(1);
  assert.equal(boonCount(harness.game), 1);
  harness.advance(500);
  assert.equal(boonCount(harness.game), 1);
  assertKeyboardMoves(harness);
});

test(`clicking pause during the blessing flourish preserves the pause until the player resumes (${locale})`, () => {
  const harness = fixture({ locale });
  harness.offerLevels();
  harness.clickChoice(0);
  harness.clickPause();
  assert.equal(harness.context.overlay, 'pause');
  harness.advance(200);
  assert.equal(boonCount(harness.game), 1);
  assert.equal(harness.context.overlay, 'pause', 'reward completion must not close a newer pause dialog');
  const pausedTime = harness.game.time;
  harness.key('KeyD');
  harness.frame();
  assert.equal(harness.game.time, pausedTime);
  harness.key('Escape');
  assert.equal(harness.context.overlay, null);
  assertKeyboardMoves(harness);
});

for (const reducedMotion of [false, true]) {
  test(`resuming during a blessing selection cannot spend an old card on the next queued level (${locale}, reduced motion: ${reducedMotion})`, () => {
    const harness = fixture({ locale, reducedMotion });
    harness.offerLevels(2);
    const firstChoiceId = harness.game.choices[0].id;
    harness.clickChoice(0);
    harness.clickPause();
    harness.key('Escape');
    assert.equal(harness.context.overlay, 'upgrade');
    assert.equal(harness.context.blessingSelectionPending, true,
      'pause → resume must not release the in-flight selection guard');
    assert.ok(harness.context.ui['overlay-content'].children.every(button => button.disabled),
      'the restored old cards stay visibly disabled');
    assert.equal(harness.context.ui['overlay-content'].children[0].attributes.get('aria-pressed'), 'true',
      'the original selected card keeps its selection flourish after resuming');
    harness.clickChoice(1);
    harness.key('Digit3');
    harness.advance(reducedMotion ? 0 : 200);
    assert.equal(boonCount(harness.game), 1,
      'the old card click can only grant the first selected blessing');
    assert.equal(harness.game.boons[0].id, firstChoiceId);
    assert.equal(harness.game.status, 'upgrade');
    assert.equal(harness.context.overlay, 'upgrade');
    assert.equal(harness.context.blessingSelectionPending, false);
    assert.ok(harness.context.ui['overlay-content'].children.every(button => !button.disabled),
      'the genuine next choice set is now selectable');
    const secondChoiceId = harness.game.choices[1].id;
    harness.clickChoice(1);
    harness.advance(reducedMotion ? 0 : 200);
    assert.equal(boonCount(harness.game), 2);
    assert.ok(harness.game.boons.some(boon => boon.id === secondChoiceId));
    assert.equal(harness.game.status, 'playing');
    assertKeyboardMoves(harness);
  });
}

test(`redrawing an open blessing in the other language preserves its choices and releases movement (${locale})`, () => {
  const harness = fixture({ locale });
  harness.offerLevels();
  const choices = JSON.stringify(harness.game.choices);
  setLocale(locale === 'en' ? 'zh-CN' : 'en');
  harness.context.showUpgrade(true);
  assert.ok(harness.context.ui['overlay-content'].innerHTML.includes(t('选择祝福')));
  assert.equal(JSON.stringify(harness.game.choices), choices);
  assert.equal(boonCount(harness.game), 0);
  harness.clickChoice(2);
  harness.advance(200);
  assert.equal(harness.game.boons[0].id, JSON.parse(choices)[2].id);
  assertKeyboardMoves(harness);
});

test(`a language redraw during the selection flourish cannot grant a second reward or trap movement (${locale})`, () => {
  const harness = fixture({ locale });
  harness.offerLevels();
  const selectedId = harness.game.choices[0].id;
  harness.clickChoice(0);
  assert.equal(harness.context.ui['language-switch'].disabled, true);
  harness.advance(75);
  setLocale(locale === 'en' ? 'zh-CN' : 'en');
  harness.context.showUpgrade(true);
  assert.equal(harness.context.blessingSelectionPending, true);
  harness.clickChoice(1);
  harness.key('Digit3');
  harness.advance(125);
  assert.equal(boonCount(harness.game), 1);
  assert.equal(harness.game.boons[0].id, selectedId);
  assert.equal(harness.context.blessingSelectionPending, false);
  assert.equal(harness.context.ui['language-switch'].disabled, false);
  assertKeyboardMoves(harness);
});
}
