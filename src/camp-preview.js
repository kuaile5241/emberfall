import * as THREE from 'three';
import { ActorSystem } from './actors.js';
import { equipmentById } from './content.js';

/** Reuses the real game rigs and weapons in the camp's wardrobe portrait. */
export class CampPreview {
  constructor(canvas, { models, clips }) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, .1, 30);
    this.camera.position.set(2.8, 2.3, 5.1);
    this.camera.lookAt(0, 1.1, 0);
    this.scene.add(new THREE.HemisphereLight(0xd6e5e4, 0x534133, 2.3));
    const key = new THREE.DirectionalLight(0xffddb1, 4.2);
    key.position.set(-3, 6, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.normalBias = .03;
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 4, bottom: -3, near: .1, far: 20 });
    this.scene.add(key);
    this.rim = new THREE.PointLight(0xf87e42, 22, 8, 2); this.rim.position.set(1, 2.8, -1.8); this.scene.add(this.rim);
    const fill = new THREE.DirectionalLight(0xa4d5f3, 1.9); fill.position.set(3, 4, -4); this.scene.add(fill);
    this.plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.5, .16, 64), new THREE.MeshStandardMaterial({ color: 0x343a39, roughness: .92, metalness: .22 }));
    this.plinth.position.y = -.085; this.plinth.receiveShadow = true; this.scene.add(this.plinth);
    this.trim = new THREE.Mesh(new THREE.TorusGeometry(1.36, .018, 8, 80), new THREE.MeshStandardMaterial({ color: 0xa7874d, metalness: .8, roughness: .4 }));
    this.trim.rotation.x = Math.PI / 2; this.trim.position.y = .006; this.scene.add(this.trim);
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
  select(id) {
    const weapon = equipmentById(id); if (!weapon) return;
    this.game.weapon = weapon;
    this.rim.color.set(weapon.element === 'fire' ? 0xff803a : weapon.element === 'water' ? 0x47c2e3 : 0x9ed8ff);
    this.actors.update(this.game, 0);
  }
  resize() {
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (width < 1 || height < 1) return;
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
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
    this.canvas.removeEventListener('pointerdown', this.down); this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up); this.canvas.removeEventListener('pointercancel', this.up);
    this.renderer.dispose();
  }
}
