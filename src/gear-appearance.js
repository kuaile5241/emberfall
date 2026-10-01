import * as THREE from 'three';

const APPEARANCES = Object.freeze({
  'fire-sword': Object.freeze({ name: '余烬战衣', element: 'fire', tier: 1 }),
  'fire-greatsword': Object.freeze({ name: '烬王重铠', element: 'fire', tier: 2 }),
  'lightning-spear': Object.freeze({ name: '逐雷轻装', element: 'lightning', tier: 1 }),
  'lightning-halberd': Object.freeze({ name: '风暴护甲', element: 'lightning', tier: 2 }),
  'water-staff': Object.freeze({ name: '潮汐法袍', element: 'water', tier: 1 }),
  'water-scepter': Object.freeze({ name: '深潮礼装', element: 'water', tier: 2 }),
});

const PALETTES = Object.freeze({
  fire: { armor: 0x41404a, cloth: 0x282632, trim: 0xb99567, gem: 0xef9655 },
  lightning: { armor: 0x353c50, cloth: 0x242a3b, trim: 0xa1b2ce, gem: 0xb6dcff },
  water: { armor: 0x3a3852, cloth: 0x292639, trim: 0xafa5d0, gem: 0x95c8eb },
});

// The v6 rogue stores hood/skin/leather together as painted vertex colors.
// Only these five meshes contain its original green cloth; their warm skin and
// leather colors have R > .2, while the cloth palette has R < .003. Keep that
// separation instead of multiplying the shared material and darkening faces.
const ROGUE_CLOTH_MESHES = Object.freeze([
  'Rogue_Head_Hooded', 'Rogue_Body', 'Rogue_ArmLeft', 'Rogue_ArmRight', 'Rogue_Cape',
]);
const ROGUE_CLOTH_COLOR = new THREE.Color(0x3b4557);
const isRogueClothColor = (r, g, b) => r < .01 && g > .05 && g > b * 1.1;

function applyRogueCloth(actor, weapon) {
  if (actor.userData.kind !== 'Rogue_Hooded') return;
  const changes = [];
  for (const name of ROGUE_CLOTH_MESHES) {
    const mesh = actor.userData.model.getObjectByName(name);
    const original = mesh?.geometry;
    const originalColors = original?.getAttribute('color');
    if (!originalColors) continue;
    const geometry = original.clone();
    const colors = geometry.getAttribute('color');
    let changedVertices = 0;
    for (let i = 0; i < colors.count; i++) {
      const r = originalColors.getX(i), g = originalColors.getY(i), b = originalColors.getZ(i);
      if (!isRogueClothColor(r, g, b)) continue;
      const shade = THREE.MathUtils.clamp(g / .27, .45, 1.4);
      colors.setXYZ(i, ROGUE_CLOTH_COLOR.r * shade, ROGUE_CLOTH_COLOR.g * shade, ROGUE_CLOTH_COLOR.b * shade);
      changedVertices++;
    }
    if (!changedVertices) { geometry.dispose(); continue; }
    colors.needsUpdate = true;
    mesh.geometry = geometry;
    changes.push({ mesh, original, geometry, changedVertices });
  }
  actor.userData.equipmentClothing = { weaponId: weapon.id, changes };
}

function disposeClothing(actor) {
  const clothing = actor?.userData?.equipmentClothing;
  if (!clothing) return;
  for (const { mesh, original, geometry } of clothing.changes) {
    if (mesh.geometry === geometry) mesh.geometry = original;
    geometry.dispose();
  }
  clothing.changes.length = 0;
  delete actor.userData.equipmentClothing;
}

/** Pure display metadata; the base looks use the original rounded character meshes. */
export function equipmentAppearanceName(weapon) {
  return APPEARANCES[typeof weapon === 'string' ? weapon : weapon?.id]?.name || '';
}

function createMaterials(palette, state) {
  const make = (color, metalness, roughness, emissiveIntensity = 0) => {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness,
      emissive: emissiveIntensity ? color : 0x000000, emissiveIntensity });
    state.materials.add(material);
    return material;
  };
  return {
    armor: make(palette.armor, .55, .38), cloth: make(palette.cloth, .06, .76),
    trim: make(palette.trim, .67, .34), gem: make(palette.gem, .28, .24, .08),
  };
}

function addMesh(parent, state, name, geometry, material, position, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Gear_${name}`;
  mesh.position.fromArray(position);
  mesh.scale.fromArray(scale);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.equipmentAppearance = state.weaponId;
  state.geometries.add(geometry);
  parent.add(mesh);
  return mesh;
}

function orb(parent, state, name, material, position, scale) {
  return addMesh(parent, state, name, new THREE.SphereGeometry(1, 20, 12), material, position, scale);
}

function band(parent, state, name, material, position, radius, thickness) {
  const mesh = addMesh(parent, state, name, new THREE.TorusGeometry(radius, thickness, 8, 28), material, position);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function onBone(model, state, name, part) {
  const bone = model.getObjectByName(name);
  if (!bone?.isBone) return null;
  const group = new THREE.Group();
  group.name = `GearMount_${part}`;
  group.userData.equipmentAppearance = state.weaponId;
  group.userData.attachmentBone = bone.name;
  bone.add(group);
  state.attachments.push(group);
  return group;
}

function shoulders(model, state, materials, element) {
  for (const side of ['l', 'r']) {
    // In the shipped KayKit rigs local Y points down the arm, local Z points up.
    // Keeping the cap outside the shoulder pivot avoids the large chibi head.
    const shoulder = onBone(model, state, `upperarm${side}`, `Shoulder_${side}`);
    const front = side === 'l' ? 1 : -1;
    if (shoulder) {
      if (element === 'fire') {
        orb(shoulder, state, `HeavyPauldronTrim_${side}`, materials.trim, [0, .21, .035], [.205, .225, .145]);
        orb(shoulder, state, `HeavyPauldron_${side}`, materials.armor, [0, .21, .06], [.196, .211, .14]);
        orb(shoulder, state, `EmberRivet_${side}`, materials.gem, [front * .184, .20, .09], [.028, .065, .04]);
      } else if (element === 'lightning') {
        orb(shoulder, state, `StormPauldronTrim_${side}`, materials.trim, [0, .19, .035], [.167, .181, .10]);
        orb(shoulder, state, `StormPauldron_${side}`, materials.armor, [0, .19, .052], [.163, .17, .097]);
        orb(shoulder, state, `StormMark_${side}`, materials.gem, [front * .158, .20, .06], [.019, .08, .032]);
      } else {
        orb(shoulder, state, `TideShoulderMantle_${side}`, materials.cloth, [0, .18, .03], [.178, .20, .11]);
        orb(shoulder, state, `TideMantleRim_${side}`, materials.trim, [0, .24, .025], [.184, .073, .116]);
        orb(shoulder, state, `TideShoulderPearl_${side}`, materials.gem, [front * .172, .20, .06], [.026, .045, .037]);
      }
    }
    const wrist = onBone(model, state, `lowerarm${side}`, `Bracer_${side}`);
    if (wrist) {
      const cuff = addMesh(wrist, state, `Bracer_${side}`, new THREE.CylinderGeometry(.15, .157, element === 'fire' ? .17 : .12, 20), materials.armor, [0, .155, 0]);
      cuff.userData.appearancePart = 'bracer';
      band(wrist, state, `BracerEdge_${side}`, materials.trim, [0, .215, 0], .15, .014);
      orb(wrist, state, `BracerGem_${side}`, materials.gem, [front * .148, .155, .016], [.025, .04, .042]);
    }
  }
}

function fireRegalia(model, state, materials) {
  const chest = onBone(model, state, 'chest', 'Cuirass');
  if (chest) {
    orb(chest, state, 'CuirassTrim', materials.trim, [0, .015, .374], [.247, .207, .079]);
    orb(chest, state, 'Cuirass', materials.armor, [0, .022, .387], [.234, .194, .077]);
    orb(chest, state, 'CuirassEmber', materials.gem, [0, .06, .459], [.053, .089, .025]);
  }
  const head = onBone(model, state, 'head', 'HelmetCrest');
  if (head) {
    // The base helmet ends at model Y=2.552. The crest begins above that shell.
    orb(head, state, 'CrestBase', materials.trim, [0, 1.30, -.035], [.18, .046, .19]);
    for (const [index, x, height] of [[0, -.12, .15], [1, 0, .22], [2, .12, .15]]) {
      orb(head, state, `EmberCrest_${index}`, materials.armor, [x, 1.32 + height * .48, -.035], [.06, height, .073]);
      orb(head, state, `CrestInlay_${index}`, materials.gem, [x, 1.32 + height * .48, .031], [.026, height * .65, .017]);
    }
  }
}

function lightningRegalia(model, state, materials) {
  const chest = onBone(model, state, 'chest', 'StormHarness');
  if (chest) {
    const sash = orb(chest, state, 'StormSash', materials.armor, [0, -.018, .354], [.27, .063, .058]);
    sash.rotation.z = -.58;
    orb(chest, state, 'StormClasp', materials.trim, [.11, .053, .405], [.065, .074, .028]);
    orb(chest, state, 'StormClaspGem', materials.gem, [.11, .053, .428], [.032, .042, .017]);
  }
  const head = onBone(model, state, 'head', 'HoodCrest');
  if (head) {
    // The hood ends at model Y=2.296, leaving the face and hood opening clear.
    orb(head, state, 'HoodCrestBase', materials.armor, [0, 1.063, -.018], [.19, .046, .11]);
    for (const [index, x] of [[0, -.115], [1, .115]]) {
      const fin = orb(head, state, `StormCrest_${index}`, materials.trim, [x, 1.148, -.015], [.049, .14, .056]);
      fin.rotation.z = x < 0 ? -.25 : .25;
      orb(head, state, `StormCrestInlay_${index}`, materials.gem, [x, 1.15, .034], [.026, .096, .012]);
    }
  }
}

function waterRegalia(model, state, materials) {
  const chest = onBone(model, state, 'chest', 'TideCollar');
  if (chest) {
    // Two soft outer collar petals sit below the chin; no closed ring over the face.
    for (const side of [-1, 1]) {
      const petal = orb(chest, state, `TideCollar_${side}`, materials.cloth, [side * .23, .055, .315], [.105, .19, .09]);
      petal.rotation.z = -side * .36;
      orb(chest, state, `TideCollarTrim_${side}`, materials.trim, [side * .23, .018, .396], [.032, .145, .018]);
    }
    orb(chest, state, 'TideBroochRim', materials.trim, [0, .035, .396], [.071, .094, .031]);
    orb(chest, state, 'TideBrooch', materials.gem, [0, .035, .422], [.046, .065, .023]);
  }
  const head = onBone(model, state, 'head', 'HatCrown');
  if (head) {
    // The original hat brim is Y=1.89–2.05. Jewelry surrounds its narrower crown.
    band(head, state, 'TideHatCirclet', materials.trim, [0, .968, -.025], .523, .031);
    for (const [index, x, height] of [[0, -.29, .105], [1, 0, .16], [2, .29, .105]]) {
      const z = Math.sqrt(.523 ** 2 - x ** 2) - .025;
      orb(head, state, `TideCrownProng_${index}`, materials.trim, [x, 1.035, z], [.045, height, .038]);
      orb(head, state, `TideCrownPearl_${index}`, materials.gem, [x, 1.035 + height, z], [.051, .069, .041]);
    }
  }
}

/** Release only geometry/materials created by this module; shipped GLB data remain shared. */
export function disposeEquipmentAppearance(actor) {
  disposeClothing(actor);
  const state = actor?.userData?.equipmentAppearance;
  if (!state) return;
  for (const mount of state.attachments) mount.removeFromParent();
  for (const geometry of state.geometries) geometry.dispose();
  for (const material of state.materials) material.dispose();
  state.attachments.length = 0; state.geometries.clear(); state.materials.clear();
  delete actor.userData.equipmentAppearance;
}

/** Both camp and combat use this bone-mounted, actor-local equipment appearance. */
export function applyEquipmentAppearance(actor, weapon) {
  const definition = APPEARANCES[weapon?.id];
  const model = actor?.userData?.model;
  if (!model) return null;
  if (actor.userData.equipmentAppearance?.weaponId === weapon?.id) return actor.userData.equipmentAppearance;
  if (actor.userData.equipmentClothing?.weaponId === weapon?.id) return null;
  disposeEquipmentAppearance(actor);
  if (definition) applyRogueCloth(actor, weapon);
  if (!definition || definition.tier !== 2) return null;
  const state = { weaponId: weapon.id, name: definition.name, element: definition.element,
    tier: definition.tier, attachments: [], geometries: new Set(), materials: new Set() };
  actor.userData.equipmentAppearance = state;
  const materials = createMaterials(PALETTES[definition.element], state);
  shoulders(model, state, materials, definition.element);
  if (definition.element === 'fire') fireRegalia(model, state, materials);
  else if (definition.element === 'lightning') lightningRegalia(model, state, materials);
  else waterRegalia(model, state, materials);
  return state;
}
