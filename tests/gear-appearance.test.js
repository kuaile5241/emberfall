import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ActorSystem, ACTOR_ASSETS } from '../src/actors.js';
import { EQUIPMENT, equipmentById } from '../src/content.js';
import { applyEquipmentAppearance, disposeEquipmentAppearance, equipmentAppearanceName } from '../src/gear-appearance.js';

// Load actual shipped skeletons and meshes. Image decoding is stubbed; pixels are
// verified separately in the browser, not claimed by these structure checks.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1024, height: 1024, close() {} });
globalThis.ProgressEvent = class { constructor(type, props) { this.type = type; Object.assign(this, props); } };
const models = {}, clips = {};
before(async () => {
  const loader = new GLTFLoader();
  for (const [name, url] of Object.entries(ACTOR_ASSETS)) {
    if (!['Knight', 'Rogue_Hooded', 'Mage', 'Fire_Sword', 'Lightning_Spear', 'Water_Staff'].includes(name)) continue;
    const bytes = await fs.readFile(new URL(`../public${url}`, import.meta.url));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    models[name] = gltf.scene; clips[name] = gltf.animations;
  }
});

function fixture(weapon) {
  const player = { x: 0, z: 0, facing: 0, hp: 100, maxHp: 100, invulnerable: 0, shield: 0 };
  const parent = new THREE.Group();
  const system = new ActorSystem({ models, clips, parent, camera: new THREE.PerspectiveCamera() });
  const actor = system.ensure(player, true, weapon);
  const state = applyEquipmentAppearance(actor, weapon);
  const game = { player, weapon, enemies: [], status: 'playing', combatStats: { speed: 5, attackDuration: .45 }, activeBuffs: [] };
  system.update(game, 0);
  return { parent, system, actor, state, game };
}

function gearMeshes(actor) {
  const result = [];
  actor.traverse(child => { if (child.isMesh && child.name.startsWith('Gear_')) result.push(child); });
  return result;
}

test('all six equipped weapons describe their distinct clothing, without renderer or state writes', () => {
  const names = EQUIPMENT.map(item => equipmentAppearanceName(item));
  assert.deepEqual(names, ['余烬战衣', '烬王重铠', '逐雷轻装', '风暴护甲', '潮汐法袍', '深潮礼装']);
  assert.equal(new Set(names).size, 6);
  assert.equal(equipmentAppearanceName('water-scepter'), '深潮礼装');
  assert.equal(equipmentAppearanceName(null), '');
  assert.equal(equipmentAppearanceName({ id: 'missing' }), '');
});

for (const weapon of EQUIPMENT.filter(item => item.tier === 2)) {
  test(`${weapon.id}: real rounded rig has visible shoulders, bracers and bone-mounted headwear`, () => {
    const { actor, state, system } = fixture(weapon);
    try {
      assert.equal(state.weaponId, weapon.id);
      assert.equal(state.name, equipmentAppearanceName(weapon));
      assert.equal(state.attachments.length, 6);
      assert.deepEqual(state.attachments.map(mount => mount.parent.name).sort(),
        ['chest', 'head', 'lowerarml', 'lowerarmr', 'upperarml', 'upperarmr']);
      assert(state.attachments.every(mount => mount.parent.isBone));
      const meshes = gearMeshes(actor);
      assert(meshes.length >= 20, 'the appearance must contain real armor geometry, not an FX label');
      for (const mesh of meshes) {
        assert.equal(mesh.visible, true);
        assert.equal(mesh.material.isMeshStandardMaterial, true);
        assert(mesh.geometry.getAttribute('position').count > 100);
        assert(mesh.position.toArray().every(Number.isFinite));
        assert(mesh.scale.toArray().every(value => Number.isFinite(value) && value > 0));
        assert.equal(mesh.userData.equipmentAppearance, weapon.id);
      }
      assert.notEqual(state.materials.size, 0);
      assert(state.materials.size <= 4);
      assert.equal(applyEquipmentAppearance(actor, weapon), state, 'rendering the same gear cannot duplicate it');
      assert.equal(gearMeshes(actor).length, meshes.length);
    } finally { disposeEquipmentAppearance(actor); system.clear(); }
  });

  test(`${weapon.id}: armor positions are bounded and do not obstruct the face or weapon hand`, () => {
    const { actor, state, system } = fixture(weapon);
    try {
      // These coordinates are in the actual GLB model, before the actor's scale.
      actor.updateMatrixWorld(true);
      const inverseModel = actor.userData.model.matrixWorld.clone().invert();
      const face = new THREE.Box3(new THREE.Vector3(-.31, 1.4, .32), new THREE.Vector3(.31, 1.93, .69));
      for (const mesh of gearMeshes(actor)) {
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(inverseModel);
        assert([...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite));
        assert(box.min.x >= -.92 && box.max.x <= .92);
        assert(box.min.y > .35 && box.max.y < 3.1);
        assert(box.min.z > -.8 && box.max.z < .8);
        assert.equal(box.intersectsBox(face), false, `${mesh.name} covers the face`);
      }
      for (const mount of state.attachments.filter(item => item.name.includes('Bracer'))) {
        for (const mesh of mount.children) {
          mesh.geometry.computeBoundingBox();
          const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix);
          assert(box.max.y < .26, `${mesh.name} must stop before the wrist and weapon hand`);
        }
      }
    } finally { disposeEquipmentAppearance(actor); system.clear(); }
  });

  test(`${weapon.id}: equipped armor follows the actual animated arm without moving independently`, () => {
    const { actor, state, system, game } = fixture(weapon);
    try {
      system.update(game, 1 / 60);
      actor.updateMatrixWorld(true);
      const bracer = state.attachments.find(item => item.name === 'GearMount_Bracer_r');
      const shoulder = state.attachments.find(item => item.name === 'GearMount_Shoulder_r');
      const mesh = bracer.children[0];
      const localPosition = mesh.position.clone();
      const before = mesh.getWorldPosition(new THREE.Vector3());
      system.event({ type: 'attack', element: weapon.element, weaponId: weapon.id, duration: .5, combo: 0 });
      for (let frame = 0; frame < 12; frame++) system.update(game, 1 / 60);
      actor.updateMatrixWorld(true);
      const after = mesh.getWorldPosition(new THREE.Vector3());
      assert(before.distanceTo(after) > .035, 'authored attack should move the bracer with the arm');
      assert(mesh.position.equals(localPosition));
      assert.equal(bracer.parent, actor.userData.model.getObjectByName('lowerarmr'));
      assert.equal(shoulder.parent, actor.userData.model.getObjectByName('upperarmr'));
      assert(bracer.matrixWorld.equals(bracer.parent.matrixWorld), 'mount must inherit the complete animated bone transform');
    } finally { disposeEquipmentAppearance(actor); system.clear(); }
  });
}

test('returning to starter attire disposes each local resource once and leaves shipped GLB resources intact', () => {
  const { actor, state, system } = fixture(equipmentById('fire-greatsword'));
  try {
    const originalGeometries = new Set(), originalMaterials = new Set();
    for (const model of Object.values(models)) model.traverse(child => {
      if (!child.isMesh) return;
      originalGeometries.add(child.geometry);
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) originalMaterials.add(material);
    });
    let originalDisposed = 0, geometryDisposed = 0, materialDisposed = 0;
    for (const geometry of originalGeometries) geometry.addEventListener('dispose', () => { originalDisposed++; });
    for (const material of originalMaterials) material.addEventListener('dispose', () => { originalDisposed++; });
    const counts = { geometry: state.geometries.size, material: state.materials.size };
    const mounts = state.attachments.slice();
    for (const geometry of state.geometries) {
      assert.equal(originalGeometries.has(geometry), false);
      geometry.addEventListener('dispose', () => { geometryDisposed++; });
    }
    for (const material of state.materials) {
      assert.equal(originalMaterials.has(material), false);
      material.addEventListener('dispose', () => { materialDisposed++; });
    }
    assert.equal(applyEquipmentAppearance(actor, equipmentById('fire-sword')), null);
    assert.equal(actor.userData.equipmentAppearance, undefined);
    assert.equal(gearMeshes(actor).length, 0);
    assert(mounts.every(mount => mount.parent === null));
    assert.equal(geometryDisposed, counts.geometry);
    assert.equal(materialDisposed, counts.material);
    assert.equal(originalDisposed, 0);
    disposeEquipmentAppearance(actor);
    assert.equal(geometryDisposed, counts.geometry);
    assert.equal(materialDisposed, counts.material);
  } finally { disposeEquipmentAppearance(actor); system.clear(); }
});

test('two actors have independent gear and repeated six-weapon switches leave no previous outfit behind', () => {
  const first = fixture(equipmentById('water-scepter'));
  const second = fixture(equipmentById('water-scepter'));
  try {
    const originalSecondCount = gearMeshes(second.actor).length;
    for (const geometry of first.state.geometries) assert.equal(second.state.geometries.has(geometry), false);
    for (const material of first.state.materials) assert.equal(second.state.materials.has(material), false);
    for (let loop = 0; loop < 3; loop++) {
      for (const weapon of EQUIPMENT) {
        // The actual rig is replaced by ActorSystem when profession changes;
        // module-local switching here also verifies ownership independent of that.
        const state = applyEquipmentAppearance(first.actor, weapon);
        const meshes = gearMeshes(first.actor);
        if (weapon.starter) { assert.equal(state, null); assert.equal(meshes.length, 0); }
        else {
          assert.equal(state.weaponId, weapon.id);
          assert(meshes.length >= 20);
          assert(meshes.every(mesh => mesh.userData.equipmentAppearance === weapon.id));
        }
        assert.equal(gearMeshes(second.actor).length, originalSecondCount);
      }
    }
    assert.equal(second.actor.userData.equipmentAppearance, second.state);
  } finally {
    disposeEquipmentAppearance(first.actor); disposeEquipmentAppearance(second.actor);
    first.system.clear(); second.system.clear();
  }
});

test('three starters retain their original rounded attire without extra armor', () => {
  for (const weapon of EQUIPMENT.filter(item => item.starter)) {
    const { actor, system } = fixture(weapon);
    try {
      assert.equal(actor.userData.equipmentAppearance, undefined);
      assert.equal(gearMeshes(actor).length, 0);
      assert.equal(applyEquipmentAppearance(actor, weapon), null);
    } finally { system.clear(); }
  }
});

for (const id of ['lightning-spear', 'lightning-halberd']) {
  test(`${id}: charcoal hood and cloth preserve every skin, leather and black vertex color`, () => {
    const { actor, system } = fixture(equipmentById(id));
    try {
      const clothing = actor.userData.equipmentClothing;
      assert.equal(clothing.weaponId, id);
      assert.deepEqual(clothing.changes.map(change => change.mesh.name),
        ['Rogue_Head_Hooded', 'Rogue_Body', 'Rogue_ArmLeft', 'Rogue_ArmRight', 'Rogue_Cape']);
      let preservedWarmVertices = 0, changedClothVertices = 0;
      for (const { mesh, original, geometry, changedVertices } of clothing.changes) {
        assert.equal(mesh.geometry, geometry);
        assert.notEqual(geometry, original);
        assert.equal(original, models.Rogue_Hooded.getObjectByName(mesh.name).geometry);
        const before = original.getAttribute('color'), after = geometry.getAttribute('color');
        assert.notEqual(before, after);
        let changed = 0;
        for (let i = 0; i < before.count; i++) {
          const originalRgb = [before.getX(i), before.getY(i), before.getZ(i)];
          const rgb = [after.getX(i), after.getY(i), after.getZ(i)];
          const cloth = originalRgb[0] < .01 && originalRgb[1] > .05 && originalRgb[1] > originalRgb[2] * 1.1;
          if (cloth) {
            changed++; changedClothVertices++;
            assert(rgb[2] > rgb[1] && rgb[1] > rgb[0], 'cloth must have a blue-gray hue, not green');
            assert(rgb[1] < originalRgb[1], 'charcoal fabric must be darker than the original hood');
          } else {
            assert.deepEqual(rgb, originalRgb, `${mesh.name} vertex ${i} is not cloth`);
            if (originalRgb[0] > .2) preservedWarmVertices++;
          }
          if (before.itemSize === 4) assert.equal(after.getW(i), before.getW(i));
        }
        assert.equal(changed, changedVertices);
        for (const name of Object.keys(original.attributes).filter(name => name !== 'color')) {
          assert.deepEqual(geometry.attributes[name].array, original.attributes[name].array,
            `clothing tint must preserve ${mesh.name} ${name}, including skinning and UVs`);
        }
        if (original.index) assert.deepEqual(geometry.index.array, original.index.array);
      }
      assert(changedClothVertices > 6000);
      assert(preservedWarmVertices > 5000, 'the combined face, hands and leather retain their authored colors');
      for (const name of ['Rogue_LegLeft', 'Rogue_LegRight']) {
        assert.equal(actor.userData.model.getObjectByName(name).geometry,
          models.Rogue_Hooded.getObjectByName(name).geometry, 'boots and legs do not need a recolored clone');
      }
      const changes = clothing.changes.slice();
      const state = actor.userData.equipmentAppearance;
      assert.equal(applyEquipmentAppearance(actor, equipmentById(id)), state || null);
      assert.equal(actor.userData.equipmentClothing, clothing, 'same selection must not repeatedly clone clothing');
      assert.deepEqual(clothing.changes, changes);
    } finally { disposeEquipmentAppearance(actor); system.clear(); }
  });
}

test('basic and upgraded rogue clothes have the same charcoal palette', () => {
  const first = fixture(equipmentById('lightning-spear'));
  const second = fixture(equipmentById('lightning-halberd'));
  try {
    for (let i = 0; i < first.actor.userData.equipmentClothing.changes.length; i++) {
      const a = first.actor.userData.equipmentClothing.changes[i];
      const b = second.actor.userData.equipmentClothing.changes[i];
      assert.notEqual(a.geometry, b.geometry);
      assert.deepEqual(a.geometry.getAttribute('color').array, b.geometry.getAttribute('color').array);
    }
  } finally {
    disposeEquipmentAppearance(first.actor); disposeEquipmentAppearance(second.actor);
    first.system.clear(); second.system.clear();
  }
});

test('removing rogue clothing releases only its private copies and restores original shared geometry', () => {
  const { actor, system } = fixture(equipmentById('lightning-spear'));
  try {
    const clothing = actor.userData.equipmentClothing;
    const changes = clothing.changes.slice();
    let localDisposes = 0, sourceDisposes = 0;
    for (const { geometry, original } of changes) {
      geometry.addEventListener('dispose', () => { localDisposes++; });
      original.addEventListener('dispose', () => { sourceDisposes++; });
    }
    disposeEquipmentAppearance(actor);
    assert.equal(actor.userData.equipmentClothing, undefined);
    assert.equal(localDisposes, 5);
    assert.equal(sourceDisposes, 0);
    for (const { mesh, original } of changes) assert.equal(mesh.geometry, original);
    disposeEquipmentAppearance(actor);
    assert.equal(localDisposes, 5);
    applyEquipmentAppearance(actor, equipmentById('lightning-spear'));
    assert.equal(actor.userData.equipmentClothing.changes.length, 5);
    for (const { geometry, original } of actor.userData.equipmentClothing.changes) {
      assert.notEqual(geometry, original);
      assert.equal(changes.find(change => change.original === original).geometry === geometry, false);
    }
  } finally { disposeEquipmentAppearance(actor); system.clear(); }
});
