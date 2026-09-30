import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Game } from '../src/game.js';
import { blessingMarkup, markBlessingSelected } from '../src/blessing-cards.js';

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
  sourceBetween('function showUpgrade()', '\nfunction showResult()'),
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

function fixture({ reducedMotion = false } = {}) {
  const game = new Game({ seed: 917 }).start();
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
    game, ready: true, overlay: null, blessingSelectionPending: false,
    held: new Set(), pulses: { dash: false, skill: false, potion: false, interact: false },
    pointer: { active: false, attack: false, buttonAttack: false }, queuedAttack: false,
    document: { hidden: false }, Element: StubElement,
    ui: new Proxy({}, { get: (_, id) => element(id) }), $: element,
    settings: { volume: .8, muted: false, quality: 'high', bloom: true, shake: true, effects: 1 },
    view: { render: noop, effect: noop }, audio: { play: noop }, campPreview: null,
    previousFrame: 0, hudClock: 0, checkpointClock: 0, impactTime: 0,
    flash: 0, killBannerTimer: 0, lastRoom: -1,
    blessingMarkup, markBlessingSelected,
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
    frame() { frameNow += 1000 / 60; context.frame(frameNow); },
  };
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

for (const reducedMotion of [false, true]) {
  test(`a single clicked blessing releases keyboard movement and Escape (reduced motion: ${reducedMotion})`, () => {
    const harness = fixture({ reducedMotion });
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

test('two queued levels accept their own keyboard choice and release movement after the final card', () => {
  const harness = fixture();
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

test('E claims a cleared-room blessing, unlocks its passage and leaves keyboard movement usable', () => {
  const harness = fixture();
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

test('repeated clicks and number keys during the 200ms flourish grant exactly one blessing', () => {
  const harness = fixture();
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

test('clicking pause during the blessing flourish preserves the pause until the player resumes', () => {
  const harness = fixture();
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
