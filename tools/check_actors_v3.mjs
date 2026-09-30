/** Isolated actor checks using actual shipped GLBs; no browser, rendering, or save mutation. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ActorSystem, ACTOR_ASSETS } from '../src/actors.js';

// Texture decoding is intentionally stubbed: these checks cover bones/actions, not pixels.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1024, height: 1024, close() {} });
globalThis.ProgressEvent = class { constructor(type, props) { this.type = type; Object.assign(this, props); } };
const loader = new GLTFLoader();
const models = {}, clips = {};
for (const [name, url] of Object.entries(ACTOR_ASSETS)) {
  const bytes = await fs.readFile(new URL(`../public${url}`, import.meta.url));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  models[name] = gltf.scene; clips[name] = gltf.animations;
}
const parent = new THREE.Group();
const system = new ActorSystem({ models, clips, parent, camera: new THREE.PerspectiveCamera() });
const game = {
  player: { x: 0, z: 0, facing: 0, hp: 100, maxHp: 100, invulnerable: 0, shield: 0 },
  weapon: { id: 'fire-sword', element: 'fire' }, enemies: [], status: 'playing',
  combatStats: { speed: 5, attackDuration: .45 }, activeBuffs: [{ id: 'fury', remaining: 5 }],
};
function tick(count = 1, dx = 0, dz = 0) { for (let i = 0; i < count; i++) { game.player.x += dx; game.player.z += dz; system.update(game, 1 / 60); } }
const checks = []; const failures = [];
const test = (name, fn) => { try { fn(); checks.push(name); } catch (error) { failures.push({ name, error: error.message }); } };

system.event({ type: 'attack', combo: 0, element: 'fire', duration: .45 });
system.update(game, 1 / 60);
let root = system.actors.get('player');
let u = root.userData;
test('pre-spawn attack is delivered on first actor update', () => assert.equal(u.overlay.type, 'attack'));
test('bone skins are independently cloned and default extra equipment is hidden', () => {
  assert.notEqual(u.model.getObjectByName('hips'), models.Knight.getObjectByName('hips'));
  assert.equal(u.model.getObjectByName('1H_Sword').visible, false);
  assert.equal(u.model.getObjectByName('Badge_Shield').visible, true);
  assert.equal(u.equipped[0].parent.name, 'handslotr');
  assert.equal(u.equipped[0].name, 'Equipped_Fire_Sword');
});
tick(50, 0, .08);
const walk = u.pairs.get('base:Running_A').lower;
const movingBone = u.model.getObjectByName('upperlegr');
const beforePhase = walk.time;
const beforeLeg = movingBone.quaternion.clone();
system.event({ type: 'attack', combo: 1, element: 'fire', duration: .45 });
tick(6, 0, .08);
test('running keeps lower-body gait during upper-body attack', () => {
  assert(walk.time !== beforePhase);
  assert(walk.getEffectiveWeight() > .7);
  assert(u.overlay.pair.upper.getEffectiveWeight() > .9);
  assert(u.overlay.pair.lower.getEffectiveWeight() < .01);
  assert(beforeLeg.angleTo(movingBone.quaternion) > .04);
});
const beforeFacing = u.facing;
game.player.facing = Math.PI / 2;
tick(1, .08, 0);
test('aim turn is damped instead of snapping', () => assert(u.facing > beforeFacing && u.facing < game.player.facing));
const beforePause = u.overlay.elapsed;
const beforePauseTime = walk.time;
const beforePauseQuat = movingBone.quaternion.clone();
system.update(game, 0);
test('pause freezes animation time and pose', () => {
  assert.equal(u.overlay.elapsed, beforePause);
  assert.equal(walk.time, beforePauseTime);
  assert(beforePauseQuat.angleTo(movingBone.quaternion) < 1e-6);
});
tick(45);
const comboClips = [];
for (let combo = 0; combo < 3; combo++) {
  system.event({ type: 'attack', element: 'fire', combo, duration: .45 });
  comboClips.push(u.overlay.clipName);
  tick(31);
}
test('all three combo steps select distinct authored clips', () => assert.equal(new Set(comboClips).size, 3));
system.event({ type: 'skill', element: 'fire', duration: 4.5 });
tick(6);
system.event({ type: 'attack', element: 'fire', combo: 0, duration: .45 });
test('normal attack cannot interrupt cast, which does not lock for ground-effect duration', () => {
  assert.equal(u.overlay.type, 'skill'); assert.equal(u.overlay.duration, .68);
});
tick(40);
test('casting returns to locomotion after short animation', () => assert.equal(u.overlay, null));
system.event({ type: 'skill', element: 'fire', duration: 4.5 });
system.event({ type: 'dash', facing: Math.PI });
test('dash interrupts casting with higher priority', () => assert.equal(u.overlay.type, 'dash'));

const sourceMaterial = models.Knight.getObjectByName('Knight_Body').material;
const originalEmission = sourceMaterial.emissive.clone();
system.event({ type: 'hit', target: 'player', amount: 1 }); tick(1);
test('hit emission is actor-local and asset materials remain immutable', () => {
  const local = u.model.getObjectByName('Knight_Body').material;
  assert.notEqual(local, sourceMaterial); assert(sourceMaterial.emissive.equals(originalEmission));
  assert(!local.emissive.equals(originalEmission));
});
test('buff metadata uses real activeBuffs state', () => assert.equal(u.buffs, game.activeBuffs));

game.enemies = [{ id: 3, type: 'melee', x: 4, z: 3, facing: 0, hp: 100, maxHp: 100, slowRemaining: 2, burnRemaining: 0 }];
tick(1);
const enemy = system.actors.get(3);
test('slow effect changes enemy-local ring', () => assert.equal(enemy.userData.ring.material.color.getHex(), 0x70dacf));
system.event({ type: 'windup', id: 3, enemyType: 'melee', duration: .6 }); tick(6);
test('enemy warning starts authored attack animation', () => assert.equal(enemy.userData.overlay.type, 'windup'));
system.event({ type: 'kill', id: 3 }); game.enemies = []; tick(1);
test('death interrupts enemy windup and keeps a visible corpse', () => {
  assert.equal(enemy.userData.overlay.type, 'death'); assert.equal(system.actors.has(3), true);
});
tick(111);
test('corpse is cleaned up after death animation', () => assert.equal(system.actors.has(3), false));
system.event({ type: 'windup', id: 98765, duration: .6 }); tick(30);
test('events for absent actors expire rather than requeue forever', () => assert.equal(system.pendingEvents.length, 0));

for (const [element, id, expectedKind, expectedWeapon] of [
  ['lightning', 'lightning-spear', 'Rogue_Hooded', 'Lightning_Spear'],
  ['water', 'water-staff', 'Mage', 'Water_Staff'],
]) {
  game.weapon = { element, id }; tick(1); root = system.actors.get('player'); u = root.userData;
  test(`${element} equipment changes rig silhouette and held weapon`, () => {
    assert.equal(u.kind, expectedKind); assert.equal(u.equipped[0].name, `Equipped_${expectedWeapon}`);
    assert.equal(parent.children.filter(child => child.name === 'Actor_player').length, 1);
  });
  system.event({ type: 'attack', element, combo: 2, duration: .5 }); tick(10);
  test(`${element} overlay changes real arm bones`, () => assert(u.overlay.pair.upper.getClip().tracks.length > 10));
  tick(30);
}
system.event({ type: 'death' }); tick(1);
system.event({ type: 'dash' });
test('death cannot be interrupted by new combat events', () => assert.equal(u.overlay.type, 'death'));
system.clear();
test('clear removes all actor resources from scene', () => { assert.equal(system.actors.size, 0); assert.equal(parent.children.length, 0); });
console.log(JSON.stringify({ passed: checks.length, failures, checks, assets: Object.keys(models), visualRenderingVerified: false }, null, 2));

if (failures.length) process.exitCode = 1;
