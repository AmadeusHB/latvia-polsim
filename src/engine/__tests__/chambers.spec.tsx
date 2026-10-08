import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SaeimaArc, WestminsterDiagram } from '../../components/Diagrams';
import { buildValley, assignRuns, assertContiguity } from '../../components/chamberGeometry';
import { runSimulation } from '../simulate';
import { defaultDistricts } from '../../data/presets';
import { buildScenario, RIGHT, RIGHT_BLOCS, CENTER, CENTER_BLOCS, LEFT, LEFT_BLOCS } from './referenceData';
import { BUILTIN_TEMPLATES } from '../../data/builtinTemplates';

// Parse seats from SSR html, attribute-order agnostic.
function parseSeats(html: string, seatR: number) {
  const out: { cx: number; cy: number; title: string }[] = [];
  for (const m of html.matchAll(/<circle ([^>]*)>/g)) {
    const a = m[1];
    if (!a.includes(`r="${seatR}"`)) continue;
    const cx = a.match(/cx="([\d.-]+)"/);
    const cy = a.match(/cy="([\d.-]+)"/);
    if (cx && cy) out.push({ cx: +cx[1], cy: +cy[1], title: '' });
  }
  const titles = [...html.matchAll(/<circle [^>]*><title>([^<]*)<\/title>/g)].map((m) => m[1]);
  out.forEach((s, i) => { s.title = titles[i] ?? ''; });
  return out;
}
const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);
const statusKey = (title: string) => title.replace(/ \(.*\)/, '');

const SCENARIOS: [string, any, any, number][] = [
  ['RIGHT', RIGHT, RIGHT_BLOCS, 20],
  ['CENTER', CENTER, CENTER_BLOCS, 24],
  ['LEFT', LEFT, LEFT_BLOCS, 25],
];

describe('Engine: ordered slots & contiguity', () => {
  it('valley: exact 301 slots, outer rows longer than inner (wedge shape)', () => {
    const v = buildValley(301);
    expect(v.slots.length).toBe(301);
    const inner = v.rowCounts[0];
    const outer = v.rowCounts[v.rowCounts.length - 1];
    expect(outer).toBeGreaterThan(inner * 1.5);
    // capacity proportional to arc length (within ±1 of ideal)
    const L = v.radii.map((r) => r * (164 * Math.PI) / 180);
    const sumL = L.reduce((a, b) => a + b, 0);
    v.rowCounts.forEach((n, i) => {
      expect(Math.abs(n - 301 * L[i] / sumL)).toBeLessThanOrEqual(1.01);
    });
  });

  it('valley slots: consecutive slots are spatially adjacent', () => {
    const v = buildValley(301);
    const d = 2 * v.seatR;
    for (let i = 1; i < v.slots.length; i++) {
      const dist = Math.hypot(v.slots[i].x - v.slots[i - 1].x, v.slots[i].y - v.slots[i - 1].y);
      expect(dist).toBeLessThanOrEqual(1.6 * d + 1);
    }
  });

  it('run assignment: consecutive runs, sums preserved', () => {
    const v = buildValley(301);
    const parties = [
      { id: 'a', seats: 120 }, { id: 'b', seats: 80 }, { id: 'c', seats: 60 }, { id: 'd', seats: 41 },
    ];
    const runs = assignRuns(v.slots, parties);
    expect(runs.get('a')!.length).toBe(120);
    expect(runs.get('d')!.length).toBe(41);
    expect([...runs.values()].flat().length).toBe(301);
    expect(runs.get('b')![0]).toBe(v.slots[120]);
    expect(runs.get('c')![0]).toBe(v.slots[200]);
  });

  it('contiguity check API: runs without throwing; single seat passes', () => {
    const ok: { x: number; y: number; partyId: string }[] = [];
    for (let i = 0; i < 5; i++) ok.push({ x: i * 20, y: 0, partyId: 'p' });
    expect(() => assertContiguity('t', ok, 20)).not.toThrow();
    expect(() => assertContiguity('t-single', [{ x: 0, y: 0, partyId: 'p' }], 20)).not.toThrow();
  });
});

describe('Acceptance: Saeima valley', () => {
  for (const [label, specs, blocs, seed] of SCENARIOS) {
    it(`[${label}] 301 seats, valley opens UP, contiguous blocks, ends at the top`, () => {
      const sc = buildScenario(specs, blocs, seed);
      const html = renderToString(<SaeimaArc scenario={sc} />);
      const vb = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
      const W = +vb[1];
      // extract the dominant seat radius from the render
      const radii: Record<string, number> = {};
      for (const m of html.matchAll(/<circle [^>]*?r="([\d.]+)"/g)) radii[m[1]] = (radii[m[1]] ?? 0) + 1;
      const seatR = +Object.entries(radii).sort((a, b) => b[1] - a[1])[0][0];
      const seats = parseSeats(html, seatR);
      expect(seats.length).toBe(301);
      // VALLEY: lowest seats at bottom-center; arms at the top-left and top-right
      const ys = seats.map((s) => s.cy);
      const lowest = Math.max(...ys), highest = Math.min(...ys);
      const bottom = seats.filter((s) => s.cy > lowest - 8);
      const top = seats.filter((s) => s.cy < highest + 8);
      expect(Math.abs(avg(bottom.map((s) => s.cx)) - W / 2)).toBeLessThan(W * 0.12);
      expect(Math.min(...top.map((s) => s.cx))).toBeLessThan(W * 0.25);
      expect(Math.max(...top.map((s) => s.cx))).toBeGreaterThan(W * 0.75);
      // empty space ABOVE the band: mean y in the lower half
      expect(avg(ys)).toBeGreaterThan(+vb[2] * 0.5);
      // contiguous: one run per alliance in slot order
      const seq = seats.map((s) => s.title.split(' — ')[0]);
      const runs: string[] = [];
      for (const s of seq) if (runs[runs.length - 1] !== s) runs.push(s);
      expect(runs.length).toBe(new Set(seq).size);
      // far-left alliance occupies the leftmost slot
      expect(seats[0].cx).toBeLessThan(Math.min(...seats.map((s) => s.cx)) + 25);
      // wedges not stripes: an alliance's x-span on the outer rows exceeds the inner rows' span
      // (verified indirectly via row capacities in the engine test)
    });
  }

  it('warning banner when entered seats do not total 301', () => {
    const sc = buildScenario(LEFT, LEFT_BLOCS, 25);
    const before = sc.parties.reduce((s, p) => s + p.saeimaSeats, 0);
    sc.parties[0].saeimaSeats -= 1;
    const html = renderToString(<SaeimaArc scenario={sc} />);
    expect(html).toContain(`Entered seats: ${before - 1}/301`);
    expect(html).toContain('Saeima must total 301');
  });
});

describe('Acceptance: Westminster rectangular chamber', () => {
  for (const [label, specs, blocs, seed] of SCENARIOS) {
    it(`[${label}] CoR: 150 seats, opposition on TOP, government BOTTOM, empty floor, cross-bench RIGHT`, () => {
      const sc = buildScenario(specs, blocs, seed);
      const res = runSimulation(sc, defaultDistricts());
      const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
      const vb = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
      const W = +vb[1], H = +vb[2];
      expect(W).toBeGreaterThan(H * 0.55);
      const seats = parseSeats(html, 11);
      expect(seats.length).toBe(150);
      const statusOf = new Map<string, string>(sc.alliances.map((a: any) => [a.name, a.saeimaStatus] as [string, string]));
      const gov = seats.filter((s) => statusOf.get(statusKey(s.title)) === 'Government');
      const opp = seats.filter((s) => statusOf.get(statusKey(s.title)) === 'Opposition');
      const cross = seats.filter((s) => statusOf.get(statusKey(s.title)) === 'Cross-bench');
      if (gov.length && opp.length) expect(avg(opp.map((s) => s.cy))).toBeLessThan(avg(gov.map((s) => s.cy)));
      if (cross.length) {
        expect(avg(cross.map((s) => s.cx))).toBeGreaterThan(avg(gov.map((s) => s.cx)));
        expect(avg(cross.map((s) => s.cx))).toBeGreaterThan(avg(opp.map((s) => s.cx)));
      }
      if (gov.length && opp.length) {
        const oppBottom = Math.max(...opp.map((s) => s.cy));
        const govTop = Math.min(...gov.map((s) => s.cy));
        // the floor strip spans the horizontal banks' width only (cross-bench
        // legitimately occupies the right side at any height)
        const bankRightEdge = Math.max(...gov.map((s) => s.cx)) + 12;
        const inFloor = seats.filter((s) =>
          s.cx <= bankRightEdge && s.cy > oppBottom + 12 && s.cy < govTop - 12);
        expect(inFloor.length).toBe(0);
      }
      expect(html).toContain('GOVERNMENT');
      expect(html).toContain('OPPOSITION');
      expect(html).toContain('CROSS-BENCH');
    });

    it(`[${label}] CoG: 18 seats, 2× badges, 36 joint votes`, () => {
      const sc = buildScenario(specs, blocs, seed);
      const res = runSimulation(sc, defaultDistricts());
      const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cog" />);
      const seats = parseSeats(html, 29);
      expect(seats.length).toBe(18);
      const badges = [...html.matchAll(/<text[^>]*>2×<\/text>/g)].length;
      expect(badges).toBe(18);
      expect(html).toContain('36 joint votes');
    });
  }

  it('supply & confidence attached to the government bank right end', () => {
    const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
    const res = runSimulation(sc, defaultDistricts());
    const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
    const seats = parseSeats(html, 11);
    const statusOf = new Map<string, string>(sc.alliances.map((a: any) => [a.name, a.saeimaStatus] as [string, string]));
    const sup = seats.filter((s) => statusOf.get(statusKey(s.title)) === 'Supply and Confidence');
    const gov = seats.filter((s) => statusOf.get(statusKey(s.title)) === 'Government');
    if (sup.length && gov.length) {
      expect(avg(sup.map((s) => s.cx))).toBeGreaterThan(avg(gov.map((s) => s.cx)));
      const supMinX = Math.min(...sup.map((s) => s.cx));
      const govMaxX = Math.max(...gov.map((s) => s.cx));
      expect(supMinX - govMaxX).toBeLessThanOrEqual(26);
    }
  });

  it('built-in 25th Saeima template: 301 seats, no warning, all chambers', () => {
    const tpl = BUILTIN_TEMPLATES.find((t) => t.label === '25th Saeima — The Left Won')!;
    const sc = tpl.build();
    expect(sc.parties.reduce((s, p) => s + p.saeimaSeats, 0)).toBe(301);
    const saeima = renderToString(<SaeimaArc scenario={sc} />);
    expect(saeima).not.toContain('Entered seats:');
    const res = runSimulation(sc, defaultDistricts());
    const cor = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
    expect([...cor.matchAll(/<circle /g)].length).toBeGreaterThanOrEqual(150);
    const cog = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cog" />);
    expect([...cog.matchAll(/<circle /g)].length).toBe(18);
  });
});
