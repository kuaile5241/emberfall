import * as THREE from 'three';

const COLORS = { fire: 0xff9b46, water: 0x9adaff, lightning: 0xbde7ff };
const glow = (color, opacity = .7) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
  depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
const mesh = (geometry, material, x = 0, y = 0, z = 0) => {
  const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); return object;
};
const disc = (radius, color, opacity = .2) => {
  const object = mesh(new THREE.RingGeometry(radius * .82, radius, 36), glow(color, opacity));
  object.rotation.x = -Math.PI / 2; object.position.y = .075; return object;
};

/** No asset texture or renderer is needed to inspect a skill's actual geometry. */
export function createSkillVisual(effect, quality = 'high', intensity = 1) {
  const root = new THREE.Group(); root.name = `Skill_${effect.form}_${effect.id}`;
  root.userData.form = effect.form;
  const color = COLORS[effect.element];
  if (effect.form === 'fire-pillars') {
    for (const point of effect.points || []) {
      const marker = new THREE.Group(); marker.position.set(point.x, 0, point.z);
      marker.userData.delay = point.delay; marker.name = 'PillarWarning';
      marker.add(disc(effect.radius, color, .55));
      const core = mesh(new THREE.ConeGeometry(effect.radius * .25, .3, 8), glow(0xffc376, .7), 0, .15, 0);
      marker.add(core); root.add(marker);
    }
  } else if (effect.form === 'fire-meteor') {
    root.position.set(effect.x, 0, effect.z); root.add(disc(effect.radius, color, .6));
    const stone = mesh(new THREE.IcosahedronGeometry(.72, 1), new THREE.MeshStandardMaterial({ color: 0x372532,
      emissive: 0xff5a18, emissiveIntensity: 2.1, roughness: .55 }), 0, 10, 0);
    stone.name = 'FallingMeteor'; root.add(stone);
    const trail = mesh(new THREE.ConeGeometry(.62, 3.3, 12, 1, true), glow(0xff7c35, .6), 0, 12, 0);
    trail.name = 'MeteorTail'; trail.rotation.x = Math.PI; root.add(trail);
    const embers = disc(effect.radius * .8, 0xff6633, .26); embers.name = 'MeteorBurn'; root.add(embers);
  } else if (effect.form === 'water-blizzard') {
    root.position.set(effect.x, 0, effect.z); root.add(disc(effect.radius, color, .35));
    const count = Math.round((quality === 'low' ? 12 : quality === 'medium' ? 26 : 42) * THREE.MathUtils.clamp(intensity, .5, 1.5));
    const flakes = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.09), glow(0xe9f8ff, .9), count);
    flakes.name = 'Snowfall'; flakes.frustumCulled = false;
    flakes.userData.seeds = Array.from({ length: count }, (_, index) => ({
      angle: index * 2.399963, radius: Math.sqrt((index + .5) / count) * effect.radius, offset: index / count,
    })); root.add(flakes);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      const ice = mesh(new THREE.ConeGeometry(.22, .85, 5), glow(0xbce8ff, .4), Math.sin(angle) * effect.radius * .85, .3, Math.cos(angle) * effect.radius * .85);
      ice.name = 'IceSpire'; root.add(ice);
    }
  } else if (effect.form === 'water-torrent') {
    root.position.set(effect.x, 0, effect.z); root.rotation.y = effect.facing;
    const wall = mesh(new THREE.PlaneGeometry(effect.width, 1.65), glow(0x79bdf2, .32), 0, .83, 0);
    wall.name = 'WaveFront'; root.add(wall);
    const path = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, index) => new THREE.Vector3(
      (index / 8 - .5) * effect.width, 1.1 + Math.sin(index / 8 * Math.PI) * .55, Math.sin(index / 8 * Math.PI) * .35)));
    const foam = mesh(new THREE.TubeGeometry(path, 24, .085, 6, false), glow(0xe1f6ff, .9));
    foam.name = 'WaveFoam'; root.add(foam);
  } else if (effect.form === 'lightning-lances') {
    for (const line of effect.lines || []) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(line.from.x, .5, line.from.z), new THREE.Vector3(line.to.x, .5, line.to.z),
      ]);
      const beam = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .3,
        depthWrite: false, blending: THREE.AdditiveBlending })); beam.name = 'LanceWarning'; root.add(beam);
    }
  } else if (effect.form === 'lightning-chain') {
    root.position.set(effect.origin.x, 0, effect.origin.z);
    const coil = mesh(new THREE.TorusGeometry(.5, .045, 6, 24), glow(color), 0, .8, 0);
    coil.name = 'ChainCoil'; root.add(coil);
  }
  return root;
}

/** Owns bounded temporary meshes; the shared particle pool remains in ElementEffects. */
export class SkillEffects {
  constructor(scene, elementFX) {
    this.root = new THREE.Group(); this.root.name = 'BuildSkillEffects'; scene.add(this.root);
    this.elementFX = elementFX; this.fields = new Map(); this.effects = [];
    this.settings = { quality: 'high', effects: 1 }; this.time = 0;
  }
  configure(settings) {
    const previous = `${this.settings.quality}:${this.settings.effects}`; Object.assign(this.settings, settings);
    if (previous !== `${this.settings.quality}:${this.settings.effects}`) {
      for (const field of this.fields.values()) this.disposeObject(field.object); this.fields.clear();
    }
  }
  disposeObject(object) {
    object.removeFromParent(); const geometries = new Set(), materials = new Set();
    object.traverse(child => {
      if (child.isInstancedMesh) child.dispose();
      if (child.geometry) geometries.add(child.geometry);
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) if (material) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose();
  }
  add(object, duration, animate) {
    const limit = this.settings.quality === 'low' ? 18 : 48;
    if (this.effects.length >= limit) this.disposeObject(this.effects.shift().object);
    this.root.add(object); this.effects.push({ object, duration, remaining: duration, animate });
  }
  event(event) {
    if (event.type === 'freeze') {
      const ice = mesh(new THREE.OctahedronGeometry(1.1, 0), glow(0xcceeff, .2), event.x, 1, event.z);
      ice.scale.set(.65, 1.1, .65); this.add(ice, event.duration, (object, progress) => { object.material.opacity = .28 * (1 - progress); }); return;
    }
    if (event.type !== 'skillshape') return;
    const fx = this.elementFX;
    if (['pillar', 'pillar-echo'].includes(event.phase)) {
      const group = new THREE.Group(); group.position.set(event.x, 0, event.z);
      for (let index = 0; index < 3; index++) {
        const flame = mesh(new THREE.ConeGeometry(event.radius * (1 - index * .2), 5.5 - index, 12, 1, true),
          glow(index === 2 ? 0xffe2a0 : 0xff752c, .55), 0, 2.7 - index * .4, 0);
        flame.rotation.y = index; group.add(flame);
      }
      this.add(group, .7, (object, progress) => {
        object.scale.y = Math.sin(progress * Math.PI) * 1.3; object.scale.x = object.scale.z = .6 + progress * .7;
        object.children.forEach(child => { child.material.opacity = (1 - progress) * .65; child.rotation.y += .025; });
      }); fx.burstParticles(event.x, event.z, 65, 'fire', event.radius, 3, .35);
      fx.shake = Math.max(fx.shake, .16); fx.punch = Math.max(fx.punch, .025);
    } else if (['impact', 'impact-echo'].includes(event.phase)) {
      fx.shockShell(event.x, event.z, event.radius, 'fire'); fx.shards(event.x, event.z, event.radius, 'fire', 18);
      fx.burstParticles(event.x, event.z, 160, 'fire', event.radius * .7, 6, .1);
      fx.shake = Math.max(fx.shake, .34); fx.punch = Math.max(fx.punch, .06);
    } else if (event.phase === 'snow') {
      for (const point of event.points || []) {
        const ice = mesh(new THREE.ConeGeometry(.15, 1.1, 5), glow(0xb7e5ff, .85), point.x, 4.5, point.z);
        ice.rotation.x = Math.PI; this.add(ice, .4, (object, progress) => { object.position.y = 4.5 * (1 - progress); });
      }
      fx.burstParticles(event.x, event.z, 10, 'water', event.radius, .6, .1);
    } else if (event.phase === 'jump') {
      fx.bolt([{ ...event.from, y: 1 }, { ...event.to, y: 1.1 }], .32); fx.burstParticles(event.x, event.z, 18, 'lightning', .25, 1.5, 1);
    } else if (event.phase === 'lances') {
      for (const line of event.lines || []) fx.bolt([{ ...line.from, y: 1 }, { ...line.to, y: 1 }], .45);
      fx.shake = Math.max(fx.shake, .13);
    } else if (event.phase === 'overload' || event.phase === 'shatter') {
      fx.shards(event.x, event.z, event.radius, event.element, 16);
      fx.burstParticles(event.x, event.z, 65, event.element, event.radius * .7, 4, .6);
    } else if (event.phase === 'cast' && event.form === 'lightning-chain') {
      // An empty cast still has a directed discharge, rather than a nova.
      fx.bolt([{ ...event.origin, y: 1 }, { x: event.origin.x + Math.sin(event.facing) * 3, y: 1.3, z: event.origin.z + Math.cos(event.facing) * 3 }], .2);
    }
  }
  update(game, dt) {
    this.time += dt;
    for (let index = this.effects.length - 1; index >= 0; index--) {
      const effect = this.effects[index]; effect.remaining -= dt;
      if (effect.remaining <= 0) { this.disposeObject(effect.object); this.effects.splice(index, 1); }
      else effect.animate?.(effect.object, 1 - effect.remaining / effect.duration);
    }
    const current = new Set(), dummy = new THREE.Object3D();
    const limit = this.settings.quality === 'low' ? 12 : 32;
    for (const effect of (game.skillEffects || []).slice(-limit)) {
      current.add(effect.id);
      let field = this.fields.get(effect.id);
      if (!field) { const object = createSkillVisual(effect, this.settings.quality, this.settings.effects); this.root.add(object); field = { object }; this.fields.set(effect.id, field); }
      const object = field.object;
      if (effect.form === 'fire-pillars') for (const child of object.children) child.visible = effect.age < child.userData.delay;
      if (effect.form === 'fire-meteor') {
        const meteor = object.getObjectByName('FallingMeteor'), tail = object.getObjectByName('MeteorTail');
        meteor.visible = tail.visible = effect.age < effect.delay;
        meteor.position.y = .5 + Math.max(0, 1 - effect.age / effect.delay) * 10;
        meteor.rotation.x += dt * 4; meteor.rotation.z += dt * 2; tail.position.y = meteor.position.y + 1.4;
      }
      if (effect.form === 'water-blizzard') {
        const snow = object.getObjectByName('Snowfall');
        snow.userData.seeds.forEach((seed, index) => {
          dummy.position.set(Math.sin(seed.angle) * seed.radius + Math.sin(effect.age * 2 + seed.angle) * .2,
            5 * (1 - ((effect.age * .85 + seed.offset) % 1)), Math.cos(seed.angle) * seed.radius);
          dummy.rotation.set(effect.age * 2, seed.angle, effect.age); dummy.scale.set(.6, 1.5, .6); dummy.updateMatrix(); snow.setMatrixAt(index, dummy.matrix);
        }); snow.instanceMatrix.needsUpdate = true;
      }
      if (effect.form === 'water-torrent') { object.position.set(effect.x, Math.sin(effect.age * 9) * .08, effect.z); object.scale.y = Math.min(1, effect.remaining * 5); }
      if (effect.form === 'lightning-lances') object.children.forEach(child => { child.material.opacity = effect.fired ? .8 * effect.remaining / effect.duration : .24; });
      if (effect.form === 'lightning-chain') object.rotation.y = effect.age * 14;
    }
    for (const [id, field] of this.fields) if (!current.has(id)) { this.disposeObject(field.object); this.fields.delete(id); }
  }
  clear() {
    for (const field of this.fields.values()) this.disposeObject(field.object); this.fields.clear();
    for (const effect of this.effects) this.disposeObject(effect.object); this.effects = [];
  }
}
