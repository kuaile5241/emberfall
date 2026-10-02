import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ActorSystem } from './actors.js';
import { equipmentById } from './content.js';
import { normalizeBuildLoadout } from './builds.js';

/** Reuses the real game rigs and weapons in the camp's wardrobe portrait. */
export class CampPreview {
  constructor(canvas, { models, clips }) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, .1, 30);
    this.camera.position.set(2.55, 2.6, 5.7);
    this.camera.lookAt(0, 1.18, 0);
    this.scene.add(new THREE.HemisphereLight(0xe8e3df, 0x403b39, 2.15));
    const key = new THREE.DirectionalLight(0xffe4bd, 3.5);
    key.position.set(-3, 6, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.normalBias = .03;
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 4, bottom: -3, near: .1, far: 20 });
    this.scene.add(key);
    this.rim = new THREE.PointLight(0xf87e42, 22, 8, 2); this.rim.position.set(1, 2.8, -1.8); this.scene.add(this.rim);
    const fill = new THREE.DirectionalLight(0xcbd1dc, 1.5); fill.position.set(3, 4, -4); this.scene.add(fill);
    this.plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.25, .17, 64), new THREE.MeshStandardMaterial({ color: 0x504a46, roughness: .91, metalness: .04 }));
    this.plinth.position.y = -.085; this.plinth.receiveShadow = true; this.scene.add(this.plinth);
    this.trim = new THREE.Mesh(new THREE.TorusGeometry(1.18, .012, 8, 80), new THREE.MeshStandardMaterial({ color: 0xc8ab68, metalness: .55, roughness: .5 }));
    this.trim.rotation.x = Math.PI / 2; this.trim.position.y = .006; this.scene.add(this.trim);
    this.stage = new THREE.Group(); this.scene.add(this.stage);
    this.stageResources = [];
    const stageMesh = (geometry, material, position) => {
      const object = new THREE.Mesh(geometry, material); object.position.set(...position);
      object.castShadow = true; object.receiveShadow = true;
      this.stage.add(object); this.stageResources.push(object); return object;
    };
    const stone = () => new THREE.MeshStandardMaterial({ color: 0x484440, roughness: .93 });
    stageMesh(new THREE.CylinderGeometry(1.27, 1.36, .15, 64), stone(), [0, -.235, 0]);
    for (const [x, z, size, turn] of [[-1.02,.65,.31,.2],[.93,.69,.23,-.4],[-.84,-.82,.16,.7],[.79,-.82,.18,-.6]]) {
      const pebble = stageMesh(new RoundedBoxGeometry(size, size * .53, size * .75, 3, .06), stone(), [x, size * .24, z]);
      pebble.rotation.y = turn;
    }
    for (const [x, z] of [[-1.06,.28],[.98,.43]]) {
      const copper = () => new THREE.MeshStandardMaterial({ color: 0x8d6943, roughness: .44, metalness: .62 });
      stageMesh(new THREE.CylinderGeometry(.12,.14,.07,16), copper(), [x,.07,z]);
      stageMesh(new THREE.CylinderGeometry(.035,.045,.2,12), copper(), [x,.19,z]);
      stageMesh(new RoundedBoxGeometry(.16,.23,.16,3,.035), new THREE.MeshStandardMaterial({ color: 0xf4c470, roughness: .35, emissive: 0xff9a35, emissiveIntensity: 1.1 }), [x,.36,z]);
      stageMesh(new THREE.ConeGeometry(.15,.07,16), copper(), [x,.51,z]);
      const glow = new THREE.PointLight(0xffc879, 1.7, 2.1, 2); glow.position.set(x,.44,z); this.stage.add(glow);
    }
    this.actors = new ActorSystem({ models, clips, parent: this.scene, camera: this.camera });
    this.game = { player: { x: 0, z: 0, facing: .4, hp: 120, maxHp: 120, shield: 0, radius: .48 }, enemies: [], activeBuffs: [], status: 'menu' };
    this.game.weapon = equipmentById('fire-sword');
    this.frameTime = 0; this.angle = .4; this.dragX = null;
    this.down = e => { this.dragX = e.clientX; canvas.setPointerCapture?.(e.pointerId); };
    this.move = e => { if (this.dragX === null) return; this.angle += (e.clientX - this.dragX) * .012; this.dragX = e.clientX; };
    this.up = () => { this.dragX = null; };
    canvas.addEventListener('pointerdown', this.down); canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up); canvas.addEventListener('pointercancel', this.up);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas);
    this.resize();
  }
  select(id, buildLoadout) {
    const weapon = equipmentById(id); if (!weapon) return;
    this.game.weapon = weapon;
    this.game.buildLoadout = normalizeBuildLoadout(buildLoadout);
    this.rim.color.set(weapon.element === 'fire' ? 0xff803a : weapon.element === 'water' ? 0x47c2e3 : 0x9ed8ff);
    this.actors.update(this.game, 0);
  }
  resize() {
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (width < 1 || height < 1) return;
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    // Taller wardrobe layouts still fit hat, boots and the held weapon.
    const extra = Math.max(0, .72 - this.camera.aspect) * 2.6;
    this.camera.position.set(2.55 + extra * .35, 2.6, 5.7 + extra);
    this.camera.lookAt(0, 1.18, 0);
    this.renderer.setSize(width, height, false);
  }
  render(dt) {
    this.frameTime += dt; if (this.frameTime < 1 / 30 || !this.canvas.isConnected) return;
    const elapsed = Math.min(this.frameTime, .05); this.frameTime = 0;
    this.game.player.facing = this.angle;
    this.actors.update(this.game, elapsed); this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.observer.disconnect(); this.actors.clear();
    for (const object of [this.plinth, this.trim]) { object.geometry.dispose(); object.material.dispose(); }
    for (const object of this.stageResources) { object.geometry.dispose(); object.material.dispose(); }
    this.canvas.removeEventListener('pointerdown', this.down); this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up); this.canvas.removeEventListener('pointercancel', this.up);
    this.renderer.dispose();
  }
}
