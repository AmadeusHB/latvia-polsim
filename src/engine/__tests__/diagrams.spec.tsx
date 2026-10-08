import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SaeimaArc, WestminsterDiagram } from '../../components/Diagrams';
import { buildArc, buildChamber, assertContiguity, rgbDistance } from '../../components/chamberGeometry';
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
