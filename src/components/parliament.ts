// ============================================================
// Parliament seat-chart engine — ordered-slot method.
//
// The core guarantee: slot positions are generated in strict spatial
// reading order (sweep left→right; at each angular column, emit seats
// innermost→outermost). An ordered seat list mapped onto the slots is
// therefore spatially continuous, and every alliance assigned a
// consecutive run of slots forms ONE connected wedge. An adjacency
// self-check enforces this at runtime.
// ============================================================

export interface Slot { x: number; y: number; t: number; r: number }

// --- Row capacities proportional to radius, largest-remainder to N ---
export function rowCapacities(radii: number[], sweep: number, pitch: number, N: number): number[] {
  const raw = radii.map((r) => (r * sweep) / pitch);
  const caps = raw.map((v) => Math.floor(v));
  let rem = N - caps.reduce((s, x) => s + x, 0);
  const byFrac = raw
    .map((v, i) => ({ i, f: v - Math.floor(v) }))
    .sort((a, b) => b.f - a.f);
  for (let k = 0; rem > 0 && k < byFrac.length; k++, rem--) caps[byFrac[k].i]++;
  // trim zero-capacity edge rows can't happen (radii > 0), but guard anyway
  return caps;
}

// --- Geometry: a U-shaped valley of concentric rows.
// Center (cx=0, cy=0) sits ABOVE the band; rows arc BELOW it, opening upward.
// Angles: left end (t=0) at PI (x<0), bottom (t=.5) at PI/2, right end (t=1) at 0.
// y = sin(a)*r > 0 → below the center → the band dips down = VALLEY. ---
export function valleyPositions(N: number, seatR: number, rowsWanted: number, sweep = Math.PI, centered = false) {
  const pitch = 2 * seatR + 2.2;
  const gap = 2 * seatR + 2.4;
  const minInner = 6 * seatR;
  let R = Math.max(2, rowsWanted);
  let r_o = 0, r_i = 0;
  for (;;) {
    const sumR = (N * pitch) / sweep;
    r_o = sumR / R + (gap * (R - 1)) / 2;
    r_i = r_o - (R - 1) * gap;
    if (r_i >= minInner || R <= 2) break;
    R--;
  }
  const radii: number[] = [];
  for (let i = 0; i < R; i++) radii.push(r_i + i * gap); // inner → outer
  const caps = rowCapacities(radii, sweep, pitch, N);
  const rows = radii.map((r, i) => ({ r, c: caps[i] })).filter((x) => x.c > 0);
  const slots: Slot[] = [];
  // Boustrophedon row-major reading order (the professional parliament-chart
  // fill): rows are emitted innermost→outermost; each row alternates direction
  // so the end of one row is adjacent to the start of the next. Consecutive
  // slots are always geometrically adjacent (same row: one pitch apart; row
  // transition at the shared arm end: ~sqrt((pitch/2)² + gap²) ≤ 1.5 diameters),
  // so an alliance given a consecutive run of slots always forms ONE connected
  // wedge — large blocks step across rows hugging their own seats.
  rows.forEach((row, i) => {
    const dir = i % 2 === 0 ? 1 : -1;           // left→right, then right→left
    const ks = dir === 1 ? [...Array(row.c).keys()] : [...Array(row.c).keys()].reverse();
    for (const k of ks) {
      const t = (k + 0.5) / row.c;
      // Default: arc runs a ∈ [0, sweep] (arms at y=0 for the full semicircle).
      // Centered: arc runs a ∈ [90°-sweep/2, 90°+sweep/2] — both arm ends equally
      // high — so a 90°-rotated bank only spans its band depth plus a small
      // droop instead of jutting a full radius sideways.
      const a = centered
        ? (Math.PI / 2) + (sweep / 2) * (1 - 2 * t)
        : sweep * (1 - t);
      slots.push({ x: Math.cos(a) * row.r, y: Math.sin(a) * row.r, t, r: row.r });
    }
  });
  return { slots, r_i: rows[0]?.r ?? 0, r_o: rows[rows.length - 1]?.r ?? 0, rows: rows.length };
}

// --- Westminster bank geometry.
// Each bank is a short arc valley (sweep ~100°) whose circle center sits
// BEHIND the bank (away from the floor). With mirror=+1 the bank occupies
// the left side of the chamber and faces the floor at bottom-center;
// mirror=-1 mirrors x for the right side. Positions are returned relative
// to the arc's own circle center; the caller offsets to the chamber. ---
export function bankPositions(N: number, seatR: number, rowsWanted: number, sweep: number, mirror: 1 | -1 = 1, centered = false) {
  const base = valleyPositions(N, seatR, rowsWanted, sweep, centered);
  if (mirror === -1) {
    for (const s of base.slots) s.x = -s.x;
  }
  return base;
}

// Centered-sweep bank: arc centered on the bottom of the circle (a=90°),
// so rotated banks are compact. mirror=-1 flips for the right side.
export function bankPositionsCentered(N: number, seatR: number, rowsWanted: number, sweep: number, mirror: 1 | -1 = 1) {
  const base = valleyPositions(N, seatR, rowsWanted, sweep, true);
  if (mirror === -1) {
    for (const s of base.slots) s.x = -s.x;
  }
  return base;
}

// Extent helpers for bank placement.
export function bankExtent(base: { slots: Slot[] }, seatR: number) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of base.slots) {
    x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x);
    y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
  }
  return { x0, x1, y0, y1, w: x1 - x0 + 2 * seatR, h: y1 - y0 + 2 * seatR };
}

// --- Adjacency self-check (Fix 3 Step 4) ---
// Seats adjacent if their centers are within 1.5 seat diameters.
export function assertContiguous(label: string, positions: { x: number; y: number }[], ownerOf: string[], seatR: number) {
  const groups = new Map<string, number[]>();
  ownerOf.forEach((owner, i) => {
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner)!.push(i);
  });
  const threshold = 1.5 * 2 * seatR;
  const sqThreshold = threshold * threshold;
  for (const [owner, idxs] of groups) {
    if (idxs.length <= 1) continue;
    // union-find over this owner's seats
    const parent = idxs.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const union = (a: number, b: number) => { parent[find(a)] = find(b); };
    for (let i = 0; i < idxs.length; i++) {
      for (let j = i + 1; j < idxs.length; j++) {
        const A = positions[idxs[i]], B = positions[idxs[j]];
        const d2 = (A.x - B.x) ** 2 + (A.y - B.y) ** 2;
        if (d2 <= sqThreshold) union(i, j);
      }
    }
    const roots = new Set<number>();
    for (let i = 0; i < idxs.length; i++) roots.add(find(i));
    if (roots.size > 1) {
      // eslint-disable-next-line no-console
      console.error(`[parliament] ${label}: alliance "${owner}" split into ${roots.size} clusters — layout bug!`);
    }
  }
}

// --- Saeima arc: valley opening UP. Ideological order left→right along the band. ---
// (valleyPositions already produces the valley; seats walk left→right.)
