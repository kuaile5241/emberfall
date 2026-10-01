import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RuinWorld } from '../src/environment.js';
import { DungeonView, createTelegraphGeometry } from '../src/view.js';
import { WORLD, AQUEDUCT_WORLD } from '../src/world.js';

// Renderer structure only: asset loading is replaced by shared geometry and
// materials. Browser acceptance separately checks shipped textures and pixels.
function environmentFixture() {
  const scene = new THREE.Scene(), environment = new RuinWorld(scene);
  environment.materials = Object.fromEntries(['floor', 'wall', 'ground', 'dark', 'iron', 'bronze', 'bone', 'wood', 'cloth', 'fire', 'cold']
    .map(key => [key, new THREE.MeshStandardMaterial()]));
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const prop = new THREE.Group(); prop.add(new THREE.Mesh(geometry, material));
  environment.props = Object.fromEntries(['crates_stacked', 'barrel_large_decorated', 'chest'].map(key => [key, prop]));
  environment.setWorld(WORLD, true);
  return { scene, environment, geometry, material };
}

function mapsFixture() {
  return { dynamic: new THREE.Group(), warningGroup: new THREE.Group(), interests: new Map(), pickups: new Map(), warnings: new Map(), bolts: new Map(), time: 1 };
}

test('repeated chapter switches replace the scene without accumulating lights, gates or disposing shared assets', () => {
  const { scene, environment, geometry, material } = environmentFixture();
  const lightCount = scene.children.filter(child => child.isPointLight).length;
  let assetDisposals = 0, sharedDisposals = 0;
  for (const resource of [geometry, material, ...Object.values(environment.materials)]) resource.addEventListener('dispose', () => assetDisposals++);
  const sharedGeometry = environment.instancedMeshes[0].geometry;
  sharedGeometry.addEventListener('dispose', () => sharedDisposals++);
  const owned = [...environment.generatedGeometry, ...environment.generatedMaterials];
  const released = new Set();
  for (const resource of owned) resource.addEventListener('dispose', () => released.add(resource));
  const instanceBuffers = [...environment.instancedMeshes], releasedBuffers = new Set();
  for (const instance of instanceBuffers) instance.addEventListener('dispose', () => releasedBuffers.add(instance));
  for (const world of [AQUEDUCT_WORLD, WORLD, AQUEDUCT_WORLD, WORLD]) {
    const previousRoot = environment.root;
    environment.setWorld(world);
    assert.equal(previousRoot.parent, null, 'previous world is detached');
    assert.equal(scene.children.filter(child => child.isPointLight).length, lightCount);
    assert.equal(scene.children.filter(child => child.name.startsWith('World_')).length, 1);
    assert.equal(environment.gates.length, world.corridors.length, 'only this route has gates');
    assert.equal(environment.chests.length, world.zones.length);
    assert.ok(environment.gates.every(gate => gate.group.parent === environment.root));
    assert.ok(environment.root.getObjectByName('WalkableFloor'));
    assert.equal(environment.water.length > 0, world.id === 'aqueduct');
  }
  assert.equal(released.size, owned.length, 'generated resources from the old scene are released');
  assert.equal(releasedBuffers.size, instanceBuffers.length, 'old instancing buffers are released without disposing their shared geometry');
  assert.equal(assetDisposals, 0);
  assert.equal(sharedDisposals, 0);
});

test('restarting the same map resets visible reward and gate state without rebuilding geometry', () => {
  const { environment } = environmentFixture();
  const root = environment.root;
  environment.chests.forEach(chest => { chest.visible = true; });
  environment.gates.forEach(gate => { gate.group.visible = false; });
  environment.waypoint.visible = true;
  assert.equal(environment.setWorld(WORLD), false);
  assert.strictEqual(environment.root, root);
  assert.ok(environment.chests.every(chest => !chest.visible));
  assert.ok(environment.gates.every(gate => gate.group.visible));
  assert.equal(environment.waypoint.visible, false);
});

test('story mechanisms have physical markers and turn off their interaction glow after completion', () => {
  for (const [world, id] of [[WORLD, 'forge-sigil'], [AQUEDUCT_WORLD, 'sluice-wheel']]) {
    const view = mapsFixture(), point = { ...world.interestPoints.find(item => item.id === id), available: true, completed: false };
    const game = { roomIndex: point.zoneIndex, interestPoints: [point], drops: [], telegraphs: [], projectiles: [] };
    DungeonView.prototype.updateMaps.call(view, game);
    const marker = view.interests.get(id);
    assert.ok(marker && marker.visible);
    assert.deepEqual(marker.position.toArray(), [point.x, 0, point.z]);
    assert.ok(marker.getObjectByName('relic').isMesh);
    assert.ok(marker.getObjectByName('halo').visible);
    if (id === 'sluice-wheel') assert.ok(marker.getObjectByName('wheel').children.some(child => child.geometry?.type === 'TorusGeometry'));
    point.completed = true; point.available = false;
    DungeonView.prototype.updateMaps.call(view, game);
    assert.equal(marker.getObjectByName('halo').visible, false);
    assert.equal(marker.getObjectByName('beam').visible, false);
  }
});

test('tidal ring warnings retain an empty safe centre and removed hazards release their renderer objects', () => {
  const geometry = createTelegraphGeometry({ type: 'ring', radius: 8, innerRadius: 3 });
  assert.equal(geometry.type, 'RingGeometry');
  for (let index = 0; index < geometry.attributes.position.count; index++) {
    const x = geometry.attributes.position.getX(index), y = geometry.attributes.position.getY(index);
    assert.ok(Math.hypot(x, y) >= 3 - 1e-6, 'no warning vertex fills the safe hole');
  }
  geometry.dispose();
  const view = mapsFixture();
  const game = { roomIndex: 0, interestPoints: [], drops: [], telegraphs: [{ id: 71, type: 'ring', radius: 8, innerRadius: 3, x: 0, z: 0, remaining: 1, duration: 1 }], projectiles: [{ id: 73, type: 'water', x: 0, z: 0 }] };
  DungeonView.prototype.updateMaps.call(view, game);
  const warning = view.warnings.get(71), bolt = view.bolts.get(73);
  assert.equal(warning.geometry.type, 'RingGeometry');
  assert.ok(bolt.material.color.b > bolt.material.color.r, 'water projectiles are blue');
  const disposed = new Set();
  for (const resource of [warning.geometry, warning.material, bolt.geometry, bolt.material]) resource.addEventListener('dispose', () => disposed.add(resource));
  game.telegraphs = []; game.projectiles = [];
  DungeonView.prototype.updateMaps.call(view, game);
  assert.equal(view.warnings.size, 0); assert.equal(view.bolts.size, 0);
  assert.equal(warning.parent, null); assert.equal(bolt.parent, null);
  assert.equal(disposed.size, 4);
});
