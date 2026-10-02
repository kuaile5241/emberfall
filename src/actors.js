import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { applyEquipmentAppearance, disposeEquipmentAppearance } from './equipment-appearance.js';
import { normalizeBuildLoadout } from './builds.js';

export const ACTOR_ASSETS = Object.freeze({
  Knight: '/assets/models-v6/Knight.glb',
  Rogue_Hooded: '/assets/models-v6/Rogue_Hooded.glb',
  Mage: '/assets/models-v6/Mage.glb',
  Skeleton_Warrior: '/assets/vendor/kaykit/Skeleton_Warrior.glb',
  Skeleton_Mage: '/assets/vendor/kaykit/Skeleton_Mage.glb',
  Skeleton_Blade: '/assets/vendor/kaykit/Skeleton_Blade.glb',
  Skeleton_Axe: '/assets/vendor/kaykit/Skeleton_Axe.glb',
  Skeleton_Staff: '/assets/vendor/kaykit/Skeleton_Staff.glb',
  Skeleton_Shield_Large_A: '/assets/vendor/kaykit/Skeleton_Shield_Large_A.glb',
  Fire_Sword: '/assets/models-v3/Fire_Sword.glb',
  Lightning_Spear: '/assets/models-v3/Lightning_Spear.glb',
  Water_Staff: '/assets/models-v3/Water_Staff.glb',
});

const COLORS = { fire: 0xf09850, lightning: 0x9de5ff, water: 0x70dacf };
const PRIORITY = { hit: 10, attack: 20, windup: 25, skill: 40, dash: 60, death: 100 };
const clamp = THREE.MathUtils.clamp;
const smooth = (value, target, rate, dt) => THREE.MathUtils.lerp(value, target, 1 - Math.exp(-rate * dt));
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const normalizeName = name => name.replace(/[\s.:[\]/]/g, '').toLowerCase();
const upperBone = name => /^(spine|chest|head|upperarm|lowerarm|wrist|hand|elbow)/i.test(normalizeName(name));
const nodeFromTrack = name => name.slice(0, name.lastIndexOf('.'));
const bodyPrefixes = { Knight: 'Knight_', Rogue_Hooded: 'Rogue_', Mage: 'Mage_', Skeleton_Warrior: 'Skeleton_Warrior_', Skeleton_Mage: 'Skeleton_Mage_' };

function mesh(geometry, material) { return new THREE.Mesh(geometry, material); }
function prepareClip(source, part) {
  const tracks = source.tracks.filter(track => upperBone(nodeFromTrack(track.name)) === (part === 'upper')).map(track => {
    const result = track.clone();
    if (normalizeName(nodeFromTrack(result.name)) === 'root' && result.name.endsWith('.position')) {
      for (let i = 0; i < result.values.length; i += 3) { result.values[i] = 0; result.values[i + 2] = 0; }
    }
    return result;
  });
  return new THREE.AnimationClip(`${source.name}:${part}`, source.duration, tracks);
}

/** Actor-only rendering: no simulation writes, shared asset mutation, or FX ownership. */
export class ActorSystem {
  constructor({ models, clips, parent, camera }) {
    this.models = models;
    this.clips = clips;
    this.parent = parent;
    this.camera = camera;
    this.actors = new Map();
    this.prepared = new Map();
    this.pendingEvents = [];
    this.time = 0;
    this.token = 0;
    this.game = null;
  }

  _kind(entity, isPlayer, weapon) {
    if (!isPlayer) return entity.type === 'ranged' ? 'Skeleton_Mage' : 'Skeleton_Warrior';
    if (weapon?.element === 'water' && this.models.Mage) return 'Mage';
    if (weapon?.element === 'lightning' && this.models.Rogue_Hooded) return 'Rogue_Hooded';
    return 'Knight';
  }

  _clip(kind, name, part) {
    const key = `${kind}:${name}:${part}`;
    if (this.prepared.has(key)) return this.prepared.get(key);
    const sources = this.clips[kind] || [];
    const source = sources.find(clip => clip.name === name) || sources.find(clip => clip.name === 'Idle') || sources[0];
    if (!source) return null;
    const clip = prepareClip(source, part);
    this.prepared.set(key, clip);
    return clip;
  }

  _pair(root, source, bank = 'base') {
    const u = root.userData;
    const key = `${bank}:${source}`;
    if (u.pairs.has(key)) return u.pairs.get(key);
    const result = {};
    for (const part of ['upper', 'lower']) {
      const prepared = this._clip(u.kind, source, part);
      if (!prepared || !prepared.tracks.length) continue;
      // Track data are immutable; only the clip identity is unique to each lane.
      const clip = new THREE.AnimationClip(`${key}:${part}`, prepared.duration, prepared.tracks);
      const action = u.mixer.clipAction(clip);
      action.setEffectiveWeight(0).setLoop(THREE.LoopRepeat, Infinity).play();
      result[part] = action;
    }
    u.pairs.set(key, result);
    return result;
  }

  _materials(object, u, tint = null) {
    const copies = new Map();
    object.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const clone = original => {
        if (copies.has(original)) return copies.get(original);
        const local = original.clone();
        if (tint && local.color) local.color.multiply(tint);
        if (local.roughness !== undefined) local.roughness = Math.max(.32, local.roughness);
        copies.set(original, local);
        u.materials.push({ material: local, baseEmissive: local.emissive?.clone(), baseIntensity: local.emissiveIntensity ?? 0 });
        return local;
      };
      child.material = Array.isArray(child.material) ? child.material.map(clone) : clone(child.material);
    });
  }

  _attach(root, asset, side = 'r', scale = 1) {
    const source = this.models[asset];
    if (!source) return;
    const u = root.userData;
    const hand = u.model.getObjectByName(`handslot${side}`) || u.model.getObjectByName(`handslot.${side}`);
    if (!hand) return;
    const weapon = source.clone(true);
    weapon.name = `Equipped_${asset}`;
    weapon.scale.setScalar(scale);
    this._materials(weapon, u);
    hand.add(weapon);
    u.equipped.push(weapon);
  }

  ensure(entity, isPlayer = false, weapon = null, buildLoadout = this.game?.buildLoadout) {
    const id = isPlayer ? 'player' : entity.id;
    const kind = this._kind(entity, isPlayer, weapon);
    const loadout = normalizeBuildLoadout(buildLoadout);
    const equipmentKey = isPlayer ? weapon?.id || 'fire-sword' : entity.type;
    const appearanceKey = isPlayer ? `${equipmentKey}:${loadout.armorId || ''}:${loadout.relicId || ''}` : equipmentKey;
    let root = this.actors.get(id);
    if (root && root.userData.kind === kind && root.userData.appearanceKey === appearanceKey) return root;
    if (root) this._dispose(root);
    const source = this.models[kind];
    if (!source) return null;
    root = new THREE.Group();
    root.name = `Actor_${id}`;
    const model = cloneSkeleton(source);
    const scale = isPlayer ? kind === 'Rogue_Hooded' ? 1.04 : kind === 'Mage' ? .86 : .93 : entity.type === 'boss' ? 1.43 : entity.type === 'brute' ? 1.12 : entity.fodder ? .72 : .9;
    model.scale.setScalar(scale);
    const element = weapon?.element || (entity.type === 'ranged' ? 'water' : 'fire');
    const u = root.userData = {
      kind, id, isPlayer, model, scale, equipmentKey, appearanceKey, element, fodder: !!entity.fodder,
      mixer: new THREE.AnimationMixer(model), pairs: new Map(), materials: [], equipped: [], generated: [],
      lastX: entity.x, lastZ: entity.z, velocityX: 0, velocityZ: 0, speed: 0, moveAmount: 0,
      facing: entity.facing || 0, lean: 0, upperWeight: 0, lowerWeight: 0,
      overlay: null, outgoing: null, bank: 0, dead: false, deathAge: 0, hitTime: 0, combo: 0,
      baseWeights: new Map(), animation: { state: 'idle', clip: 'Idle', normalizedTime: 0 },
    };
    const prefix = bodyPrefixes[kind];
    model.traverse(child => {
      if (child.isMesh) child.visible = child.name.startsWith(prefix);
    });
    this._materials(model, u, isPlayer ? null : new THREE.Color(0xb2afa7));
    if (isPlayer) {
      if (element === 'water') this._attach(root, this.models.Water_Staff ? 'Water_Staff' : 'Skeleton_Staff', 'r', weapon?.id?.includes('scepter') ? .87 : 1);
      else if (element === 'lightning') this._attach(root, this.models.Lightning_Spear ? 'Lightning_Spear' : 'Skeleton_Staff', 'r', weapon?.id?.includes('halberd') ? 1.14 : 1);
      else {
        this._attach(root, this.models.Fire_Sword ? 'Fire_Sword' : 'Skeleton_Blade', 'r', weapon?.id?.includes('greatsword') ? 1.28 : 1);
        const shield = model.getObjectByName('Badge_Shield');
        if (shield) shield.visible = !weapon?.id?.includes('greatsword');
      }
      applyEquipmentAppearance(root, weapon, loadout);
    } else {
      this._attach(root, entity.type === 'ranged' ? 'Skeleton_Staff' : ['brute', 'boss'].includes(entity.type) ? 'Skeleton_Axe' : 'Skeleton_Blade');
      if (['brute', 'boss'].includes(entity.type)) this._attach(root, 'Skeleton_Shield_Large_A', 'l');
    }
    root.add(model);
    const shadow = mesh(new THREE.CircleGeometry(entity.type === 'boss' ? 1.05 : .49, 28), new THREE.MeshBasicMaterial({ color: 0x030606, opacity: .32, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .025; root.add(shadow); u.generated.push(shadow);
    const ring = mesh(new THREE.RingGeometry(isPlayer ? .51 : .48, isPlayer ? .55 : .51, 36), new THREE.MeshBasicMaterial({ color: isPlayer ? COLORS[element] : entity.elite ? 0xdf9455 : 0x995849, transparent: true, opacity: isPlayer ? .8 : .2, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .046; root.add(ring); u.ring = ring; u.generated.push(ring);
    if (!isPlayer && entity.type !== 'boss') {
      const hp = new THREE.Group(); hp.position.y = 2.66 * scale;
      const bg = mesh(new THREE.PlaneGeometry(.9, .055), new THREE.MeshBasicMaterial({ color: 0x1a1512 }));
      const fill = mesh(new THREE.PlaneGeometry(.88, .035), new THREE.MeshBasicMaterial({ color: entity.elite ? 0xe1ac5e : 0xcb6f55 }));
      fill.position.z = .005; hp.add(bg, fill); root.add(hp); u.hp = hp; u.fill = fill; u.generated.push(bg, fill);
    }
    if (entity.type === 'boss') {
      const crown = mesh(new THREE.TorusGeometry(.34, .045, 6, 30), new THREE.MeshStandardMaterial({ color: 0xb38a44, metalness: .7, roughness: .35, emissive: 0x9d350b, emissiveIntensity: .4 }));
      crown.rotation.x = Math.PI / 2;
      const head = model.getObjectByName('head');
      if (head) { head.add(crown); crown.position.y = .41; }
      u.generated.push(crown);
    }
    root.position.set(entity.x, 0, entity.z);
    model.rotation.y = u.facing;
    this.parent.add(root);
    this.actors.set(id, root);
    // Start base loops once; frame updates only adjust weights and cadence.
    for (const name of ['Idle', '2H_Melee_Idle', 'Walking_A', 'Running_A', 'Walking_Backwards', 'Running_Strafe_Left', 'Running_Strafe_Right']) this._pair(root, name);
    this._locomotion(root, entity, 0, 0, 0);
    u.mixer.update(0);
    return root;
  }

  _overlay(root, type, clipName, duration, options = {}) {
    const u = root.userData;
    if (u.dead && type !== 'death') return false;
    const priority = PRIORITY[type] || 0;
    if (u.overlay && u.overlay.priority > priority && u.overlay.elapsed < u.overlay.duration - .045) return false;
    if (u.overlay && u.overlay.type === type && options.token && u.overlay.token === options.token) return false;
    if (u.outgoing) this._zeroPair(u.outgoing.pair);
    if (u.overlay) u.outgoing = { ...u.overlay, fade: .085, fadeMax: .085, frozenWeight: u.overlay.weight || 1 };
    const pair = this._pair(root, clipName, `overlay${u.bank = 1 - u.bank}`);
    for (const action of Object.values(pair)) {
      action.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(0).play();
      action.paused = true; action.clampWhenFinished = true;
    }
    u.overlay = { type, clipName, pair, priority, elapsed: 0, duration: Math.max(.12, duration), weight: 0,
      token: options.token || ++this.token, mobile: options.mobile ?? ['attack', 'skill', 'hit'].includes(type), windup: options.windup || 0 };
    u.animation = { state: type, clip: clipName, normalizedTime: 0 };
    return true;
  }

  _zeroPair(pair) { for (const action of Object.values(pair || {})) action.setEffectiveWeight(0); }

  _death(root) {
    if (!root || root.userData.dead) return;
    const u = root.userData;
    this._overlay(root, 'death', 'Death_A', .9, { mobile: false });
    u.dead = true; u.deathAge = 0; u.ring.visible = false;
    if (u.hp) u.hp.visible = false;
  }

  event(event) {
    const id = event.target === 'player' || ['attack', 'dash', 'skill', 'death', 'heal', 'equip', 'buff', 'shield'].includes(event.type) ? 'player' : event.id;
    let root = this.actors.get(id);
    if (id === 'player' && ['equip', 'attack', 'skill'].includes(event.type) && this.game?.player && this.game.weapon) {
      // Events arrive before the next render. Replace the rig now so an immediate
      // attack/cast is delivered to the new weapon instead of a discarded actor.
      const weapon = this.game.weapon;
      if (event.type !== 'equip' && event.weaponId && event.weaponId !== weapon.id) return;
      root = this.ensure(this.game.player, true, weapon);
    }
    if (!root) {
      if (['attack', 'dash', 'skill', 'windup', 'kill', 'death'].includes(event.type)) {
        this.pendingEvents.push({ event, queuedAt: this.time });
        if (this.pendingEvents.length > 30) this.pendingEvents.shift();
      }
      return;
    }
    const u = root.userData;
    if (event.type === 'kill' || event.type === 'death') {
      this._death(root);
      if(event.type==='kill'&&u.fodder&&this.game){const p=this.game.player,dx=root.position.x-p.x,dz=root.position.z-p.z,d=Math.hypot(dx,dz)||1;u.deathImpulse={x:dx/d,z:dz/d};}
      return;
    }
    if (event.type === 'hit') {
      u.hitTime = .13;
      if (!u.overlay && !u.isPlayer) this._overlay(root, 'hit', 'Hit_A', .22);
      return;
    }
    if (event.type === 'attack') {
      const combo = Number.isInteger(event.combo) ? event.combo % 3 : u.combo++ % 3;
      const element = event.element || u.element;
      const heavy = (event.weaponId || u.equipmentKey).includes('greatsword');
      const names = element === 'water' ? ['Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Long']
        : element === 'lightning' ? ['2H_Melee_Attack_Stab', '1H_Melee_Attack_Stab', '2H_Melee_Attack_Slice']
          : heavy ? ['2H_Melee_Attack_Slice', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin']
            : ['1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Chop'];
      this._overlay(root, 'attack', names[combo], event.duration || .46);
    } else if (event.type === 'dash') {
      const delta = angleDelta(u.facing, event.facing ?? u.facing);
      const clip = Math.abs(delta) > Math.PI * .72 ? 'Dodge_Backward' : delta > Math.PI * .28 ? 'Dodge_Right' : delta < -Math.PI * .28 ? 'Dodge_Left' : 'Dodge_Forward';
      this._overlay(root, 'dash', clip, .28, { mobile: false });
    } else if (event.type === 'skill') {
      const element = event.element || u.element;
      this._overlay(root, 'skill', element === 'fire' ? 'Spellcast_Raise' : element === 'water' ? 'Spellcast_Long' : '2H_Melee_Attack_Spin', .68, { mobile: element !== 'lightning' });
    } else if (event.type === 'windup') {
      const name = event.enemyType === 'ranged' ? 'Spellcast_Shoot' : event.enemyType === 'boss' ? '2H_Melee_Attack_Chop' : event.enemyType === 'brute' ? '1H_Melee_Attack_Chop' : '1H_Melee_Attack_Slice_Diagonal';
      this._overlay(root, 'windup', name, (event.duration || .6) + .23, { mobile: false, windup: event.duration || .6 });
    }
  }

  _overlayWeights(root, dt) {
    const u = root.userData;
    let upper = 0, lower = 0;
    const current = u.overlay;
    if (current) {
      current.elapsed += dt;
      const end = current.type === 'death' ? 1 : clamp((current.duration - current.elapsed) / .09, 0, 1);
      current.weight = clamp(current.elapsed / .065, 0, 1) * end;
      const t = clamp(current.elapsed / current.duration, 0, 1);
      let phase = t;
      if (current.windup > 0) {
        phase = current.elapsed <= current.windup ? (current.elapsed / current.windup) * .62 : .62 + clamp((current.elapsed - current.windup) / .23, 0, 1) * .38;
      }
      for (const action of Object.values(current.pair)) action.time = Math.min(action.getClip().duration - 1e-5, phase * action.getClip().duration);
      u.animation = { state: current.type, clip: current.clipName, normalizedTime: t };
      if (current.elapsed >= current.duration && current.type !== 'death') {
        this._zeroPair(current.pair); u.overlay = null;
      }
    }
    if (u.outgoing) {
      u.outgoing.fade = Math.max(0, u.outgoing.fade - dt);
      if (u.outgoing.fade <= 0) { this._zeroPair(u.outgoing.pair); u.outgoing = null; }
    }
    const contributions = [];
    for (const item of [u.outgoing, u.overlay]) {
      if (!item) continue;
      const weight = item.fade !== undefined ? item.frozenWeight * item.fade / item.fadeMax : item.weight;
      const lowerWeight = item.mobile ? weight * (1 - u.moveAmount) : weight;
      contributions.push({ item, upper: weight, lower: lowerWeight }); upper += weight; lower += lowerWeight;
    }
    for (const c of contributions) {
      c.item.pair.upper?.setEffectiveWeight(c.upper / Math.max(1, upper));
      c.item.pair.lower?.setEffectiveWeight(c.lower / Math.max(1, lower));
    }
    return [clamp(upper, 0, 1), clamp(lower, 0, 1)];
  }

  _locomotion(root, entity, dt, upperOverlay, lowerOverlay) {
    const u = root.userData;
    const movement = u.dead ? 0 : u.moveAmount;
    const length = Math.hypot(u.velocityX, u.velocityZ);
    const fx = Math.sin(u.facing), fz = Math.cos(u.facing);
    const forward = length > .01 ? (u.velocityX * fx + u.velocityZ * fz) / length : 1;
    const side = length > .01 ? (u.velocityX * fz - u.velocityZ * fx) / length : 0;
    const dirs = [Math.max(0, forward) ** 2, Math.max(0, -forward) ** 2, Math.max(0, -side) ** 2, Math.max(0, side) ** 2];
    const total = dirs.reduce((sum, w) => sum + w, 0) || 1;
    const run = clamp((u.speed - 2.2) / 2.1, 0, 1);
    const twoHanded = u.element === 'lightning' || u.equipmentKey.includes('greatsword');
    const targets = new Map([
      ['Idle', twoHanded ? 0 : 1 - movement], ['2H_Melee_Idle', twoHanded ? 1 - movement : 0],
      ['Walking_A', movement * dirs[0] / total * (1 - run)], ['Running_A', movement * dirs[0] / total * run],
      ['Walking_Backwards', movement * dirs[1] / total], ['Running_Strafe_Left', movement * dirs[2] / total], ['Running_Strafe_Right', movement * dirs[3] / total],
    ]);
    let sum = 0;
    for (const [name, target] of targets) { const value = dt ? smooth(u.baseWeights.get(name) || 0, target, 14, dt) : (u.baseWeights.get(name) ?? target); u.baseWeights.set(name, value); sum += value; }
    for (const [name, value] of u.baseWeights) {
      const pair = this._pair(root, name);
      const isIdle = name === 'Idle' || name === '2H_Melee_Idle';
      const cadence = isIdle ? .94 : clamp(u.speed / (name.includes('Running') ? 4.7 : 2.4), .62, 1.52);
      for (const [part, action] of Object.entries(pair)) {
        action.setEffectiveTimeScale(cadence);
        action.setEffectiveWeight((value / Math.max(.001, sum)) * (1 - (part === 'upper' ? upperOverlay : lowerOverlay)));
      }
    }
    if (!u.overlay) u.animation = { state: movement > .15 ? 'moving' : 'idle', clip: movement > .15 ? (run > .5 ? 'Running_A' : 'Walking_A') : (twoHanded ? '2H_Melee_Idle' : 'Idle'), normalizedTime: 0 };
  }

  _updateActor(root, entity, dt, game) {
    const u = root.userData;
    const safeDt = Math.max(dt, .0001);
    const dx = entity.x - u.lastX, dz = entity.z - u.lastZ;
    u.lastX = entity.x; u.lastZ = entity.z;
    const teleport = Math.hypot(dx, dz) > 4;
    if (dt > 0) {
      u.velocityX = smooth(u.velocityX, teleport ? 0 : dx / safeDt, 15, dt);
      u.velocityZ = smooth(u.velocityZ, teleport ? 0 : dz / safeDt, 15, dt);
      u.speed = smooth(u.speed, Math.hypot(u.velocityX, u.velocityZ), 15, dt);
      u.moveAmount = smooth(u.moveAmount, clamp((u.speed - .12) / .55, 0, 1), 15, dt);
      u.facing += angleDelta(u.facing, entity.facing ?? u.facing) * (1 - Math.exp(-dt * (u.isPlayer ? 18 : 11)));
    }
    if (teleport || dt === 0) root.position.set(entity.x, 0, entity.z);
    else { root.position.x = smooth(root.position.x, entity.x, 32, dt); root.position.z = smooth(root.position.z, entity.z, 32, dt); }
    u.model.rotation.y = u.facing;
    const lateral = u.velocityX * Math.cos(u.facing) - u.velocityZ * Math.sin(u.facing);
    u.lean = smooth(u.lean, u.overlay && !u.overlay.mobile ? 0 : clamp(-lateral * .011, -.065, .065), 10, dt);
    u.model.rotation.z = u.lean;
    const [upper, lower] = this._overlayWeights(root, dt);
    this._locomotion(root, entity, dt, upper, lower);
    u.mixer.update(dt);
    u.hitTime = Math.max(0, u.hitTime - dt);
    const burn = entity.burnRemaining > 0, slow = entity.slowRemaining > 0, frozen = entity.frozenRemaining > 0;
    for (const { material, baseEmissive, baseIntensity } of u.materials) {
      if (!material.emissive || !baseEmissive) continue;
      material.emissive.copy(baseEmissive); material.emissiveIntensity = baseIntensity;
      if (u.hitTime > 0) { material.emissive.lerp(new THREE.Color(u.isPlayer ? 0xff5a43 : 0xffdf9c), .8); material.emissiveIntensity = .8; }
      else if (burn) { material.emissive.lerp(new THREE.Color(0x9f2c09), .65); material.emissiveIntensity = .35; }
      else if (frozen) { material.emissive.lerp(new THREE.Color(0x7fbbea), .8); material.emissiveIntensity = .55; }
      else if (slow) { material.emissive.lerp(new THREE.Color(0x146b78), .45); material.emissiveIntensity = .25; }
    }
    if (u.isPlayer) {
      u.ring.material.color.setHex(entity.invulnerable > 0 ? 0xffffff : COLORS[u.element] || COLORS.fire);
      u.ring.material.opacity = entity.shield > 0 ? .95 : .7 + Math.sin(this.time * 2.2) * .06;
      // Expose real derived combat state for QA and later weapon-specific polish.
      u.combatStats = game.combatStats || null;
      u.buffs = game.activeBuffs || [];
    } else {
      u.ring.material.color.setHex(slow ? COLORS.water : burn ? COLORS.fire : entity.elite ? 0xdf9455 : 0x995849);
      u.ring.material.opacity = entity.windup > 0 ? .75 : (slow || burn) ? .46 : .19;
    }
    if (u.hp) { u.hp.quaternion.copy(this.camera.quaternion); u.fill.scale.x = clamp(entity.hp / entity.maxHp, 0, 1); u.fill.position.x = -(1 - u.fill.scale.x) * .44; u.hp.visible = (!u.fodder && entity.hp < entity.maxHp) || entity.elite; }
  }

  update(game, dt) {
    this.game = game;
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
    this.time += dt;
    const keep = new Set(['player']);
    const player = this.ensure(game.player, true, game.weapon);
    for (const entity of game.enemies || []) if (entity.hp > 0) { keep.add(entity.id); this.ensure(entity); }
    const pending = this.pendingEvents; this.pendingEvents = [];
    for (const entry of pending) {
      if (this.time - entry.queuedAt >= .4) continue;
      const event = entry.event;
      const id = event.target === 'player' || ['attack', 'dash', 'skill', 'death'].includes(event.type) ? 'player' : event.id;
      if (this.actors.has(id)) this.event(event);
      else this.pendingEvents.push(entry);
    }
    if (player && (game.player.hp <= 0 || game.status === 'dead')) this._death(player);
    for (const [id, root] of this.actors) {
      const u = root.userData;
      if (!keep.has(id)) this._death(root);
      if (u.dead) {
        u.deathAge += dt;
        const [upper, lower] = this._overlayWeights(root, dt);
        this._locomotion(root, {}, dt, upper, lower);
        u.mixer.update(dt);
        if(u.deathImpulse&&dt>0&&u.deathAge<.6){root.position.x+=u.deathImpulse.x*dt*1.8;root.position.z+=u.deathImpulse.z*dt*1.8;root.position.y=Math.sin(u.deathAge/.6*Math.PI)*.45;}
        if(u.deathImpulse&&u.deathAge>=.6&&u.deathAge<=1.15)root.position.y=0;
        if (!u.isPlayer && u.deathAge > 1.15) root.position.y = -(u.deathAge - 1.15) * .6;
        if (!u.isPlayer && u.deathAge > (u.fodder ? 1.2 : 1.8)) { this._dispose(root); this.actors.delete(id); }
        continue;
      }
      const entity = id === 'player' ? game.player : game.enemies.find(item => item.id === id);
      if (entity) this._updateActor(root, entity, dt, game);
    }
  }

  _dispose(root) {
    disposeEquipmentAppearance(root);
    const u = root.userData;
    u.mixer.stopAllAction(); u.mixer.uncacheRoot(u.model);
    const skeletons = new Set();
    u.model.traverse(child => { if (child.isSkinnedMesh) skeletons.add(child.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
    for (const { material } of u.materials) material.dispose();
    for (const child of u.generated) { child.geometry?.dispose(); child.material?.dispose(); }
    root.removeFromParent();
  }

  clear() {
    for (const root of this.actors.values()) this._dispose(root);
    this.actors.clear(); this.pendingEvents = []; this.game = null;
  }
}
