export interface MapRectFeature {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  kind: 'courtyard' | 'walkway' | 'lawn' | 'water' | 'uv_zone' | 'ramp';
}

export interface MapBuilding3D {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  minY: number;
  maxY: number;
  roofColor: string;
  wallNSColor: string;
  wallEWColor: string;
  hasWindows?: boolean;
  hasRoofProps?: boolean;
}

export interface MapDome3D {
  id: string;
  x: number;
  z: number;
  baseY: number;
  radius: number;
  height: number;
  color: string;
  shadeColor: string;
  isMinaret?: boolean;
}

export interface MapZiplineSpan {
  id: string;
  sx: number;
  sy: number;
  sz: number;
  ex: number;
  ey: number;
  ez: number;
}

export const AGRA_GROUND_FEATURES: MapRectFeature[] = [
  { id: 'yamuna', x: 0, z: -138, w: 260, d: 72, kind: 'water' },
  { id: 'courtyard', x: 0, z: -16, w: 126, d: 162, kind: 'courtyard' },
  // Charbagh Lawns
  { id: 'lawn_sw', x: -16.8, z: 8.5, w: 9.6, d: 36.0, kind: 'lawn' },
  { id: 'lawn_se', x: 16.8, z: 8.5, w: 9.6, d: 36.0, kind: 'lawn' },
  { id: 'lawn_nw', x: -16.8, z: -32.5, w: 9.6, d: 32.5, kind: 'lawn' },
  { id: 'lawn_ne', x: 16.8, z: -32.5, w: 9.6, d: 32.5, kind: 'lawn' },
  // Red-Sandstone Walkways & Cross-Paths
  { id: 'walk_w', x: -8.2, z: -10, w: 6.8, d: 92, kind: 'walkway' },
  { id: 'walk_e', x: 8.2, z: -10, w: 6.8, d: 92, kind: 'walkway' },
  { id: 'cross_s', x: 0, z: 30.0, w: 38, d: 5.2, kind: 'walkway' },
  { id: 'cross_m', x: 0, z: -13.0, w: 38, d: 5.2, kind: 'walkway' },
  { id: 'cross_n', x: 0, z: -52.0, w: 48, d: 6.5, kind: 'walkway' },
  // Reflecting Pool
  { id: 'pool', x: 0, z: -12, w: 8.8, d: 76, kind: 'water' },
  // Taj Mahal UV Safe Barrier Strip
  { id: 'uv_strip', x: 0, z: -51.6, w: 17.6, d: 1.4, kind: 'uv_zone' },
  // Wooden Parkour Ramps
  { id: 'ramp_l_fg', x: -6.8, z: 12.0, w: 2.8, d: 5.4, kind: 'ramp' },
  { id: 'ramp_l_mid', x: -6.8, z: -19.0, w: 2.8, d: 5.2, kind: 'ramp' },
  { id: 'ramp_se', x: 6.4, z: 10.5, w: 3.6, d: 2.2, kind: 'ramp' },
  { id: 'ramp_ne', x: 6.4, z: -27.5, w: 3.6, d: 2.2, kind: 'ramp' },
  { id: 'ramp_safehouse', x: -27.3, z: 33.9, w: 2.8, d: 5.6, kind: 'ramp' },
];

export const AGRA_BUILDINGS_3D: MapBuilding3D[] = [
  // Starting Overlook Terrace (South)
  {
    id: 'start_terrace',
    x: 0,
    z: 44,
    w: 14,
    d: 8,
    minY: 0,
    maxY: 1.6,
    roofColor: '#9b7b6c',
    wallNSColor: '#84594a',
    wallEWColor: '#6f483b',
  },
  // Pool Central Pavilion (Crate Bravo)
  {
    id: 'pool_pavilion',
    x: 0,
    z: -13,
    w: 6.2,
    d: 6.2,
    minY: 0,
    maxY: 0.9,
    roofColor: '#d7d1c6',
    wallNSColor: '#b9b1a3',
    wallEWColor: '#9d9588',
  },
  // Taj Mahal Chameli Farsh Lower Terrace
  {
    id: 'taj_chameli_farsh',
    x: 0,
    z: -77,
    w: 62,
    d: 42,
    minY: 0,
    maxY: 1.0,
    roofColor: '#996456',
    wallNSColor: '#804c3f',
    wallEWColor: '#6b3d32',
  },
  // Taj Mahal White Marble Plinth
  {
    id: 'taj_plinth',
    x: 0,
    z: -76.5,
    w: 50,
    d: 34,
    minY: 1.0,
    maxY: 3.0,
    roofColor: '#e7e2d9',
    wallNSColor: '#ccc5b8',
    wallEWColor: '#b5ada0',
  },
  // Taj Mahal Main Mausoleum Block
  {
    id: 'taj_mausoleum',
    x: 0,
    z: -76.5,
    w: 22.4,
    d: 20,
    minY: 3.0,
    maxY: 15.8,
    roofColor: '#f3efe8',
    wallNSColor: '#ded7cb',
    wallEWColor: '#c3bbb0',
    hasWindows: true,
  },
  // West Mosque & East Jawab Flanking Red Sandstone Pavilions
  {
    id: 'west_mosque',
    x: -36,
    z: -74,
    w: 11.4,
    d: 22,
    minY: 1.0,
    maxY: 9.6,
    roofColor: '#9d5849',
    wallNSColor: '#86473a',
    wallEWColor: '#6e372c',
    hasWindows: true,
  },
  {
    id: 'east_jawab',
    x: 36,
    z: -74,
    w: 11.4,
    d: 22,
    minY: 1.0,
    maxY: 9.6,
    roofColor: '#9d5849',
    wallNSColor: '#86473a',
    wallEWColor: '#6e372c',
    hasWindows: true,
  },
  // Agra Bazaar Safehouse Rooftop (Starting Spawn)
  {
    id: 'safehouse_rooftop',
    x: -27.5,
    z: 41.5,
    w: 11.0,
    d: 9.6,
    minY: 0,
    maxY: 4.2,
    roofColor: '#9b7b6c',
    wallNSColor: '#b58d72',
    wallEWColor: '#987259',
    hasWindows: true,
    hasRoofProps: true,
  },
  // 6 Parkour Bazaar Buildings (West & East Flanks)
  {
    id: 'bldg_w1',
    x: -27.5,
    z: 22,
    w: 10,
    d: 10,
    minY: 0,
    maxY: 4.0,
    roofColor: '#8a8d93',
    wallNSColor: '#b58d72',
    wallEWColor: '#987259',
    hasWindows: true,
    hasRoofProps: true,
  },
  {
    id: 'bldg_w2',
    x: -27.5,
    z: 3,
    w: 10,
    d: 12,
    minY: 0,
    maxY: 5.8,
    roofColor: '#8d9096',
    wallNSColor: '#ab7e62',
    wallEWColor: '#8e654b',
    hasWindows: true,
    hasRoofProps: true,
  },
  {
    id: 'bldg_w3',
    x: -27.5,
    z: -19,
    w: 10,
    d: 11,
    minY: 0,
    maxY: 4.4,
    roofColor: '#858a90',
    wallNSColor: '#6a8784',
    wallEWColor: '#546d6b',
    hasWindows: true,
    hasRoofProps: true,
  },
  {
    id: 'bldg_e1',
    x: 27.5,
    z: 23,
    w: 10,
    d: 10,
    minY: 0,
    maxY: 3.9,
    roofColor: '#858a90',
    wallNSColor: '#6a8784',
    wallEWColor: '#546d6b',
    hasWindows: true,
    hasRoofProps: true,
  },
  {
    id: 'bldg_e2',
    x: 27.5,
    z: 4,
    w: 10,
    d: 11,
    minY: 0,
    maxY: 5.5,
    roofColor: '#8d9096',
    wallNSColor: '#b58d72',
    wallEWColor: '#987259',
    hasWindows: true,
    hasRoofProps: true,
  },
  {
    id: 'bldg_e3',
    x: 27.5,
    z: -18,
    w: 10,
    d: 11,
    minY: 0,
    maxY: 4.3,
    roofColor: '#8a8d93',
    wallNSColor: '#ab7e62',
    wallEWColor: '#8e654b',
    hasWindows: true,
    hasRoofProps: true,
  },
  // Rooftop Bridges connecting Bazaar Buildings
  {
    id: 'bridge_w1',
    x: -27.5,
    z: 14.5,
    w: 2.6,
    d: 5.4,
    minY: 3.85,
    maxY: 4.2,
    roofColor: '#94a3b8',
    wallNSColor: '#64748b',
    wallEWColor: '#475569',
  },
  {
    id: 'bridge_w2',
    x: -27.5,
    z: -8.2,
    w: 2.6,
    d: 11.4,
    minY: 4.85,
    maxY: 5.2,
    roofColor: '#a67b56',
    wallNSColor: '#835c3b',
    wallEWColor: '#6c4b2f',
  },
  {
    id: 'bridge_e1',
    x: 27.5,
    z: 15.5,
    w: 2.6,
    d: 5.4,
    minY: 3.75,
    maxY: 4.1,
    roofColor: '#94a3b8',
    wallNSColor: '#64748b',
    wallEWColor: '#475569',
  },
  {
    id: 'bridge_e2',
    x: 27.5,
    z: -7.0,
    w: 2.6,
    d: 11.6,
    minY: 4.65,
    maxY: 5.0,
    roofColor: '#94a3b8',
    wallNSColor: '#64748b',
    wallEWColor: '#475569',
  },
  // Havildar Vikram's Watchtower at Taj UV Gate
  {
    id: 'watchtower',
    x: 11.8,
    z: -47.4,
    w: 3.6,
    d: 3.6,
    minY: 0,
    maxY: 6.55,
    roofColor: '#b9784d',
    wallNSColor: '#475569',
    wallEWColor: '#334155',
  },
  // Guarded East Market Alley Compound Walls
  {
    id: 'alley_wall_e',
    x: 43.5,
    z: 6,
    w: 1.4,
    d: 16,
    minY: 0,
    maxY: 3.4,
    roofColor: '#a56756',
    wallNSColor: '#8b4e3e',
    wallEWColor: '#723d30',
  },
  {
    id: 'alley_wall_n',
    x: 37,
    z: -2,
    w: 14,
    d: 1.4,
    minY: 0,
    maxY: 3.4,
    roofColor: '#a56756',
    wallNSColor: '#8b4e3e',
    wallEWColor: '#723d30',
  },
  {
    id: 'alley_wall_s',
    x: 39.5,
    z: 14,
    w: 8,
    d: 1.4,
    minY: 0,
    maxY: 3.4,
    roofColor: '#a56756',
    wallNSColor: '#8b4e3e',
    wallEWColor: '#723d30',
  },
  // Perimeter Sandstone Walls (condensed for clean map frame)
  {
    id: 'perim_s',
    x: 0,
    z: 52,
    w: 94,
    d: 2.0,
    minY: 0,
    maxY: 4.2,
    roofColor: '#9b6354',
    wallNSColor: '#7e4a3d',
    wallEWColor: '#663a2f',
  },
  {
    id: 'perim_w',
    x: -46,
    z: -20,
    w: 2.0,
    d: 146,
    minY: 0,
    maxY: 4.2,
    roofColor: '#9b6354',
    wallNSColor: '#7e4a3d',
    wallEWColor: '#663a2f',
  },
  {
    id: 'perim_e',
    x: 46,
    z: -20,
    w: 2.0,
    d: 146,
    minY: 0,
    maxY: 4.2,
    roofColor: '#9b6354',
    wallNSColor: '#7e4a3d',
    wallEWColor: '#663a2f',
  },
];

export const AGRA_DOMES_3D: MapDome3D[] = [
  // Central Taj Mahal Onion Dome
  {
    id: 'taj_main_dome',
    x: 0,
    z: -76.5,
    baseY: 15.8,
    radius: 6.2,
    height: 12.6,
    color: '#faf7f2',
    shadeColor: '#d8d0c4',
  },
  // 4 Taj Corner Minarets
  {
    id: 'minaret_sw',
    x: -21.2,
    z: -61.8,
    baseY: 3.0,
    radius: 1.85,
    height: 24.5,
    color: '#f2ede4',
    shadeColor: '#cbc3b6',
    isMinaret: true,
  },
  {
    id: 'minaret_se',
    x: 21.2,
    z: -61.8,
    baseY: 3.0,
    radius: 1.85,
    height: 24.5,
    color: '#f2ede4',
    shadeColor: '#cbc3b6',
    isMinaret: true,
  },
  {
    id: 'minaret_nw',
    x: -21.2,
    z: -91.2,
    baseY: 3.0,
    radius: 1.85,
    height: 24.5,
    color: '#f2ede4',
    shadeColor: '#cbc3b6',
    isMinaret: true,
  },
  {
    id: 'minaret_ne',
    x: 21.2,
    z: -91.2,
    baseY: 3.0,
    radius: 1.85,
    height: 24.5,
    color: '#f2ede4',
    shadeColor: '#cbc3b6',
    isMinaret: true,
  },
  // West Mosque & East Jawab Marble Domes
  {
    id: 'mosque_dome',
    x: -36,
    z: -74,
    baseY: 9.6,
    radius: 3.2,
    height: 4.5,
    color: '#f2ede4',
    shadeColor: '#cbc3b6',
  },
  {
    id: 'jawab_dome',
    x: 36,
    z: -74,
    baseY: 9.6,
    radius: 3.2,
    height: 4.5,
    color: '#f2ede4',
    shadeColor: '#cbc3b6',
  },
];

export const AGRA_ZIPLINES: MapZiplineSpan[] = [
  { id: 'zip_south_bazaar', sx: -23.0, sy: 4.0, sz: 21.5, ex: 23.0, ey: 3.9, ez: 22.5 },
  { id: 'zip_pool_cross', sx: -23.0, sy: 5.8, sz: 3.0, ex: 22.2, ey: 5.5, ez: 4.0 },
  { id: 'zip_mid_diagonal', sx: -23.2, sy: 5.8, sz: -1.5, ex: 23.2, ey: 4.3, ez: -16.5 },
  { id: 'zip_east_to_taj', sx: 25.0, sy: 4.3, sz: -22.5, ex: 4.5, ey: 1.0, ez: -51.0 },
  { id: 'zip_west_to_taj', sx: -25.0, sy: 4.4, sz: -23.0, ex: -4.5, ey: 1.0, ez: -51.0 },
];

// Navigation Graph along Agra Walkways, Bridges, Ramps & Alley Entrances for Realistic GPS Routing
interface NavNode {
  x: number;
  z: number;
  neighbors: number[];
}

const NAV_NODES: NavNode[] = [
  { x: 0, z: 30, neighbors: [1, 2] }, // 0: South Cross Center
  { x: -8.2, z: 30, neighbors: [0, 3, 12] }, // 1: SW Walkway
  { x: 8.2, z: 30, neighbors: [0, 4, 15] }, // 2: SE Walkway
  { x: -8.2, z: 12, neighbors: [1, 5, 13] }, // 3: W Mid-South Walkway
  { x: 8.2, z: 12, neighbors: [2, 6, 16] }, // 4: E Mid-South Walkway
  { x: -8.2, z: -13, neighbors: [3, 7, 11] }, // 5: W Pool Cross
  { x: 8.2, z: -13, neighbors: [4, 8, 11, 17] }, // 6: E Pool Cross
  { x: -8.2, z: -32, neighbors: [5, 9] }, // 7: NW Walkway
  { x: 8.2, z: -32, neighbors: [6, 10] }, // 8: NE Walkway
  { x: -8.2, z: -51.5, neighbors: [7, 19] }, // 9: NW Taj Gate Approach
  { x: 8.2, z: -51.5, neighbors: [8, 19] }, // 10: NE Taj Gate Approach
  { x: 0, z: -13, neighbors: [5, 6] }, // 11: Pool Pavilion (Crate Bravo)
  { x: -21, z: 30, neighbors: [1, 13] }, // 12: SW Bazaar Alley
  { x: -21, z: 12, neighbors: [3, 12, 14] }, // 13: W2 Roof Access
  { x: -27.5, z: 3, neighbors: [13] }, // 14: W2 Rooftop (Crate Alpha)
  { x: 21, z: 30, neighbors: [2, 16] }, // 15: SE Bazaar Alley
  { x: 21, z: 12, neighbors: [4, 15, 18] }, // 16: E Market Approach
  { x: 21, z: -13, neighbors: [6, 18] }, // 17: NE Alley Approach
  { x: 35.5, z: 6.5, neighbors: [16, 17] }, // 18: East Market Alley (Crate Charlie)
  { x: 0, z: -51.6, neighbors: [9, 10] }, // 19: Taj UV Safe House Gate
];

function findNearestNavNode(x: number, z: number): number {
  let bestIdx = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < NAV_NODES.length; i++) {
    const dx = NAV_NODES[i].x - x;
    const dz = NAV_NODES[i].z - z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function computeAgraGpsRoute(
  px: number,
  pz: number,
  tx: number,
  tz: number,
): Array<{ x: number; z: number }> {
  const directDist = Math.hypot(tx - px, tz - pz);
  if (directDist < 12) {
    return [
      { x: px, z: pz },
      { x: tx, z: tz },
    ];
  }

  const startIdx = findNearestNavNode(px, pz);
  const goalIdx = findNearestNavNode(tx, tz);

  if (startIdx === goalIdx) {
    return [
      { x: px, z: pz },
      { x: NAV_NODES[startIdx].x, z: NAV_NODES[startIdx].z },
      { x: tx, z: tz },
    ];
  }

  const n = NAV_NODES.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  dist[startIdx] = 0;

  for (let step = 0; step < n; step++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1 || u === goalIdx) break;
    visited[u] = 1;

    const uNode = NAV_NODES[u];
    for (let j = 0; j < uNode.neighbors.length; j++) {
      const v = uNode.neighbors[j];
      if (visited[v]) continue;
      const vNode = NAV_NODES[v];
      const w = Math.hypot(vNode.x - uNode.x, vNode.z - uNode.z);
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        prev[v] = u;
      }
    }
  }

  const chain: Array<{ x: number; z: number }> = [];
  let cur = goalIdx;
  while (cur !== -1) {
    chain.push({ x: NAV_NODES[cur].x, z: NAV_NODES[cur].z });
    cur = prev[cur];
  }
  chain.reverse();

  // Prune redundant first/last node if already closer to the next waypoint
  if (chain.length >= 2) {
    const d0 = Math.hypot(chain[0].x - px, chain[0].z - pz);
    const d1 = Math.hypot(chain[1].x - px, chain[1].z - pz);
    if (d1 < d0 + 4) {
      chain.shift();
    }
  }

  return [{ x: px, z: pz }, ...chain, { x: tx, z: tz }];
}
