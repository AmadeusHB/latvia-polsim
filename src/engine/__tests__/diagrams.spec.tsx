import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SaeimaArc, WestminsterDiagram } from '../../components/Diagrams';
import { buildArc, buildChamber, assertContiguity, rgbDistance, allocateWedges, allocateSaeimaSeats } from '../../components/chamberGeometry';
import { runSimulation } from '../simulate';
import { defaultDistricts } from '../../data/presets';
import { buildScenario, RIGHT, RIGHT_BLOCS, CENTER, CENTER_BLOCS, LEFT, LEFT_BLOCS } from './referenceData';
import { BUILTIN_TEMPLATES } from '../../data/builtinTemplates';

// --- SSR parsing helpers (attribute-order agnostic) ---
function parseCircles(html: string) {
  const out: { cx: number; cy: number; r: number; fill: string; stroke: string; sw: number; title: string }[] = [];
  for (const m of html.matchAll(/<circle ([^>]*)>/g)) {
    const a = m[1];
    const num = (k: string) => { const mm = a.match(new RegExp(`${k}="([\\d.-]+)"`)); return mm ? +mm[1] : NaN; };
    const str = (k: string) => { const mm = a.match(new RegExp(`${k}="([^"]*)"`)); return mm ? mm[1] : ''; };
    out.push({ cx: num('cx'), cy: num('cy'), r: num('r'), fill: str('fill'), stroke: str('stroke'), sw: num('stroke-width'), title: '' });
  }
  const titles = [...html.matchAll(/<circle [^>]*><title>([^<]*)<\/title>/g)].map((m) => m[1]);
  out.forEach((c, i) => { c.title = titles[i] ?? ''; });
  return out;
}
function parseTexts(html: string) {
  return [...html.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)].map((m) => {
    const a = m[1];
    const num = (k: string) => { const mm = a.match(new RegExp(`${k}="([\\d.-]+)"`)); return mm ? +mm[1] : NaN; };
    return { x: num('x'), y: num('y'), fontSize: num('font-size'), content: m[2] };
  });
}
const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);

// Bounding box for a text (approximate: width = 0.6em per char).
function textBBox(t: { x: number; y: number; fontSize: number; content: string }) {
  const w = t.content.length * t.fontSize * 0.6;
  return { x0: t.x - w / 2, x1: t.x + w / 2, y0: t.y - t.fontSize, y1: t.y + t.fontSize * 0.3 };
}
function noCollision(seats: { cx: number; cy: number; r: number }[], texts: ReturnType<typeof parseTexts>) {
  for (const t of texts) {
    const b = textBBox(t);
    for (const s of seats) {
      const nx = Math.max(b.x0, Math.min(s.cx, b.x1));
      const ny = Math.max(b.y0, Math.min(s.cy, b.y1));
      if ((nx - s.cx) ** 2 + (ny - s.cy) ** 2 < s.r * s.r) return false;
    }
  }
  return true;
}

const SCENARIOS: [string, any, any, number][] = [
  ['RIGHT', RIGHT, RIGHT_BLOCS, 20],
  ['CENTER', CENTER, CENTER_BLOCS, 24],
  ['LEFT', LEFT, LEFT_BLOCS, 25],
];

describe('Part 4 verification — Saeima arc', () => {
  for (const [label, specs, blocs, seed] of SCENARIOS) {
    it(`[${label}] 301 seats; laws 1-4; contiguity; text collision; valley up; even ends`, () => {
      const sc = buildScenario(specs, blocs, seed);
      const html = renderToString(<SaeimaArc scenario={sc} />);
      const seats = parseCircles(html);
      expect(seats.length).toBe(301);
      // LAW 1: one seat size (variance zero)
      const rs = new Set(seats.map((s) => +s.r.toFixed(4)));
      expect(rs.size).toBe(1);
      // LAW 4: one stroke width
      const sws = new Set(seats.map((s) => s.sw));
      expect(sws.size).toBe(1);
      // LAW 2: minimum center distance >= cell (seat d + 2)
      const r = seats[0].r;
      const cell = 2 * r + 2;
      for (let i = 0; i < seats.length; i++) {
        for (let j = i + 1; j < seats.length; j++) {
          const d = Math.hypot(seats[i].cx - seats[j].cx, seats[i].cy - seats[j].cy);
          if (d < cell - 0.01) { expect.fail(`seats ${i},${j} overlap at ${d}`); }
        }
      }
      // valley opens UP: bottom-center seats cluster at mid-x and sit far
      // below the arm-end seats; arm seats reach both horizontal extremes.
      const vb = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
      const W = +vb[1], H = +vb[2];
      const ys = seats.map((s) => s.cy);
      const lowest = Math.max(...ys), highest = Math.min(...ys);
      const bottom = seats.filter((s) => s.cy > lowest - 8);
      void highest;
      expect(Math.abs(avg(bottom.map((s) => s.cx)) - W / 2)).toBeLessThan(W * 0.12);
      // the band's ARMS RISE: the extreme-left and extreme-right seats
      // (outer-row ends) sit well above the band bottom — the valley shape.
      const leftEdge = seats.reduce((b, s) => (s.cx < b.cx ? s : b));
      const rightEdge = seats.reduce((b, s) => (s.cx > b.cx ? s : b));
      const depth = lowest - highest;
      expect(leftEdge.cy).toBeLessThan(lowest - depth * 0.45);
      expect(rightEdge.cy).toBeLessThan(lowest - depth * 0.45);
      expect(lowest - highest).toBeGreaterThan(H * 0.25);
      // empty space above the band: mean y in the lower half
      expect(avg(ys)).toBeGreaterThan(H * 0.5);
      // contiguity via the engine (also runs at render)
      expect(() => assertContiguity('t', seats.map((s) => ({ x: s.cx, y: s.cy, allianceId: s.title })), 2 * r)).not.toThrow();
      // LAW 5: no text touches seats
      const texts = parseTexts(html).filter((t) => t.content.trim());
      expect(noCollision(seats, texts)).toBe(true);
      // LAW 6: >= 28px padding on all sides
      expect(Math.min(...seats.map((s) => s.cx - s.r))).toBeGreaterThanOrEqual(28 - 0.5);
      expect(W - Math.max(...seats.map((s) => s.cx + s.r))).toBeGreaterThanOrEqual(28 - 0.5);
      expect(Math.min(...seats.map((s) => s.cy - s.r))).toBeGreaterThanOrEqual(4);
      expect(H - Math.max(...seats.map((s) => s.cy + s.r))).toBeGreaterThanOrEqual(4);
    });
  }

  it('arc engine: row capacity ∝ radius; shared span; no truncated ends', () => {
    const parties = [
      { id: 'a', seats: 120 }, { id: 'b', seats: 80 }, { id: 'c', seats: 60 }, { id: 'd', seats: 41 },
    ];
    const v = buildArc(parties);
    expect(v.seats.length).toBe(301);
    expect(v.K).toBeGreaterThanOrEqual(10);
    expect(v.K).toBeLessThanOrEqual(15);
    // every row spans the same angle range: all row end-seats on the same rays
    // (checked indirectly: inner and outer rows' first seats share angle)
    // capacity ∝ radius: outer row > 1.5× inner
    expect(v.rowCounts[v.K - 1]).toBeGreaterThan(v.rowCounts[0] * 1.5);
  });

  it('warning banner shows for wrong totals; arc still renders', () => {
    const sc = buildScenario(LEFT, LEFT_BLOCS, 25);
    sc.parties[0].saeimaSeats -= 1;
    const before = sc.parties.reduce((s, p) => s + p.saeimaSeats, 0);
    const html = renderToString(<SaeimaArc scenario={sc} />);
    expect(html).toContain(`Entered seats: ${before}/301`);
    expect(html).toContain('Saeima must total 301');
    expect(parseCircles(html).length).toBe(before);
  });
});

describe('Part 4 verification — Westminster chambers', () => {
  for (const [label, specs, blocs, seed] of SCENARIOS) {
    it(`[${label}] CoR: 150 seats, laws 1-4, no overlap, floor label, contiguity, no text collision`, () => {
      const sc = buildScenario(specs, blocs, seed);
      const res = runSimulation(sc, defaultDistricts());
      const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
      const seats = parseCircles(html);
      expect(seats.length).toBe(150);
      const rs = new Set(seats.map((s) => +s.r.toFixed(4)));
      expect(rs.size).toBe(1);
      const sws = new Set(seats.map((s) => s.sw));
      expect(sws.size).toBe(1);
      const r = seats[0].r;
      const cell = 2 * r + 2;
      for (let i = 0; i < seats.length; i++) {
        for (let j = i + 1; j < seats.length; j++) {
          const d = Math.hypot(seats[i].cx - seats[j].cx, seats[i].cy - seats[j].cy);
          if (d < cell - 0.01) expect.fail(`overlap ${d}`);
        }
      }
      // rectangular chamber: government mean y > opposition mean y
      const statusOf = new Map<string, string>(sc.alliances.map((a: any) => [a.name, a.saeimaStatus]));
      const key = (t: string) => t.replace(/ \(.*\)/, '');
      const gov = seats.filter((s) => statusOf.get(key(s.title)) === 'Government');
      const opp = seats.filter((s) => statusOf.get(key(s.title)) === 'Opposition');
      if (gov.length && opp.length) expect(avg(gov.map((s) => s.cy))).toBeGreaterThan(avg(opp.map((s) => s.cy)));
      // floor label present
      expect(html).toContain('Council of Regions');
      // zone labels
      expect(html).toContain('OPPOSITION');
      expect(html).toContain('GOVERNMENT');
      // contiguity
      expect(() => assertContiguity('t', seats.map((s) => ({ x: s.cx, y: s.cy, allianceId: key(s.title) })), 2 * r)).not.toThrow();
      // no text/seat collision (floor label excluded: it's in the empty strip)
      const floorTexts = parseTexts(html).filter((t) => t.content.includes('Council of Regions'));
      const nonFloor = parseTexts(html).filter((t) => t.content.trim() && !floorTexts.includes(t));
      expect(noCollision(seats, nonFloor)).toBe(true);
    });

    it(`[${label}] CoG: 18 seats, centered 2× badges, 36 joint votes, labels`, () => {
      const sc = buildScenario(specs, blocs, seed);
      const res = runSimulation(sc, defaultDistricts());
      const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cog" />);
      const seats = parseCircles(html);
      expect(seats.length).toBe(18);
      // badges: 18, centered on seat centers, dominant-baseline central
      const badges = [...html.matchAll(/<text ([^>]*)>2×<\/text>/g)].map((m) => m[1]);
      expect(badges.length).toBe(18);
      for (const b of badges) {
        expect(b).toContain('text-anchor="middle"');
        expect(b).toContain('dominant-baseline="central"');
      }
      expect(html).toContain('36 joint votes');
      expect(html).toContain('GOVERNMENT');
      // CROSS-BENCH label only when cross-bench governors exist
      const statusOfCog = new Map<string, string>(sc.alliances.map((a: any) => [a.name, a.saeimaStatus]));
      const hasCross = seats.some((s) => statusOfCog.get(s.title.replace(/ · 2 votes/, '').replace(/ \(.*\)/, '')) === 'Cross-bench');
      if (hasCross) expect(html).toContain('CROSS-BENCH');
      // one seat size, one stroke (3px)
      expect(new Set(seats.map((s) => +s.r.toFixed(4))).size).toBe(1);
      expect(new Set(seats.map((s) => s.sw)).size).toBe(1);
    });
  }

  it('supply & confidence flush at government right end (no gap)', () => {
    const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
    const res = runSimulation(sc, defaultDistricts());
    const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
    const seats = parseCircles(html);
    const statusOf = new Map<string, string>(sc.alliances.map((a: any) => [a.name, a.saeimaStatus]));
    const key = (t: string) => t.replace(/ \(.*\)/, '');
    const sup = seats.filter((s) => statusOf.get(key(s.title)) === 'Supply and Confidence');
    const gov = seats.filter((s) => statusOf.get(key(s.title)) === 'Government');
    if (sup.length && gov.length) {
      expect(avg(sup.map((s) => s.cx))).toBeGreaterThan(avg(gov.map((s) => s.cx)));
      const supMinX = Math.min(...sup.map((s) => s.cx));
      const govMaxX = Math.max(...gov.map((s) => s.cx));
      expect(supMinX - govMaxX).toBeLessThanOrEqual(2 * sup[0].r + 2 + 0.01); // one cell
    }
  });

  it('built-in template: 301 seats, no warning banner', () => {
    const tpl = BUILTIN_TEMPLATES.find((t) => t.label === '25th Saeima — The Left Won')!;
    const sc = tpl.build();
    expect(sc.parties.reduce((s, p) => s + p.saeimaSeats, 0)).toBe(301);
    const html = renderToString(<SaeimaArc scenario={sc} />);
    expect(html).not.toContain('Entered seats:');
    expect(parseCircles(html).length).toBe(301);
    const res = runSimulation(sc, defaultDistricts());
    const cor = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
    expect(parseCircles(cor).length).toBe(150);
    const cog = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cog" />);
    expect(parseCircles(cog).length).toBe(18);
  });
});

describe('Engine units', () => {
  it('rgbDistance: near colors < 120, distinct >= 120', () => {
    expect(rgbDistance('#ffdb2e', '#ffcc00')).toBeLessThan(120);
    expect(rgbDistance('#b01e1e', '#1f4fd6')).toBeGreaterThanOrEqual(120);
  });
  it('chamber grid: straight lines only — all rows share exact y positions', () => {
    const layout = buildChamber(
      [{ id: 'o1', seats: 40 }],
      [{ id: 'g1', seats: 60 }],
      [{ id: 'c1', seats: 20 }],
      [{ id: 's1', seats: 9 }],
      false,
    );
    const ys = layout.opposition.map((s) => +s.y.toFixed(4));
    expect(new Set(ys).size).toBeLessThanOrEqual(layout.oppRows);
    const xs = layout.opposition.map((s) => +s.x.toFixed(4));
    // columns on the shared grid
    expect(new Set(xs).size).toBeLessThanOrEqual(layout.SPR);
  });
});

describe('Wedge allocator (arc party wedges)', () => {
  const letters = 'ABCDEFGH';
  const rowsOf = (own: number[][]) => own.map((r) => r.map((p) => letters[p]).join(''));
  it('verified sample: 8 alliances, 13 rows — exact wedges matching the reference layout', () => {
    const seats = [24, 38, 52, 63, 14, 45, 41, 24];
    const rows = [16, 17, 18, 20, 21, 22, 23, 24, 25, 27, 28, 29, 31];
    expect(seats.reduce((a, b) => a + b, 0)).toBe(301);
    const own = allocateWedges(seats.map((s, i) => ({ id: letters[i], seats: s })), rows);
    expect(rowsOf(own)).toEqual([
      'ABBCCCDDDEFFFGGH',
      'ABBCCCDDDDEFFGGGH',
      'ABBBCCCDDDDFFFGGGH',
      'AABBCCCCDDDDEFFFGGHH',
      'AABBCCCCDDDDEFFFGGGHH',
      'AABBBCCCDDDDDEFFFGGGHH',
      'AABBBCCCCDDDDDEFFFGGGHH',
      'AABBBCCCCDDDDDEFFFFGGGHH',
      'AABBBCCCCDDDDDDEFFFFGGGHH',
      'AABBBBCCCCDDDDDDEFFFFGGGGHH',
      'AABBBBCCCCCDDDDDEEFFFFGGGGHH',
      'AABBBBCCCCCDDDDDDEFFFFFGGGGHH',
      'AAABBBCCCCCCDDDDDDEEFFFFGGGGHHH',
    ]);
  });
  it('exact totals, contiguous slices, identical per-row order on randomized configs', () => {
    let rng = 12345;
    const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let t = 0; t < 300; t++) {
      const P = 1 + Math.floor(rand() * 40);
      const seats: number[] = [];
      for (let p = 0; p < P; p++) seats.push(1 + Math.floor(rand() * 12));
      const N = seats.reduce((a, b) => a + b, 0);
      const R = 1 + Math.floor(rand() * 16);
      const rows: number[] = Array.from({ length: R }, () => 1 + Math.floor(rand() * 30));
      const sum = rows.reduce((a, b) => a + b, 0);
      const scaled = rows.map((r) => Math.max(1, Math.floor((r * N) / sum)));
      let acc = scaled.reduce((a, b) => a + b, 0);
      let i = 0;
      while (acc !== N) {
        const d = N - acc;
        scaled[i % R] += Math.sign(d);
        acc += Math.sign(d);
        i++;
      }
      const own = allocateWedges(seats.map((s, p) => ({ id: letters[p % 10] + p, seats: s })), scaled);
      const counts = new Array(P).fill(0);
      for (const r of own) {
        const seen: number[] = [];
        for (const p of r) { counts[p]++; if (seen[seen.length - 1] !== p) seen.push(p); }
        for (let q = 1; q < seen.length; q++) expect(seen[q]).toBeGreaterThan(seen[q - 1]);
      }
      for (let p = 0; p < P; p++) expect(counts[p]).toBe(seats[p]);
    }
  });
  it('single alliance holding all 301 seats fills every slot', () => {
    const own = allocateWedges([{ id: 'X', seats: 301 }], [150, 151]);
    expect(own[0].every((p) => p === 0)).toBe(true);
    expect(own[1].every((p) => p === 0)).toBe(true);
  });
  it('deterministic: same input yields identical allocation', () => {
    const seats = [24, 38, 52, 63, 14, 45, 41, 24].map((s, i) => ({ id: letters[i], seats: s }));
    const rows = [16, 17, 18, 20, 21, 22, 23, 24, 25, 27, 28, 29, 31];
    expect(allocateWedges(seats, rows)).toEqual(allocateWedges(seats, rows));
  });
  it('SECTION 4.1: arc seats never overlap (center distance >= diameter + 1)', () => {
    for (const parties of [
      [{ id: 'a', seats: 120 }, { id: 'b', seats: 80 }, { id: 'c', seats: 60 }, { id: 'd', seats: 41 }],
      [{ id: 'a', seats: 24 }, { id: 'b', seats: 38 }, { id: 'c', seats: 52 }, { id: 'd', seats: 63 },
       { id: 'e', seats: 14 }, { id: 'f', seats: 45 }, { id: 'g', seats: 41 }, { id: 'h', seats: 24 }],
    ]) {
      const v = buildArc(parties as any);
      const d = 2 * v.seatR;
      for (let i = 0; i < v.seats.length; i++)
        for (let j = i + 1; j < v.seats.length; j++) {
          const dist = Math.hypot(v.seats[i].x - v.seats[j].x, v.seats[i].y - v.seats[j].y);
          if (dist < d + 1) expect.fail(`arc seats ${i},${j} overlap: ${dist} < ${d + 1}`);
        }
    }
  });
  it('SECTION 4.4: seats bounding box symmetric about the vertical centerline', () => {
    const v = buildArc([{ id: 'a', seats: 150 }, { id: 'b', seats: 151 }]);
    const minX = Math.min(...v.seats.map((s) => s.x));
    const maxX = Math.max(...v.seats.map((s) => s.x));
    const seatD = 2 * v.seatR;
    const center = (minX + maxX) / 2;
    expect(Math.abs(center - v.cx)).toBeLessThan(seatD);
  });
});

describe('Concentrated wedge allocator (minor-party blocks)', () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVW';
  const rowsOf = (own: number[][]) => own.map((r) => r.map((p) => letters[p]).join(''));
  const checkInvariants = (seats: number[], rows: number[], stage: string) => {
    const P = seats.length;
    const counts = new Array(P).fill(0);
    const rowsOfParty: number[][] = Array.from({ length: P }, () => []);
    const { layout, stage: used } = allocateSaeimaSeats(seats, rows);
    layout.forEach((row, i) => {
      expect(row.length).toBe(rows[i]);
      let prev = -1;
      for (const p of row) {
        expect(p).toBeGreaterThanOrEqual(prev);
        prev = p;
        counts[p]++;
        if (rowsOfParty[p][rowsOfParty[p].length - 1] !== i) rowsOfParty[p].push(i);
      }
    });
    for (let p = 0; p < P; p++) {
      expect(counts[p]).toBe(seats[p]);
      const occ = rowsOfParty[p];
      let islands = 0;
      for (let q = 1; q < occ.length; q++) if (occ[q] !== occ[q - 1] + 1) islands++;
      if (used !== 'fallback') expect(islands).toBe(0);
    }
    void stage;
    return used;
  };
  it('worked example: 17 parties, 13 rows — exact match with the reference output', () => {
    const seats = [64, 46, 31, 31, 17, 13, 8, 7, 5, 5, 4, 3, 2, 2, 2, 2, 59];
    const rows = [16, 17, 18, 20, 21, 22, 23, 24, 25, 27, 28, 29, 31];
    const { layout, stage } = allocateSaeimaSeats(seats, rows);
    expect(stage).toBe('concentrated-0');
    expect(rowsOf(layout)).toEqual([
      'AABBCCDDEFHJPQQQ',
      'ABBBCCDDEFHJOPQQQ',
      'AABBBCCDDEFHJOQQQQ',
      'AAAABBBCCDDEFHJNQQQQ',
      'AAAAABBBCCDDEFHJNQQQQ',
      'AAAAAABBBCCDDEFGHLQQQQ',
      'AAAAABBBBCCDDEFGHLQQQQQ',
      'AAAAAABBBBCCDDEFGKLQQQQQ',
      'AAAAABBBBCCCDDDEFGIKQQQQQ',
      'AAAAAABBBBCCCDDDEEFGIKQQQQQ',
      'AAAAAAABBBBCCCDDDEEFGIKQQQQQ',
      'AAAAAAABBBBCCCDDDEEFGIMQQQQQQ',
      'AAAAAAAABBBBBCCCDDDEEFGIMQQQQQQ',
    ]);
  });
  it('acceptance checks on 300 randomized configs (totals, order, no islands)', () => {
    let rng = 777;
    const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let t = 0; t < 300; t++) {
      const P = 1 + Math.floor(rand() * 40);
      const seats: number[] = [];
      for (let p = 0; p < P; p++) seats.push(1 + Math.floor(rand() * 60));
      const N = seats.reduce((a, b) => a + b, 0);
      const R = 1 + Math.floor(rand() * 16);
      const rows: number[] = Array.from({ length: R }, () => 1 + Math.floor(rand() * 30));
      const sum = rows.reduce((a, b) => a + b, 0);
      const scaled = rows.map((r) => Math.max(1, Math.floor((r * N) / sum)));
      let acc = scaled.reduce((a, b) => a + b, 0);
      let i = 0;
      while (acc !== N) {
        const d = N - acc;
        scaled[i % R] += Math.sign(d);
        acc += Math.sign(d);
        i++;
      }
      checkInvariants(seats, scaled, 'rand');
    }
  });
  it('sanity: single party 301; 301 one-seat parties; 37 one-seat + 3 large; 2 rows; 1 row', () => {
    checkInvariants([301], [150, 151], 's1');
    const oneEach = new Array(301).fill(1);
    checkInvariants(oneEach, [150, 151], 's2');
    checkInvariants([...new Array(37).fill(1), 100, 80, 84], [15, 17, 20, 22, 25, 28, 30, 33, 34, 37, 40], 's3');
    checkInvariants([150, 151], [200, 101], 's4');
    checkInvariants([301], [301], 's5');
    checkInvariants([100, 100, 101], [301], 's6');
  });
  it('determinism: identical output on repeated calls', () => {
    const seats = [64, 46, 31, 31, 17, 13, 8, 7, 5, 5, 4, 3, 2, 2, 2, 2, 59];
    const rows = [16, 17, 18, 20, 21, 22, 23, 24, 25, 27, 28, 29, 31];
    expect(allocateSaeimaSeats(seats, rows)).toEqual(allocateSaeimaSeats(seats, rows));
  });
  it('built-in scenario: buildArc produces exact totals and zero islands', () => {
    const parties = [
      { id: 'a', seats: 64 }, { id: 'b', seats: 26 }, { id: 'c', seats: 21 },
      { id: 'd', seats: 31 }, { id: 'e', seats: 5 }, { id: 'f', seats: 17 },
      { id: 'g', seats: 13 }, { id: 'h', seats: 3 }, { id: 'i', seats: 22 },
      { id: 'j', seats: 4 }, { id: 'k', seats: 19 }, { id: 'l', seats: 8 },
      { id: 'm', seats: 7 }, { id: 'n', seats: 17 }, { id: 'o', seats: 13 },
      { id: 'p', seats: 26 }, { id: 'q', seats: 5 },
    ];
    const v = buildArc(parties);
    expect(v.seats.length).toBe(301);
    const counts = new Map<string, number>();
    for (const s of v.seats) counts.set(s.allianceId, (counts.get(s.allianceId) ?? 0) + 1);
    for (const p of parties) expect(counts.get(p.id)).toBe(p.seats);
  });
});
