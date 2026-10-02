import * as THREE from 'three';
import { applyEquipmentAppearance as applyBase, disposeEquipmentAppearance as disposeBase } from './gear-appearance.js';
import { normalizeBuildLoadout, buildGearById } from './builds.js';

const PALETTES = {
  'ash-mantle': { cloth: 0x493343, trim: 0xc4a173, gem: 0xf1a466 },
  'glacier-robes': { cloth: 0x465775, trim: 0xd7ddeb, gem: 0x9bddff },
  'storm-vest': { cloth: 0x302e4b, trim: 0xb9afdb, gem: 0xc7dcff },
};

/** Weapon, armor and relic each belong to the actor, never to shared GLB data. */
export function applyEquipmentAppearance(actor, weapon, value) {
  if (actor?.userData?.buildAppearance) disposeEquipmentAppearance(actor);
  applyBase(actor, weapon);
  const loadout = normalizeBuildLoadout(value), model = actor?.userData?.model;
  if (!model || (!loadout.armorId && !loadout.relicId)) return actor?.userData?.equipmentAppearance ?? null;
  const state = { armorId: loadout.armorId, relicId: loadout.relicId, attachments: [], geometries: new Set(), materials: new Set() };
  actor.userData.buildAppearance = state;
  const palette = PALETTES[loadout.armorId] || { cloth: 0x3c374e, trim: 0xb9ac8a, gem: 0xc6d9ed };
  const makeMaterial = (color, metalness = .2) => {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness: .56 }); state.materials.add(material); return material;
  };
  const cloth = makeMaterial(palette.cloth), trim = makeMaterial(palette.trim, .6), gem = makeMaterial(palette.gem, .35);
  const mount = (boneName, name) => {
    const bone = model.getObjectByName(boneName); if (!bone?.isBone) return null;
    const group = new THREE.Group(); group.name = `BuildMount_${name}`; group.userData.attachmentBone = boneName;
    bone.add(group); state.attachments.push(group); return group;
  };
  const add = (parent, geometry, material, name, xyz, scale = [1, 1, 1]) => {
    if (!parent) { geometry.dispose(); return null; }
    state.geometries.add(geometry); const object = new THREE.Mesh(geometry, material);
    object.name = `Build_${name}`; object.position.fromArray(xyz); object.scale.fromArray(scale);
    object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  };
  if (loadout.armorId) {
    for (const side of ['l', 'r']) {
      const shoulder = mount(`upperarm${side}`, `Shoulder_${side}`);
      const heavy = loadout.armorId === 'ash-mantle';
      add(shoulder, new THREE.SphereGeometry(1, 16, 10), cloth, `ArmorShoulder_${side}`, [0, .19, -.015], [heavy ? .22 : .18, .22, .15]);
      add(shoulder, new THREE.TorusGeometry(.18, .018, 6, 24), trim, `ArmorTrim_${side}`, [0, .23, .04], [1, .8, 1]);
      if (loadout.armorId === 'glacier-robes') add(shoulder, new THREE.OctahedronGeometry(.09), gem, `IceGem_${side}`, [side === 'l' ? .18 : -.18, .21, .05]);
    }
    const chest = mount('chest', 'Armor');
    if (loadout.armorId === 'ash-mantle') {
      const cape = add(chest, new THREE.SphereGeometry(1, 20, 12), cloth, 'EmberMantle', [0, -.19, -.27], [.37, .52, .1]);
      if (cape) cape.rotation.x = -.1;
      add(chest, new THREE.SphereGeometry(1, 16, 10), trim, 'MantleClasp', [0, .05, .4], [.08, .07, .035]);
    } else if (loadout.armorId === 'glacier-robes') {
      add(chest, new THREE.SphereGeometry(1, 20, 12), cloth, 'IceTabard', [0, -.19, .35], [.245, .37, .05]);
      add(chest, new THREE.OctahedronGeometry(.11), gem, 'GlacierBrooch', [0, .08, .405], [.8, 1.2, .45]);
    } else {
      const band = add(chest, new THREE.SphereGeometry(1, 16, 10), cloth, 'StormHarness', [0, -.02, .37], [.27, .1, .06]);
      if (band) band.rotation.z = .55;
      for (const side of [-1, 1]) add(chest, new THREE.OctahedronGeometry(.06), gem, `StormStud_${side}`, [side * .19, .04, .405]);
    }
  }
  if (loadout.relicId) {
    const relic = buildGearById(loadout.relicId), chest = mount('chest', 'Relic');
    const color = relic.element === 'fire' ? 0xeaaa70 : relic.element === 'water' ? 0xa7d7f4 : 0xd0c8f4;
    const material = makeMaterial(color, .55); material.emissive.setHex(color); material.emissiveIntensity = .15;
    add(chest, new THREE.OctahedronGeometry(.085), material, 'RelicSeal', [.23, -.15, .4], [1, 1.2, .55]);
  }
  return state;
}

export function disposeEquipmentAppearance(actor) {
  const state = actor?.userData?.buildAppearance;
  if (state) {
    for (const attachment of state.attachments) attachment.removeFromParent();
    for (const geometry of state.geometries) geometry.dispose(); for (const material of state.materials) material.dispose();
    state.attachments.length = 0; state.geometries.clear(); state.materials.clear(); delete actor.userData.buildAppearance;
  }
  disposeBase(actor);
}
