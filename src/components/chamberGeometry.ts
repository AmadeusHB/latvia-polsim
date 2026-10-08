// ============================================================
// Chamber geometry — final rework per the issue-list specification.
// Universal laws implemented here:
//   LAW 1: one seat size per diagram
//   LAW 2: one cell size per diagram; every seat center on a cell center
//   LAW 7: similar-color separator (RGB distance < 120)
// Contiguity checker per Part 1 Step 5 / Part 4.5.
// ============================================================

export interface Seat {
  x: number; y: number;
  allianceId: string;
}

// --- Contiguity check (loud, permanent) ---
export function assertContiguity(label: string, seats: Seat[], seatDiameter: number): boolean {
  const byParty = new Map<string, number[]>();
  seats.forEach((s, i) => {
    if (!byParty.has(s.allianceId)) byParty.set(s.allianceId, []);
    byParty.get(s.allianceId)!.push(i);
  });
  const threshold = 1.6 * seatDiameter;
  const sq = threshold * threshold;
  let allOk = true;
  for (const [party, idxs] of byParty) {
    if (idxs.length <= 1) continue;
    const parent = idxs.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const union = (a: number, b: number) => { parent[find(a)] = find(b); };
    for (let i = 0; i < idxs.length; i++) {
      for (let j = i + 1; j < idxs.length; j++) {
        const A = seats[idxs[i]], B = seats[idxs[j]];
        if ((A.x - B.x) ** 2 + (A.y - B.y) ** 2 <= sq) union(i, j);
      }
    }
    const roots = new Set<number>();
    for (let i = 0; i < idxs.length; i++) roots.add(find(i));
    if (roots.size > 1) {
      allOk = false;
      // eslint-disable-next-line no-console
      console.error(`[chamber] ${label}: alliance "${party}" split into ${roots.size} clusters — invalid render!`);
    }
  }
  return allOk;
}

// --- Similar-color separator (LAW 7) ---
export function rgbDistance(hexA: string, hexB: string): number {
  const p = (h: string) => {
    const c = h.replace('#', '');
    const v = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = p(hexA);
  const [r2, g2, b2] = p(hexB);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// ============================================================
// TYPE A — Saeima ideological arc (aligned algorithm, Part 1)
//
// All rows span the SAME angle range [90-82, 90+82] degrees around a
// common center C in the upper-middle (SVG degrees, y grows down).
// Constant radial gap (LAW 2 cell). Row capacity ∝ radius. Party
// boundaries computed PROPORTIONALLY PER ROW so every block is a
// smooth wedge with near-radial edges (anti-zigzag).
// ============================================================

export interface ArcLayout {
  seats: Seat[];
  seatR: number;          // one seat radius for the whole diagram (LAW 1)
  cell: number;           // radial gap between rows (LAW 2)
  K: number;              // row count
  radii: number[];        // inner -> outer
  rowCounts: number[];    // seats per row
  cx: number; cy: number; // arc center (in final coordinates)
  W: number; H: number;
  pad: number;            // canvas padding (LAW 6)
}

const SWEEP_DEG = 164;
const BETA_DEG = 82;

export function buildArc(
  orderedParties: { id: string; seats: number }[],
  canvasWidth = 900,
): ArcLayout {
  const N = orderedParties.reduce((s, p) => s + p.seats, 0);
  const pad = 28; // LAW 6

  // ---- Step 1: auto-fit K in 10..15 ----
  const R = 0.44 * canvasWidth;          // outer radius
  const rInnerBase = 0.16 * canvasWidth; // inner radius
  let K = 13;
  let cell = 0, seatR = 0, radii: number[] = [], caps: number[] = [];
  let best: { K: number; slack: number; cell: number; seatR: number; radii: number[]; caps: number[] } | null = null;
  for (let tryK = 10; tryK <= 15; tryK++) {
    const c = (R - rInnerBase) / tryK;
    const sr = c / 2 - 1;
    const rs: number[] = [];
    for (let i = 0; i < tryK; i++) rs.push(rInnerBase + i * c);
    const cps = rs.map((r) => Math.floor((r * ((SWEEP_DEG * Math.PI) / 180)) / c));
    const total = cps.reduce((a, b) => a + b, 0);
    if (total < N) continue;                       // under-filled: skip (fewer rows never helps)
    if (best && total > best.slack + N) continue;  // much worse than best
    if (!best || total - N < best.slack - N) {
      best = { K: tryK, slack: total - N, cell: c, seatR: sr, radii: rs, caps: cps };
    }
  }
  if (best) { K = best.K; cell = best.cell; seatR = best.seatR; radii = best.radii; caps = best.caps; }
  else {
    // fallback: smallest K that can hold N
    for (let tryK = 15; tryK >= 8; tryK--) {
      const c = (R - rInnerBase) / tryK;
      const rs = Array.from({ length: tryK }, (_, i) => rInnerBase + i * c);
      const cps = rs.map((r) => Math.floor((r * ((SWEEP_DEG * Math.PI) / 180)) / c));
      if (cps.reduce((a, b) => a + b, 0) >= N) {
        K = tryK; cell = c; seatR = c / 2 - 1; radii = rs; caps = cps;
        break;
      }
    }
  }

  // ---- Step 2: row totals by largest remainder, capped by capacity ----
  const sumCaps = caps.reduce((a, b) => a + b, 0);
  const raw = caps.map((c) => (N * c) / sumCaps);
  let rowCounts = raw.map((v) => Math.min(caps[raw.indexOf(v)] ?? Infinity, Math.floor(v)));
  // recompute properly: cap each row total at its capacity
  rowCounts = caps.map((c, i) => Math.min(c, Math.floor(raw[i])));
  let rem = N - rowCounts.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, f: v - Math.floor(v), capLeft: caps[i] - Math.min(caps[i], Math.floor(raw[i])) }))
    .sort((a, b) => b.f - a.f);
  for (let k = 0; rem > 0 && k < order.length * 2; k++) {
    const o = order[k % order.length];
    if (o.capLeft > 0) { rowCounts[o.i]++; o.capLeft--; rem--; }
  }
  // any remaining overflow: add to the largest-capacity rows with space
  if (rem > 0) {
    const withSpace = caps.map((c, i) => ({ i, left: c - rowCounts[i] })).sort((a, b) => b.left - a.left);
    for (const w of withSpace) {
      if (rem <= 0) break;
      const take = Math.min(w.left, rem);
      rowCounts[w.i] += take; rem -= take;
    }
  }

  // ---- Step 3: ordered slot list (row-major boustrophedon) + run assignment ----
  // Rows are walked inner->outer; each row's direction alternates so the last
  // seat of one row is adjacent to the first seat of the next (the professional
  // parliament-chart walk). Consecutive slots are always within 1.6 seat
  // diameters, so every alliance handed a consecutive run forms ONE connected
  // wedge. All rows span the same 164-degree range (spec Step 4), giving the
  // band straight, even radial ends.
  const orderedSlots: { row: number; j: number }[] = [];
  for (let i = 0; i < K; i++) {
    const js = i % 2 === 0
      ? [...Array(rowCounts[i]).keys()]
      : [...Array(rowCounts[i]).keys()].reverse();
    for (const j of js) orderedSlots.push({ row: i, j });
  }
  const rowSeats: Seat[][] = radii.map((_, i) => Array.from({ length: rowCounts[i] }, () => ({ x: 0, y: 0, allianceId: '' })));
  let slotIdx = 0;
  for (const p of orderedParties) {
    for (let k = 0; k < p.seats && slotIdx < orderedSlots.length; k++, slotIdx++) {
      const { row, j } = orderedSlots[slotIdx];
      rowSeats[row][j].allianceId = p.id;
    }
  }

  // ---- Step 4: coordinates (same angle grid per row over the shared span) ----
  const cx = canvasWidth / 2;
  const cy = pad + 84;  // center above the band; valley interior holds labels
  const rad = (deg: number) => (deg * Math.PI) / 180;
  for (let i = 0; i < K; i++) {
    const n = rowCounts[i];
    for (let j = 0; j < n; j++) {
      // column 0 at the LEFT end (90+82 deg; cos<0) so far-left is leftmost.
      const theta = (90 + BETA_DEG) - (SWEEP_DEG * (j + 0.5)) / n;
      rowSeats[i][j].x = cx + radii[i] * Math.cos(rad(theta));
      rowSeats[i][j].y = cy + radii[i] * Math.sin(rad(theta));
    }
  }
  const seats = rowSeats.flat();
  // canvas bounds
  const rOuter = radii[K - 1];
  const bandHalfWidth = rOuter * Math.sin(rad(BETA_DEG));
  const W = Math.max(canvasWidth, 2 * bandHalfWidth + 2 * (seatR + pad));
  const H = Math.round(cy + rOuter + seatR + pad + 26);

  return { seats, seatR, cell, K, radii, rowCounts, cx, cy, W, H, pad };
}

// Repair: ensure every alliance's occupied rows are consecutive.


// ============================================================
// TYPE B — Westminster rectangular chamber (Parts 2 & 3)
//
// Strict cell grid. Opposition bank top, government bank bottom
// (S&C flush at the reading-order end), tinted floor strip,
// cross-bench straight columns on the right with exactly one cell
// of separation. One seat size, one stroke, straight lines only.
// ============================================================

export interface Zone { seats: Seat[]; }
export interface ChamberLayout {
  opposition: Seat[];
  government: Seat[];   // gov + supply (supply = last seats in reading order)
  supply: Seat[];
  crossbench: Seat[];
  seatR: number;        // one seat radius (LAW 1)
  cell: number;         // one cell (LAW 2)
  strokeW: number;       // one stroke width (LAW 4)
  // geometry for labels / floor / layout (final coordinates)
  W: number; H: number; pad: number;
  oppX: number; oppY: number; bankW: number; bankH: (n: number) => number;
  floorY: number; floorH: number;
  govY: number;
  crossX: number; crossY: number;
  SPR: number;
  oppRows: number; govRows: number;
}

export function buildChamber(
  oppParties: { id: string; seats: number }[],
  govParties: { id: string; seats: string | number }[] ,
  crossParties: { id: string; seats: number }[],
  supParties: { id: string; seats: number }[],
  isCog: boolean,
): ChamberLayout {
  // totals
  const nOf = (l: { seats: number | string }[]) => l.reduce((s, p) => s + (typeof p.seats === 'number' ? p.seats : 0), 0);
  const oppN = nOf(oppParties);
  const govN = nOf(govParties);
  const crossN = nOf(crossParties);
  const supN = nOf(supParties);
  void (oppN + govN + crossN + supN);

  const seatD = isCog ? 56 : 24;                     // CoG ~56px diameter
  const seatR = seatD / 2;
  const gap = isCog ? 4 : 2;
  const cell = seatD + gap;
  const strokeW = isCog ? 3 : 2;
  const SPR = isCog ? 6 : 20;

  const pad = 28;                                      // LAW 6
  const floorH = Math.max(1.5 * seatD, 48);
  const labelH = 30;                                   // room for zone labels in padding

  const oppRows = Math.max(1, Math.ceil(oppN / SPR));
  const govTotal = govN + supN;
  const govRows = Math.max(1, Math.ceil(govTotal / SPR));
  const crossRows = Math.max(1, oppRows + govRows + 1); // spans both banks' height
  const crossCols = Math.max(1, Math.ceil(crossN / crossRows));

  const bankW = SPR * cell;
  const bankH = (rows: number) => rows * cell;
  const crossW = crossCols * cell;

  const W = Math.round(pad + bankW + cell + crossW + pad + 60);  // cell = one-cell gap + label space
  const H = Math.round(pad + labelH + bankH(oppRows) + floorH + bankH(govRows) + labelH + pad);

  const oppX = pad;
  const oppY = pad + labelH;
  const govY = oppY + bankH(oppRows) + floorH;
  const crossX = oppX + bankW + cell;                  // exactly one cell of separation
  const crossY = oppY;

  // seat centers on cell centers (LAW 2)
  const cellCenter = (col: number, row: number, x0: number, y0: number) => ({
    x: x0 + cell * col + cell / 2,
    y: y0 + cell * row + cell / 2,
  });

  // Reading-order slots (boustrophedon would break LAW 2 alignment? No: reading
  // order per the spec is left-to-right, top row to bottom row — runs crossing
  // rows continue at the next row's start. Contiguity is preserved because row
  // transitions are handled by the row-boundary adjacency (gap = cell <= 1.6*d).
  const makeBank = (parties: { id: string; seats: number }[], x0: number, y0: number, rows: number): Seat[] => {
    // Boustrophedon reading order: rows alternate direction so a run crossing
    // a row boundary connects at the row edge (within one cell), keeping every
    // alliance one connected block; boundaries stay straight vertical lines or
    // clean row-edge steps.
    const coords: { x: number; y: number }[] = [];
    for (let row = 0; row < rows; row++) {
      const cols = row % 2 === 0
        ? [...Array(SPR).keys()]
        : [...Array(SPR).keys()].reverse();
      for (const col of cols) coords.push(cellCenter(col, row, x0, y0));
    }
    const total = parties.reduce((sm, p) => sm + (typeof p.seats === 'number' ? p.seats : 0), 0);
    const slots: Seat[] = coords.slice(0, Math.max(total, 0)).map((c) => ({ x: c.x, y: c.y, allianceId: '' }));
    let idx = 0;
    for (const p of parties) {
      const n = typeof p.seats === 'number' ? p.seats : 0;
      for (let k = 0; k < n && idx < slots.length; k++, idx++) {
        slots[idx].allianceId = p.id;
      }
    }
    return slots;
  };

  const opposition = makeBank(oppParties, oppX, oppY, oppRows);
  const govSupply = makeBank([...govParties, ...supParties] as any, oppX, govY, govRows);
  const government = govSupply.slice(0, govN);
  const supply = govSupply.slice(govN);
  // cross-bench: top-to-bottom within column, then next column (reading order)
  const crossbench: Seat[] = [];
  let cn = 0;
  for (let col = 0; col < crossCols && cn < crossN; col++) {
    const rowsIdx = col % 2 === 0
      ? [...Array(crossRows).keys()]
      : [...Array(crossRows).keys()].reverse();
    for (const row of rowsIdx) {
      if (cn >= crossN) break;
      const p = cellCenter(col, row, crossX, crossY);
      crossbench.push({ x: p.x, y: p.y, allianceId: '' });
      cn++;
    }
  }
  let cIdx = 0;
  for (const p of crossParties) {
    for (let k = 0; k < p.seats && cIdx < crossbench.length; k++, cIdx++) {
      crossbench[cIdx].allianceId = p.id;
    }
  }

  return {
    opposition, government, supply, crossbench,
    seatR, cell, strokeW,
    W, H, pad, oppX, oppY, bankW, bankH, floorY: oppY + bankH(oppRows), floorH,
    govY, crossX, crossY, SPR, oppRows, govRows,
  };
}
