/** Validate the actual rounded rigs, authored animation set, and hand equipment. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ActorSystem, ACTOR_ASSETS } from '../src/actors.js';

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1024, height: 1024, close() {} });
globalThis.ProgressEvent = class { constructor(type, props) { this.type = type; Object.assign(this, props); } };
const loader = new GLTFLoader();
const assets = {}, clips = {};
const checks = [];
const test = (name, run) => { run(); checks.push(name); };
async function load(url) {
  const bytes = await fs.readFile(new URL(`../public${url}`, import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { gltf: await loader.parseAsync(buffer, ''), bytes };
}
for (const [kind, url] of Object.entries(ACTOR_ASSETS)) {
  const { gltf } = await load(url); assets[kind] = gltf.scene; clips[kind] = gltf.animations;
}
const sources = { Knight: '/assets/vendor/kaykit/Knight.glb', Rogue_Hooded: '/assets/vendor/kaykit/Rogue_Hooded.glb', Mage: '/assets/models-v3/Mage.glb' };
const report = [];
for (const [kind, originalUrl] of Object.entries(sources)) {
  const { gltf: source } = await load(originalUrl);
  const { gltf, bytes } = await load(ACTOR_ASSETS[kind]);
  const sourceNames = source.animations.map(c => c.name).sort();
  test(`${kind}: all 76 original animation names survive`, () => {
    assert.equal(sourceNames.length, 76);
    assert.deepEqual(gltf.animations.map(c => c.name).sort(), sourceNames);
  });
  const required = ['root', 'hips', 'spine', 'chest', 'head', 'handslotr', 'handslotl'];
  test(`${kind}: actor bone names and both hand slots survive`, () => {
    for (const name of required) assert(gltf.scene.getObjectByName(name), name);
  });
  let vertices = 0, triangles = 0, skinMeshes = 0, sourceVertices = 0;
  source.scene.traverse(o => { if (o.isMesh) sourceVertices += o.geometry.attributes.position.count; });
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    vertices += o.geometry.attributes.position.count;
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    if (o.isSkinnedMesh) {
      skinMeshes++;
      const weights = o.geometry.attributes.skinWeight;
      test(`${kind}/${o.name}: finite normalized four-joint skin weights`, () => {
        for (let i = 0; i < weights.count; i++) {
          const values = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
          assert(values.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
          assert(Math.abs(values.reduce((a, b) => a + b, 0) - 1) < .002);
        }
      });
    }
    test(`${kind}/${o.name}: normals, UVs, and PBR materials are present`, () => {
      assert(o.geometry.attributes.normal);
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      for (const material of materials) {
        assert(material.isMeshStandardMaterial);
        assert(material.color.toArray().every(Number.isFinite));
        if (material.map) assert(o.geometry.attributes.uv);
      }
    });
  });
  test(`${kind}: real rounded geometry stays within the player budget`, () => {
    assert(vertices > sourceVertices * 1.6);
    assert(triangles < 75000);
    assert(skinMeshes >= 6);
    assert(bytes.length < 5 * 1024 * 1024);
  });
  report.push({ file: `${kind}.glb`, bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    vertices, triangles, skinnedMeshes: skinMeshes, animationCount: gltf.animations.length,
    source: originalUrl, license: 'CC0-1.0',
    editableSource: `blender/emberfall-v6-${kind}.blend` });
}
for (const [element, weaponId, kind] of [['fire','fire-sword','Knight'], ['lightning','lightning-spear','Rogue_Hooded'], ['water','water-staff','Mage']]) {
  const parent = new THREE.Group();
  const system = new ActorSystem({ models: assets, clips, parent, camera: new THREE.PerspectiveCamera() });
  const game = { player: { x: 0, z: 0, facing: 0, hp: 120, maxHp: 120, invulnerable: 0, shield: 0 },
    weapon: { id: weaponId, element }, enemies: [], status: 'playing', activeBuffs: [],
    combatStats: { speed: 5, attackDuration: .45 } };
  system.update(game, 1/60);
  const actor = system.actors.get('player'), data = actor.userData;
  test(`${kind}: camp/game ActorSystem selects the rounded model and real hand weapon`, () => {
    assert.equal(data.kind, kind);
    assert.equal(data.equipped[0].parent.name, 'handslotr');
    assert(data.model.getObjectByName(`${kind === 'Rogue_Hooded' ? 'Rogue' : kind}_Clasp_Gem`).visible);
  });
  data.model.updateMatrixWorld(true);
  const wrist = data.model.getObjectByName('handslotr');
  const rest = wrist.getWorldPosition(new THREE.Vector3());
  system.event({ type: 'attack', element, combo: 1, duration: .45 });
  for (let i=0;i<12;i++) system.update(game,1/60);
  data.model.updateMatrixWorld(true);
  const attacked = wrist.getWorldPosition(new THREE.Vector3());
  test(`${kind}: animated attack moves the hand and the held weapon follows`, () => {
    assert(rest.distanceTo(attacked) > .01);
    assert(data.equipped[0].parent === wrist);
    assert(data.equipped[0].getWorldPosition(new THREE.Vector3()).distanceTo(attacked) < .0001);
  });
  system.event({ type: 'dash', facing: 0 });
  for (let i=0;i<25;i++) { game.player.z += .08; system.update(game,1/60); }
  test(`${kind}: dodge returns to authored locomotion`, () => {
    assert.equal(data.overlay, null);
    assert(data.pairs.get('base:Running_A').lower.getEffectiveWeight() > .5);
  });
  system.event({ type: 'skill', element });
  for (let i=0;i<50;i++) system.update(game,1/60);
  test(`${kind}: skill returns without locking the player`, () => assert.equal(data.overlay, null));
  data.model.updateMatrixWorld(true);
  test(`${kind}: posed skin vertices stay finite after running, attack, dodge, and cast`, () => {
    const point = new THREE.Vector3();
    data.model.traverse(o => {
      if (!o.isSkinnedMesh) return;
      o.skeleton.update();
      for (let i=0;i<o.geometry.attributes.position.count;i+=31) {
        o.getVertexPosition(i, point);
        assert(point.toArray().every(Number.isFinite));
        assert(point.length() < 10);
      }
    });
  });
  system.clear();
}
const output = { version: '0.6', generator: 'blender/build_rounded_v6.py',
  originalsRetained: true, externalTextureRequests: false, dracoRequired: false,
  assets: report, passed: checks.length, checks, visualRenderingVerified: false };
await fs.writeFile(new URL('../public/assets/models-v6/manifest-v6.json', import.meta.url), JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({ passed: checks.length, assets: report },null,2));
