import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ActorSystem, ACTOR_ASSETS } from '../src/actors.js';
import { EQUIPMENT } from '../src/content.js';
import { Game } from '../src/game.js';

// Actual shipped rigs/actions are loaded; texture decoding does not render pixels.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1024, height: 1024, close() {} });
globalThis.ProgressEvent = class { constructor(type, props) { this.type = type; Object.assign(this, props); } };
const models = {}, clips = {};
before(async () => {
  const loader = new GLTFLoader();
  for (const [name, url] of Object.entries(ACTOR_ASSETS)) {
    const bytes = await fs.readFile(new URL(`../public${url}`, import.meta.url));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    models[name] = gltf.scene; clips[name] = gltf.animations;
  }
});
const kindFor = element => ({ fire: 'Knight', lightning: 'Rogue_Hooded', water: 'Mage' })[element];
const weaponAssetFor = element => ({ fire: 'Fire_Sword', lightning: 'Lightning_Spear', water: 'Water_Staff' })[element];
function fixture(weaponId = 'fire-sword') {
  const game = new Game({ seed: 17, weaponId, unlockedWeapons: EQUIPMENT.map(item => item.id) }).start();
  game.enemies = []; game.drainEvents();
  const parent = new THREE.Group();
  const system = new ActorSystem({ models, clips, parent, camera: new THREE.PerspectiveCamera() });
  system.update(game, 1 / 60);
  const deliver = () => { for (const event of game.drainEvents()) system.event(event); };
  return { game, parent, system, deliver };
}
function assertEquipped(system, game) {
  const actor = system.actors.get('player'), data = actor.userData;
  assert.equal(data.equipmentKey, game.weapon.id);
  assert.equal(data.kind, kindFor(game.weapon.element));
  assert.equal(data.equipped[0].name, `Equipped_${weaponAssetFor(game.weapon.element)}`);
  return actor;
}

for (const weapon of EQUIPMENT.filter(item => item.starter)) {
  for (const action of ['attack', 'skill']) {
    test(`${weapon.element}: immediate ${action} after a profession switch reaches the new authored rig`, () => {
      const initial = weapon.element === 'fire' ? 'water-staff' : 'fire-sword';
      const { game, parent, system, deliver } = fixture(initial);
      try {
        const previous = system.actors.get('player');
        assert.equal(game.equipWeapon(weapon.id), true);
        if (action === 'attack') game._attack();
        else assert.equal(game._castSkill(), true);
        deliver(); // Same frame as equip, before the next ActorSystem.update/render.
        const current = assertEquipped(system, game);
        assert.notEqual(current, previous);
        assert.equal(previous.parent, null);
        assert.equal(current.userData.overlay.type, action);
        const overlay = current.userData.overlay;
        system.update(game, 1 / 60);
        assert.equal(system.actors.get('player'), current);
        assert.equal(current.userData.overlay, overlay, 'render must preserve the delivered action');
        assert.equal(current.userData.overlay.type, action);
        assert.equal(parent.children.filter(item => item.name === 'Actor_player').length, 1);
        assert(current.userData.overlay.pair.upper.getClip().tracks.length > 10);
        assert(current.userData.overlay.pair.upper.getEffectiveWeight() > 0);
      } finally { system.clear(); }
    });
  }
}

for (const weapon of EQUIPMENT.filter(item => item.tier === 2)) {
  for (const action of ['attack', 'skill']) test(`${weapon.id}: same-profession upgraded equipment retains its immediate ${action}`, () => {
    const starter = EQUIPMENT.find(item => item.starter && item.element === weapon.element);
    const { game, system, deliver } = fixture(starter.id);
    try {
      const before = system.actors.get('player');
      assert.equal(game.equipWeapon(weapon.id), true);
      if (action === 'attack') game._attack();
      else assert.equal(game._castSkill(), true);
      deliver();
      const actor = assertEquipped(system, game), data = actor.userData;
      assert.notEqual(actor, before);
      assert.equal(data.overlay.type, action);
      if (action === 'attack' && weapon.element === 'fire') assert.equal(data.overlay.clipName, '2H_Melee_Attack_Slice');
      const overlay = data.overlay;
      system.update(game, 0);
      assert.equal(data.overlay, overlay);
      assert.equal(system.actors.get('player'), actor);
    } finally { system.clear(); }
  });
}

test('a combat event without a separately delivered equip event still uses the actual weapon', () => {
  const { game, system } = fixture();
  try {
    assert.equal(game.equipWeapon('water-staff'), true);
    assert.equal(game._castSkill(), true);
    const skill = game.drainEvents().find(event => event.type === 'skill');
    system.event(skill);
    assert.equal(assertEquipped(system, game).userData.overlay.type, 'skill');
    system.update(game, 1 / 60);
    assert.equal(assertEquipped(system, game).userData.overlay.type, 'skill');
  } finally { system.clear(); }
});

test('continuous switches deliver each attack once and keep only the latest player actor', () => {
  const { game, parent, system, deliver } = fixture();
  try {
    const counts = [];
    const original = system._overlay.bind(system);
    system._overlay = (root, type, ...args) => { if (type === 'attack') counts.push(root.userData.equipmentKey); return original(root, type, ...args); };
    const sequence = ['water-staff', 'lightning-halberd', 'fire-greatsword', 'water-scepter', 'lightning-spear', 'fire-sword'];
    for (const id of sequence) {
      const previous = system.actors.get('player');
      assert.equal(game.equipWeapon(id), true);
      game._attack(); deliver();
      assert.equal(previous.parent, null);
      assert.equal(assertEquipped(system, game).userData.overlay.type, 'attack');
      assert.equal(parent.children.filter(item => item.name === 'Actor_player').length, 1);
    }
    assert.deepEqual(counts, sequence);
    for (let frame = 0; frame < 12; frame++) system.update(game, 1 / 60);
    assert.deepEqual(counts, sequence, 'rendering cannot replay already delivered commands');
    assert.equal(system.pendingEvents.length, 0);
  } finally { system.clear(); }
});

test('obsolete weapon commands are not replayed on a different profession', () => {
  const { game, system, deliver } = fixture();
  try {
    game._attack();
    assert.equal(game.equipWeapon('water-staff'), true);
    deliver();
    assert.equal(assertEquipped(system, game).userData.overlay, null);
    for (let frame = 0; frame < 6; frame++) system.update(game, 1 / 60);
    assert.equal(system.pendingEvents.length, 0);
    assert.equal(assertEquipped(system, game).userData.overlay, null);
    game._attack(); deliver();
    assert.equal(assertEquipped(system, game).userData.overlay.clipName, 'Spellcast_Shoot');
  } finally { system.clear(); }
});

test('clearing or restarting removes old rigs and queued commands before a new run', () => {
  const { game, parent, system, deliver } = fixture();
  assert.equal(game.equipWeapon('lightning-spear'), true);
  assert.equal(game._castSkill(), true); deliver();
  assert.equal(assertEquipped(system, game).userData.overlay.type, 'skill');
  system.clear();
  assert.equal(system.game, null);
  assert.equal(parent.children.length, 0);
  system.event({ type: 'skill', weaponId: 'lightning-spear', element: 'lightning' });
  assert.equal(system.pendingEvents.length, 1);
  system.clear();
  const next = new Game({ seed: 29, weaponId: 'water-staff' }).start();
  next.enemies = [];
  try {
    system.update(next, 1 / 60);
    assert.equal(system.pendingEvents.length, 0);
    assert.equal(assertEquipped(system, next).userData.overlay, null);
    assert.equal(next._castSkill(), true);
    for (const event of next.drainEvents()) system.event(event);
    assert.equal(assertEquipped(system, next).userData.overlay.clipName, 'Spellcast_Long');
  } finally { system.clear(); }
});
