/** One continuous, metre-scaled ruin. Rendering and simulation share this map. */
const rect = (id, kind, minX, maxX, minZ, maxZ, extra = {}) => ({ id, kind, minX, maxX, minZ, maxZ, ...extra });
const zone = (id, name, subtitle, theme, waves, bounds, entry, exit) => ({
  id, name, subtitle, theme, waves, bounds, entry, exit,
  center: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
});

export const ZONES = Object.freeze([
  zone('gate', '灰烬前庭', '坍塌的城门与旧墓道。', 'gate', [14, 16], { minX: -17, maxX: 17, minZ: -13, maxZ: 13 }, { x: 0, z: 10 }, { x: 16, z: -4 }),
  zone('crypt', '无声回廊', '墓道沿山体向内延伸。', 'crypt', [18, 20], { minX: 34, maxX: 64, minZ: -25, maxZ: 5 }, { x: 35, z: -10 }, { x: 49, z: -24 }),
  zone('shrine', '遗忘圣所', '旧圣堂与铸钟工坊相连。', 'shrine', [20, 22], { minX: 25, maxX: 61, minZ: -61, maxZ: -35 }, { x: 49, z: -36 }, { x: 60, z: -48 }),
  zone('forge', '熔火工坊', '运钟石道穿过废弃熔炉。', 'forge', [22, 24, 24], { minX: 84, maxX: 116, minZ: -61, maxZ: -29 }, { x: 85, z: -48 }, { x: 100, z: -60 }),
  zone('stairs', '敲钟长阶', '山腹中的长阶通向钟楼。', 'stairs', [24, 26, 28], { minX: 87, maxX: 119, minZ: -103, maxZ: -75 }, { x: 103, z: -76 }, { x: 88, z: -89 }),
  zone('throne', '钟下祭坛', '墓城的钟楼地宫。', 'throne', [25], { minX: 20, maxX: 60, minZ: -108, maxZ: -76 }, { x: 59, z: -92 }, { x: 40, z: -104 }),
]);

function passage(id, from, to, path, width = 7) {
  const points = path.map(([x, z]) => ({ x, z }));
  return { id, from, to, width, path: points, rects: points.slice(1).map((b, i) => {
    const a = points[i], half = width / 2;
    return rect(`${id}-${i}`, 'corridor', Math.min(a.x, b.x) - half, Math.max(a.x, b.x) + half,
      Math.min(a.z, b.z) - half, Math.max(a.z, b.z) + half, { from, to });
  }) };
}

const corridors = [
  passage('gate-crypt', 0, 1, [[16, -4], [25, -4], [25, -10], [35, -10]]),
  passage('crypt-shrine', 1, 2, [[49, -24], [49, -36]]),
  passage('shrine-forge', 2, 3, [[60, -48], [85, -48]]),
  passage('forge-stairs', 3, 4, [[100, -60], [100, -69], [103, -69], [103, -76]]),
  passage('stairs-throne', 4, 5, [[88, -89], [73, -89], [73, -92], [59, -92]]),
];
const alcoves = [
  { id: 'burial-garden', name: '荒废墓园', zoneIndex: 0, center: { x: 8, z: -26 }, bounds: { minX: 1, maxX: 15, minZ: -32, maxZ: -20 }, path: [{ x: 8, z: -12 }, { x: 8, z: -23 }] },
  { id: 'bell-store', name: '铸钟废仓', zoneIndex: 2, center: { x: 72, z: -35 }, bounds: { minX: 65, maxX: 79, minZ: -42, maxZ: -28 }, path: [{ x: 72, z: -48 }, { x: 72, z: -39 }] },
];
export const INTEREST_POINTS = Object.freeze([
  Object.freeze({ id: 'burial-relic', name: '守墓者遗物', kind: 'relic', x: 8, z: -26, radius: 2.4, zoneIndex: 0, requiresReward: false,
    description: '取回遗物：本局技能基础伤害 +10，金币 +60。', reward: Object.freeze({ gold: 60, skillDamage: 10 }) }),
  Object.freeze({ id: 'forge-cache', name: '工坊补给箱', kind: 'supply', x: 72, z: -31, radius: 2.4, zoneIndex: 2, requiresReward: true,
    description: '打开补给箱：药水 +2，恢复 60 生命，金币 +50。', reward: Object.freeze({ gold: 50, potions: 2, heal: 60 }) }),
]);
const walkable = [
  ...ZONES.map((z, zoneIndex) => ({ id: z.id, kind: 'zone', zoneIndex, ...z.bounds })),
  ...corridors.flatMap(c => c.rects),
  ...alcoves.flatMap(a => [
    { id: a.id, kind: 'alcove', zoneIndex: a.zoneIndex, ...a.bounds },
    ...passage(`${a.id}-path`, a.zoneIndex, a.zoneIndex, a.path.map(p => [p.x, p.z]), 5).rects.map(r => ({ ...r, kind: 'alcove', zoneIndex: a.zoneIndex })),
  ]),
];

export const containsPoint = (r, x, z, inset = 0) => x >= r.minX + inset && x <= r.maxX - inset && z >= r.minZ + inset && z <= r.maxZ - inset;

// Partitioning the rectangle union gives its real outside edges. Internal room
// seams disappear, so a circular actor can pass across an overlapping doorway.
function exteriorEdges(rectangles) {
  const xs = [...new Set(rectangles.flatMap(r => [r.minX, r.maxX]))].sort((a, b) => a - b);
  const zs = [...new Set(rectangles.flatMap(r => [r.minZ, r.maxZ]))].sort((a, b) => a - b);
  const filled = xs.slice(1).map((x, i) => zs.slice(1).map((z, j) => rectangles.some(r => containsPoint(r, (xs[i] + x) / 2, (zs[j] + z) / 2))));
  const inside = (i, j) => filled[i]?.[j] === true;
  const edges = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    if (!inside(i, j)) continue;
    if (!inside(i - 1, j)) edges.push({ x1: xs[i], z1: zs[j], x2: xs[i], z2: zs[j + 1], normal: { x: -1, z: 0 } });
    if (!inside(i + 1, j)) edges.push({ x1: xs[i + 1], z1: zs[j], x2: xs[i + 1], z2: zs[j + 1], normal: { x: 1, z: 0 } });
    if (!inside(i, j - 1)) edges.push({ x1: xs[i], z1: zs[j], x2: xs[i + 1], z2: zs[j], normal: { x: 0, z: -1 } });
    if (!inside(i, j + 1)) edges.push({ x1: xs[i], z1: zs[j + 1], x2: xs[i + 1], z2: zs[j + 1], normal: { x: 0, z: 1 } });
  }
  const groups = new Map();
  for (const edge of edges) {
    const key = edge.normal.x ? `x:${edge.x1}:${edge.normal.x}` : `z:${edge.z1}:${edge.normal.z}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  }
  const merged = [];
  for (const group of groups.values()) {
    const vertical = group[0].normal.x !== 0;
    group.sort((a, b) => vertical ? a.z1 - b.z1 : a.x1 - b.x1);
    for (const edge of group) {
      const previous = merged.at(-1);
      if (previous && previous.normal.x === edge.normal.x && previous.normal.z === edge.normal.z && previous.x2 === edge.x1 && previous.z2 === edge.z1) {
        previous.x2 = edge.x2; previous.z2 = edge.z2;
      } else merged.push({ ...edge });
    }
  }
  return merged;
}

const colliderCache = new WeakMap();
function edgesFor(rectangles) {
  if (!colliderCache.has(rectangles)) colliderCache.set(rectangles, exteriorEdges(rectangles));
  return colliderCache.get(rectangles);
}

export const WORLD = Object.freeze({
  bounds: { minX: -23, maxX: 125, minZ: -114, maxZ: 19 },
  zones: ZONES, corridors, alcoves, interestPoints: INTEREST_POINTS, walkable, boundaries: edgesFor(walkable),
  spawn: { ...ZONES[0].entry },
});

export function isWalkable(x, z, radius = 0, rectangles = walkable) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !rectangles.some(r => containsPoint(r, x, z))) return false;
  if (radius <= 0) return true;
  const radiusSq = Math.max(0, radius - 1e-7) ** 2;
  return edgesFor(rectangles).every(e => {
    const px = Math.max(Math.min(e.x1, e.x2), Math.min(Math.max(e.x1, e.x2), x));
    const pz = Math.max(Math.min(e.z1, e.z2), Math.min(Math.max(e.z1, e.z2), z));
    return (px - x) ** 2 + (pz - z) ** 2 >= radiusSq;
  });
}

/** Swept substeps prevent dashes from jumping a wall; axis sliding keeps turns smooth. */
export function constrainMove(fromX, fromZ, toX, toZ, radius = 0.48, rectangles = walkable) {
  if (![fromX, fromZ, toX, toZ].every(Number.isFinite)) return { x: fromX, z: fromZ };
  const dx = toX - fromX, dz = toZ - fromZ;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / Math.min(0.2, Math.max(0.05, radius * 0.4))));
  let x = fromX, z = fromZ;
  for (let i = 0; i < steps; i++) {
    const nx = x + dx / steps, nz = z + dz / steps;
    if (isWalkable(nx, nz, radius, rectangles)) { x = nx; z = nz; continue; }
    if (isWalkable(nx, z, radius, rectangles)) x = nx;
    if (isWalkable(x, nz, radius, rectangles)) z = nz;
  }
  return { x, z };
}

export function canTravel(fromX, fromZ, toX, toZ, radius = 0, rectangles = walkable) {
  const length = Math.hypot(toX - fromX, toZ - fromZ);
  const steps = Math.max(1, Math.ceil(length / 0.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!isWalkable(fromX + (toX - fromX) * t, fromZ + (toZ - fromZ) * t, radius, rectangles)) return false;
  }
  return true;
}

export function zoneAt(x, z) { return ZONES.find(zone => containsPoint(zone.bounds, x, z)) ?? null; }

/** Exact same union, limited to visited areas and the newly opened passage. */
export function unlockedSurfaces(index, rewardTaken = false) {
  return walkable.filter(r => r.kind === 'corridor'
    ? r.from < index || (r.from === index && rewardTaken)
    : r.zoneIndex <= index);
}

// Navigation nodes sit in broad room centers and at passage bends. Edges are
// checked against the collision union, so pursuing foes cannot cut corners.
const navPoints = [
  ...ZONES.map(z => z.center),
  ...corridors.flatMap(c => c.path),
  ...alcoves.flatMap(a => [a.center, ...a.path]),
].filter((point, i, all) => all.findIndex(p => p.x === point.x && p.z === point.z) === i);
const navCache = new WeakMap();

export function navigationTarget(from, target, radius = 0.48, rectangles = walkable) {
  if (canTravel(from.x, from.z, target.x, target.z, radius, rectangles)) return target;
  let graphs = navCache.get(rectangles);
  if (!graphs) { graphs = new Map(); navCache.set(rectangles, graphs); }
  const key = Math.ceil(radius * 10) / 10;
  if (!graphs.has(key)) {
    const points = navPoints.filter(p => isWalkable(p.x, p.z, key, rectangles));
    const edges = points.map(() => []);
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      if (canTravel(points[i].x, points[i].z, points[j].x, points[j].z, key, rectangles)) {
        const d = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z);
        edges[i].push([j, d]); edges[j].push([i, d]);
      }
    }
    graphs.set(key, { points, edges });
  }
  const { points, edges } = graphs.get(key);
  const distance = points.map(() => Infinity), first = [], visited = new Set();
  for (let i = 0; i < points.length; i++) {
    if (canTravel(from.x, from.z, points[i].x, points[i].z, key, rectangles)) {
      distance[i] = Math.hypot(points[i].x - from.x, points[i].z - from.z); first[i] = points[i];
    }
  }
  while (visited.size < points.length) {
    let current = -1;
    for (let i = 0; i < points.length; i++) if (!visited.has(i) && Number.isFinite(distance[i]) && (current < 0 || distance[i] < distance[current])) current = i;
    if (current < 0) break;
    visited.add(current);
    for (const [next, cost] of edges[current]) if (distance[next] > distance[current] + cost) {
      distance[next] = distance[current] + cost; first[next] = first[current];
    }
  }
  let best = Infinity, result = from;
  for (let i = 0; i < points.length; i++) {
    if (!Number.isFinite(distance[i]) || !canTravel(points[i].x, points[i].z, target.x, target.z, key, rectangles)) continue;
    const cost = distance[i] + Math.hypot(points[i].x - target.x, points[i].z - target.z);
    if (cost < best) { best = cost; result = first[i]; }
  }
  return result;
}
