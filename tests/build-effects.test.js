import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSkillVisual, SkillEffects } from '../src/skill-effects.js';
import { ActorSystem, ACTOR_ASSETS } from '../src/actors.js';
import { equipmentById } from '../src/content.js';

const forms = ['fire-pillars', 'fire-meteor', 'water-blizzard', 'water-torrent', 'lightning-chain', 'lightning-lances'];
function effect(form, id = 1) {
  return { id, form, element: form.split('-')[0] === 'water' ? 'water' : form.startsWith('fire') ? 'fire' : 'lightning',
    origin: { x: 0, z: 0 }, facing: Math.PI, x: 0, z: -6, radius: 3, duration: 4, remaining: 4, age: .3, delay: .8,
    width: 4, length: 11, points: [1, 2, 3, 4].map(index => ({ x: 0, z: -index * 2, delay: .2 + index * .2 })),
    lines: [-1, 0, 1].map(offset => ({ from: { x: 0, z: 0 }, to: { x: offset * 2, z: -10 } })) };
}
const noopFX = new Proxy({}, { get: (_, key) => ['shake', 'punch'].includes(key) ? 0 : () => {} });

test('six skill forms build different actual structures instead of six recoloured radial discs', () => {
  const expected = { 'fire-pillars': 'PillarWarning', 'fire-meteor': 'FallingMeteor', 'water-blizzard': 'Snowfall',
    'water-torrent': 'WaveFront', 'lightning-chain': 'ChainCoil', 'lightning-lances': 'LanceWarning' };
  const owner = new SkillEffects(new THREE.Scene(), noopFX);
  for (const form of forms) { const object = createSkillVisual(effect(form)); assert.ok(object.getObjectByName(expected[form])); owner.disposeObject(object); }
});

test('snow quantity follows quality and effects intensity, with bounded temporary resources', () => {
  const high = createSkillVisual(effect('water-blizzard'), 'high', 1.5), low = createSkillVisual(effect('water-blizzard'), 'low', .5);
  assert.equal(high.getObjectByName('Snowfall').count, 63); assert.equal(low.getObjectByName('Snowfall').count, 6);
  const owner = new SkillEffects(new THREE.Scene(), noopFX); owner.disposeObject(high); owner.disposeObject(low);
  owner.configure({ quality: 'low' });
  for (let index = 0; index < 200; index++) owner.event({ type: 'skillshape', form: 'fire-pillars', phase: 'pillar', element: 'fire', x: 0, z: 0, radius: 1.3 });
  assert.equal(owner.effects.length, 18); owner.update({ skillEffects: [] }, 2); assert.equal(owner.effects.length, 0); assert.equal(owner.root.children.length, 0);
});

test('skill fields follow simulation positions and dispose every private resource once on expiry or quality change', () => {
  const owner = new SkillEffects(new THREE.Scene(), noopFX), storm = effect('water-blizzard'); owner.update({ skillEffects: [storm] }, .1);
  const field = owner.fields.get(1).object, geometries = new Map(), materials = new Map();
  field.traverse(child => { if (child.geometry) geometries.set(child.geometry, 0); if (child.material) materials.set(child.material, 0); });
  for (const geometry of geometries.keys()) geometry.addEventListener('dispose', () => geometries.set(geometry, geometries.get(geometry) + 1));
  for (const material of materials.keys()) material.addEventListener('dispose', () => materials.set(material, materials.get(material) + 1));
  owner.configure({ quality: 'low' }); assert.equal(owner.fields.size, 0);
  assert.ok([...geometries.values(), ...materials.values()].every(value => value === 1));
  for (let round = 0; round < 30; round++) { owner.update({ skillEffects: forms.map((form, index) => effect(form, index + 1)) }, .1); owner.update({ skillEffects: [] }, .1); }
  assert.equal(owner.fields.size, 0); assert.equal(owner.root.children.length, 0); owner.clear();
});

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1024, height: 1024, close() {} });
globalThis.ProgressEvent = class { constructor(type, props) { this.type = type; Object.assign(this, props); } };
const models = {}, clips = {};
before(async () => {
  const loader = new GLTFLoader();
  for (const [name, url] of Object.entries(ACTOR_ASSETS)) {
    if (!['Knight', 'Rogue_Hooded', 'Mage', 'Fire_Sword', 'Lightning_Spear', 'Water_Staff'].includes(name)) continue;
    const bytes = await fs.readFile(new URL(`../public${url}`, import.meta.url));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''); models[name] = gltf.scene; clips[name] = gltf.animations;
  }
});

test('independent armor and relic refresh a real rig even when the wielded weapon is unchanged', () => {
  const parent = new THREE.Group(), camera = new THREE.PerspectiveCamera(), system = new ActorSystem({ models, clips, parent, camera });
  const game = { player: { x: 0, z: 0, hp: 120, maxHp: 120, facing: 0, shield: 0 }, weapon: equipmentById('water-staff'), enemies: [], status: 'menu', buildLoadout: {} };
  system.update(game, 0); const original = system.actors.get('player'); assert.equal(original.userData.buildAppearance, undefined);
  game.buildLoadout = { armorId: 'glacier-robes', relicId: 'water-blizzard' }; system.update(game, 0);
  const ice = system.actors.get('player'); assert.notEqual(ice, original); assert.equal(original.parent, null);
  assert.ok(ice.getObjectByName('Build_IceTabard')); assert.ok(ice.getObjectByName('Build_RelicSeal')); assert.equal(ice.userData.equipmentKey, 'water-staff');
  const state = ice.userData.buildAppearance, counts = new Map();
  for (const resource of [...state.geometries, ...state.materials]) { counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)); }
  game.buildLoadout = { armorId: 'ash-mantle', relicId: 'fire-pillars' }; system.update(game, 0);
  assert.ok(system.actors.get('player').getObjectByName('Build_EmberMantle')); assert.ok([...counts.values()].every(value => value === 1));
  assert.equal(parent.children.filter(child => child.name === 'Actor_player').length, 1);
  game.buildLoadout = {}; system.update(game, 0); assert.equal(system.actors.get('player').userData.buildAppearance, undefined); system.clear(); assert.equal(parent.children.length, 0);
});
