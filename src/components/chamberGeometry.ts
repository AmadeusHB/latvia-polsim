// ============================================================
// Chamber geometry engine — written to the diagram specification.
//
// Two diagram types share these building blocks:
//   - ordered slot lists (consecutive slots are spatially adjacent),
//   - run assignment (an alliance gets one consecutive run => one block),
//   - a contiguity check that runs after every placement.
// ============================================================

export interface Slot { x: number; y: number; }

// --- RUN ASSIGNMENT (spec Part 1) ---
// parties: array of { id, seats } in display order. Returns slots per party id.
export function assignRuns(orderedSlots: Slot[], parties: { id: string; seats: number }[]): Map<string, Slot[]> {
  const result = new Map<string, Slot[]>();
  let index = 0;
  for (const p of parties) {
    result.set(p.id, orderedSlots.slice(index, index + p.seats));
    index += p.seats;
  }
  return result;
}

// --- CONTIGUITY CHECK (spec Part 1) ---
// Seats of one party must form a single connected component under the
// "centers within 1.6 * seatDiameter" adjacency rule. Loud on failure.
export function assertContiguity(label: string, seats: { x: number; y: number; partyId: string }[], seatDiameter: number) {
  const byParty = new Map<string, number[]>();
  seats.forEach((s, i) => {
    if (!byParty.has(s.partyId)) byParty.set(s.partyId, []);
    byParty.get(s.partyId)!.push(i);
  });
  const threshold = 1.6 * seatDiameter;
  const sq = threshold * threshold;
  for (const [party, idxs] of byParty) {
    if (idxs.length <= 1) continue; // single seat trivially passes
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
      // eslint-disable-next-line no-console
      console.error(`[chamber] ${label}: party "${party}" split into ${roots.size} clusters — invalid render!`);
    }
  }
}

// ============================================================
// TYPE A — ideological arc valley (spec Part 2)
//
// SVG coordinates: x right, y DOWN. Common center C in the upper-middle.
// Rows are arcs around C spanning angles [90-beta, 90+beta] (degrees),
// beta = 82. A point at angle theta (degrees): x = cx + r*cos(theta),
// y = cy + r*sin(theta). theta=90 is the row's lowest point (below C);
// the ends sit nearly level with C => a valley opening UP.
// ============================================================

export interface ArcLayout {
  slots: Slot[];            // ordered left→right, column by column
  seatR: number;            // seat radius
  radii: number[];          // r[1..K], inner → outer
  rowCounts: number[];      // seats per row, inner → outer
  cx: number; cy: number;   // common center (for labels)
  W: number; H: number;
}

export function buildValley(N: number, K = 13, betaDeg = 82): ArcLayout {
  const sweep = 164; // degrees
  const rad = (deg: number) => (deg * Math.PI) / 180;
  // Start from a nominal width; iterate the seat radius until capacity fits N.
  // Size the seats so 301 slots fit a band whose outer width ≈ targetWidth.
  // The outer row's width is 2 * r_outer * cos(beta complement); we iterate
  // the seat radius until capacity fits N with the radii implied by that size.
  const targetWidth = 900;
  const s = Math.sin(rad(betaDeg));
  let sr = 7.5;
  let r1 = 0, radii: number[] = [], counts: number[] = [], total = 0;
  let iter = 0;
  for (;;) {
    const g = 2 * sr + 2;
    // outer radius fixed by target width: W = 2 * r_outer * cos(90-beta-... )
    // end angle from vertical: the row end sits at angle 90-beta from
    // straight-down, i.e. its horizontal reach is r*cos(beta) with the row's
    // half-width = r*cos(90-beta)=r*sin(beta). Outer half-width = r_outer*sin(beta).
    const rOuter = (targetWidth / 2) / s;
    r1 = rOuter - (K - 1) * g;
    if (r1 < g) { sr *= 0.95; continue; }   // band too thick: shrink seats
    radii = [];
    for (let i = 0; i < K; i++) radii.push(r1 + i * g);
    const L = radii.map((r) => r * rad(sweep));
    const cap = L.map((l) => l / (2 * sr + 2));
    total = cap.reduce((a, b) => a + b, 0);
    if (total < N) { sr *= 0.95; }            // too few slots: shrink seats
    else if (total > N * 1.05) { sr *= 1.05; } // too much slack: grow seats
    else break;
    if (++iter > 80) break;                   // safety
  }
  // exact per-row counts by largest remainder, proportional to arc length
  const L = radii.map((r) => r * rad(sweep));
  const raw = L.map((l) => (N * l) / L.reduce((a, b) => a + b, 0));
  counts = raw.map((v) => Math.floor(v));
  let rem = N - counts.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f);
  for (let k = 0; rem > 0 && k < order.length; k++, rem--) counts[order[k].i]++;
  // center point: in the upper-middle, inside the U
  const rOuter = radii[K - 1];
  const bandBottom = rOuter;               // theta=90 lowest point: cy + r
  const cx = 0;
  const cy = 0;                             // relative; caller offsets
  // Ordered slot list: column by column left→right over a COMMON angular
  // column grid. All rows share the outer row's column count (maxCols), so
  // "column c" is at the SAME angle on every row — real vertical stacks.
  // Shorter rows occupy a centered run of columns (wedge shape: inner rows
  // shorter, outer rows longer). Within a column the stack direction
  // alternates (inner→outer, then outer→inner) so consecutive slots are
  // always spatially adjacent: same column = one row gap apart; column
  // transition = same row, one pitch apart.
  const slots: Slot[] = [];
  const maxCols = Math.max(...counts);
  const startCol: number[] = counts.map((n) => Math.floor((maxCols - n) / 2));
  for (let c = 0; c < maxCols; c++) {
    const rowsInCol: number[] = [];
    for (let i = 0; i < K; i++) {
      if (c >= startCol[i] && c < startCol[i] + counts[i]) rowsInCol.push(i);
    }
    const ordered = c % 2 === 0 ? rowsInCol : rowsInCol.slice().reverse();
    for (const i of ordered) {
      // column 0 at the LEFT end (90+beta degrees; cos negative in SVG) so the
      // far-left alliance receives the leftmost run of slots.
      const theta = (90 + betaDeg) - (sweep * (c + 0.5)) / maxCols;
      slots.push({ x: cx + radii[i] * Math.cos(rad(theta)), y: cy + radii[i] * Math.sin(rad(theta)) });
    }
  }
  // canvas size: valley depth = rOuter (below C) plus label headroom above
  const headroom = 96;   // space above the arms for the center label
  const H = Math.round(headroom + bandBottom + sr * 2 + 34);
  const W = Math.round(2 * (rOuter * Math.cos(rad(8)) + sr) + 60);
  return { slots, seatR: sr, radii, rowCounts: counts, cx, cy, W, H };
}

// ============================================================
// TYPE B — Westminster rectangular chamber (spec Part 3)
//
// A rectangle, NOT a hemicycle. Straight rows. Zones:
//   opposition bank (top, rows left→right), floor (empty strip),
//   government bank (bottom), cross-bench (vertical bank right),
//   supply & confidence attached to the government bank's right end.
// One ordered slot list per zone; reading order is spatially continuous.
// ============================================================

export interface BankSlots { slots: Slot[]; rows: number; cols: number; }

// Horizontal bank: rows left→right, top→bottom (reading order).
function horizontalBank(total: number, seatsPerRow: number, d: number, x0: number, y0: number): BankSlots {
  const rows = Math.max(1, Math.ceil(total / seatsPerRow));
  const slots: Slot[] = [];
  let n = 0;
  for (let row = 0; row < rows && n < total; row++) {
    // boustrophedon: alternate row direction so the last seat of one row is
    // adjacent to the first seat of the next — the slot list stays spatially
    // continuous and every run assignment forms one connected block.
    const cols = row % 2 === 0
      ? [...Array(seatsPerRow).keys()]
      : [...Array(seatsPerRow).keys()].reverse();
    for (const col of cols) {
      if (n >= total) break;
      slots.push({ x: x0 + d / 2 + col * d, y: y0 + d / 2 + row * d });
      n++;
    }
  }
  return { slots, rows, cols: seatsPerRow };
}

// Vertical bank: top→bottom, left column→right column (reading order).
function verticalBank(total: number, seatsPerCol: number, d: number, x0: number, y0: number): BankSlots {
  const cols = Math.max(1, Math.ceil(total / seatsPerCol));
  const slots: Slot[] = [];
  let n = 0;
  for (let col = 0; col < cols && n < total; col++) {
    // boustrophedon down the columns for the same reason as horizontal banks.
    const rowsIdx = col % 2 === 0
      ? [...Array(seatsPerCol).keys()]
      : [...Array(seatsPerCol).keys()].reverse();
    for (const row of rowsIdx) {
      if (n >= total) break;
      slots.push({ x: x0 + d / 2 + col * d, y: y0 + d / 2 + row * d });
      n++;
    }
  }
  return { slots, rows: seatsPerCol, cols };
}

export interface ChamberLayout {
  opposition: BankSlots;
  government: BankSlots;
  supply: BankSlots;
  cross: BankSlots;
  seatD: number;
  // geometry for labels/floor
  floorY: number;
  W: number; H: number;
  bankX: number;         // left edge of horizontal banks
  bankW: number;         // width of horizontal banks
  crossX: number;
  crossY: number;
  supplyX: number;       // right-attached to government bank
  supplyY: number;
  govY: number;
  oppY: number;
}

export function buildChamber(oppN: number, govN: number, supN: number, crossN: number, isCog: boolean): ChamberLayout {
  const d = isCog ? 60 : 24;            // seat diameter (CoG much larger)
  // seatsPerRow: ~20 for CoR; for CoG pick to keep pleasing proportions
  const base = isCog ? Math.max(3, Math.min(6, Math.ceil((govN + supN) / 3))) : 20;
  // horizontal banks aligned to the same width: use the larger seat count
  const govTotal = govN + supN;
  const maxBank = Math.max(oppN, govTotal);
  let seatsPerRow = Math.max(base, Math.ceil(Math.max(maxBank, 1) / Math.max(1, Math.ceil(maxBank / base))));
  if (isCog) seatsPerRow = Math.max(3, Math.min(6, govTotal ? Math.ceil(govTotal / 2) : 3));
  const pad = isCog ? 70 : 56;
  const floorH = Math.round(1.5 * d) + 18;
  const labelH = 26;
  const bankRows = (n: number) => Math.max(1, Math.ceil(n / seatsPerRow));
  const bankH = (n: number) => bankRows(n) * d;
  const maxBankH = Math.max(bankH(oppN), bankH(govTotal));
  const bankW = seatsPerRow * d;
  const crossGap = d;                    // ~one seat diameter gap
  const crossW = crossN > 0 ? Math.max(1, Math.ceil(crossN / Math.max(1, Math.round(maxBankH / d)))) * d : 0;
  const H = Math.round(labelH + bankH(oppN) + floorH + bankH(govTotal) + pad);
  const W = Math.round(pad + bankW + (crossN > 0 ? crossGap + crossW + 24 : 24) + pad);
  const bankX = pad;
  const oppY = labelH;
  const govY = labelH + bankH(oppN) + floorH;
  const crossX = pad + bankW + crossGap;
  const crossRows = Math.max(1, Math.round(maxBankH / d));
  const crossY = oppY;                    // spans from top bank to bottom bank
  const crossH = Math.min(crossN > 0 ? Math.ceil(crossN / Math.max(1, Math.ceil(crossN / crossRows))) * d : 0, govY - oppY);
  // Supply: attached to the government bank's RIGHT end (nearest cross-bench), no gap.
  // Implement as an extension of the government slot grid: the last supN slots of the
  // combined gov+supply reading order continue into extra columns at the right.
  const opposition = horizontalBank(oppN, seatsPerRow, d, bankX, oppY);
  // combined government+supply bank: one grid, gov first, supply appended
  const govSupplyTotal = govTotal;
  const govSupply = horizontalBank(govSupplyTotal, seatsPerRow, d, bankX, govY);
  const government: BankSlots = { slots: govSupply.slots.slice(0, govN), rows: bankRows(govN), cols: seatsPerRow };
  const supply: BankSlots = { slots: govSupply.slots.slice(govN, govSupplyTotal), rows: bankRows(supN), cols: seatsPerRow };
  const cross = crossN > 0
    ? verticalBank(crossN, Math.max(1, Math.round(crossH / d)), d, crossX, crossY)
    : { slots: [] as Slot[], rows: 0, cols: 0 };
  return {
    opposition, government, supply, cross, seatD: d,
    floorY: labelH + bankH(oppN),
    W, H, bankX, bankW, crossX, crossY, supplyX: bankX + bankW, supplyY: govY, govY, oppY,
  };
}
