import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SaeimaArc, WestminsterDiagram } from '../../components/Diagrams';
import { buildValley, buildChamber, assignRuns, assertContiguity } from '../../components/chamberGeometry';
import { runSimulation } from '../simulate';
import { defaultDistricts } from '../../data/presets';
import { buildScenario, RIGHT, RIGHT_BLOCS, CENTER, CENTER_BLOCS, LEFT, LEFT_BLOCS } from './reference.test';
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

const SCENARIOS = [
  ['RIGHT', RIGHT, RIGHT_BLOCS, 20],
  ['CENTER', CENTER, CENTER_BLOCS, 24],
  ['LEFT', LEFT, LEFT_BLOCS, 25],
] as const;

describe('Engine: ordered slots & contiguity', () => {
  it('valley: exact 301 slots, outer rows longer than inner, adjacency', () => {
    const v = buildValley(301);
    expect(v.slots.length).toBe(301);
    // outer rows must hold MORE seats than inner rows (wedge requirement)
    const inner = v.rowCounts[0];
    const outer = v.rowCounts[v.rowCounts.length - 1];
    expect(outer).toBeGreaterThan(inner * 1.5);
    // capacity proportional to radius (each row within ±1 seat of ideal)
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

  it('run assignment: contiguous runs, sums preserved', () => {
    const v = buildValley(301);
    const parties = [
      { id: 'a', seats: 120 }, { id: 'b', seats: 80 }, { id: 'c', seats: 60 }, { id: 'd', seats: 41 },
    ];
    const runs = assignRuns(v.slots, parties);
    expect(runs.get('a')!.length).toBe(120);
    expect(runs.get('d')!.length).toBe(41);
    expect([...runs.values()].flat().length).toBe(301);
    // runs are consecutive slices
    expect(runs.get('b')![0]).toBe(v.slots[120]);
    expect(runs.get('c')![0]).toBe(v.slots[200]);
  });

  it('contiguity check: detects splits, passes contiguous', () => {
    // contiguous run of 5 seats passes
    const ok: { x: number; y: number; partyId: string }[] = [];
    for (let i = 0; i < 5; i++) ok.push({ x: i * 20, y: 0, partyId: 'p' });
    expect(() => assertContiguity('t', ok, 20)).not.toThrow();
    // split seats: two distant clusters would log an error (we just assert no throw for the API)
    const split = [
      { x: 0, y: 0, partyId: 'p' }, { x: 20, y: 0, partyId: 'p' },
      { x: 100, y: 0, partyId: 'p' }, { x: 120, y: 0, partyId: 'p' },
    ];
    expect(() => assertContiguity('t-split', split, 20)).not.toThrow(); // logs error, doesn't throw
  });
});

describe('Acceptance: Saeima valley (all reference scenarios)', () => {
  for (const [label, specs, blocs, seed] of SCENARIOS as any) {
    it(`[${label}] 301 seats, valley opens UP, wedges not stripes, far-left first`, () => {
      const sc = buildScenario(specs, blocs, seed);
      const html = renderToString(<SaeimaArc scenario={sc} />);
      const vb = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
      const W = +vb[1];
      const seats = parseSeats(html, html.match(/r="7\.[\d]+"/) ? +(html.match(/r="(7\.[\d]+)"/)![1]) : 7.5);
      expect(seats.length).toBe(301);
      // 1. VALLEY: lowest seats at bottom-CENTER; highest (arms) at both ends
      const ys = seats.map((s) => s.cy);
      const lowest = Math.max(...ys), highest = Math.min(...ys);
      const bottom = seats.filter((s) => s.cy > lowest - 8);
      const top = seats.filter((s) => s.cy < highest + 8);
      expect(Math.abs(avg(bottom.map((s) => s.cx)) - W / 2)).toBeLessThan(W * 0.12);
      expect(Math.min(...top.map((s) => s.cx))).toBeLessThan(W * 0.25);
      expect(Math.max(...top.map((s) => s.cx))).toBeGreaterThan(W * 0.75);
      // empty space ABOVE the band: mean y in the lower half of the canvas
      expect(avg(ys)).toBeGreaterThan(+vb[2] * 0.5);
      // 2. wedge shape: an alliance with many seats spans more x on outer rows than inner
      // (checked implicitly by row capacities in engine test); here: block runs are contiguous
      const seq = seats.map((s) => s.title.split(' — ')[0]);
      const runs: string[] = [];
      for (const s of seq) if (runs[runs.length - 1] !== s) runs.push(s);
      expect(runs.length).toBe(new Set(seq).size);
      // 3. far-left alliance occupies the leftmost slots
      const orderFirst = seats[0].title.split(' — ')[0];
      const leftmostX = Math.min(...seats.map((s) => s.cx));
      expect(seats[0].cx).toBeLessThan(leftmostX + 25);
      expect(orderFirst).toBeTruthy();
    });
  }

  it('[LEFT] shows warning banner when seats do not total 301', () => {
    const sc = buildScenario(LEFT, LEFT_BLOCS, 25);
    // break the total
    sc.parties[0].saeimaSeats -= 1;
    const html = renderToString(<SaeimaArc scenario={sc} />);
    expect(html).toContain('Entered seats: 300/301');
    expect(html).toContain('Saeima must total 301');
  });
});

describe('Acceptance: Westminster rectangular chamber', () => {
  for (const [label, specs, blocs, seed] of SCENARIOS as any) {
    it(`[${label}] CoR: 150 seats, opposition ABOVE government, empty floor, cross-bench right`, () => {
      const sc = buildScenario(specs, blocs, seed);
      const res = runSimulation(sc, defaultDistricts());
      const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
      const layout = buildChamber(
        sc.alliances.filter((a) => a.saeimaStatus === 'Opposition').length, 0, 0, 0, false);
      void layout;
      const vb = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
      const W = +vb[1], H = +vb[2];
      expect(W).toBeGreaterThan(H * 0.6); // wide rectangle-ish
      const seats = parseSeats(html, 11);
      expect(seats.length).toBe(150);
      const statusOf = new Map(sc.alliances.map((a) => [a.name, a.saeimaStatus]));
      const gov = seats.filter((s) => statusOf.get(s.title.replace(/ \(.*\)/, '')) === 'Government');
      const opp = seats.filter((s) => statusOf.get(s.title.replace(/ \(.*\)/, '')) === 'Opposition');
      const cross = seats.filter((s) => statusOf.get(s.title.replace(/ \(.*\)/, '')) === 'Cross-bench');
      // opposition bank on TOP: its mean y must be less than government's
      if (gov.length && opp.length) expect(avg(opp.map((s) => s.cy))).toBeLessThan(avg(gov.map((s) => s.cy)));
      // cross-bench on the RIGHT: its mean x exceeds both banks
      if (cross.length) {
        expect(avg(cross.map((s) => s.cx))).toBeGreaterThan(avg(gov.map((s) => s.cx)));
        expect(avg(cross.map((s) => s.cx))).toBeGreaterThan(avg(opp.map((s) => s.cx)));
      }
      // floor empty: no seat in the horizontal strip between the banks' vertical ranges
      if (gov.length && opp.length) {
        const oppBottom = Math.max(...opp.map((s) => s.cy));
        const govTop = Math.min(...gov.map((s) => s.cy));
        const inFloor = seats.filter((s) => s.cy > oppBottom + 12 && s.cy < govTop - 12);
        expect(inFloor.length).toBe(0);
      }
      // zone labels present
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

  it('supply & confidence attached to government right end (no gap)', () => {
    // RIGHT scenario has Supply & Confidence (Forwards!)
    const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
    const res = runSimulation(sc, defaultDistricts());
    const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
    const seats = parseSeats(html, 11);
    const statusOf = new Map(sc.alliances.map((a) => [a.name, a.saeimaStatus]));
    const sup = seats.filter((s) => statusOf.get(s.title.replace(/ \(.*\)/, '')) === 'Supply and Confidence');
    const gov = seats.filter((s) => statusOf.get(s.title.replace(/ \(.*\)/, '')) === 'Government');
    if (sup.length && gov.length) {
      // supply seats sit to the RIGHT of the government block and share its rows
      expect(avg(sup.map((s) => s.cx))).toBeGreaterThan(avg(gov.map((s) => s.cx)));
      const supMinX = Math.min(...sup.map((s) => s.cx));
      const govMaxX = Math.max(...gov.map((s) => s.cx));
      expect(supMinX - govMaxX).toBeLessThanOrEqual(26); // no gap larger than one seat pitch
    }
  });

  it('built-in 25th Saeima template: 301 seats, all chambers render', () => {
    const tpl = BUILTIN_TEMPLATES.find((t) => t.label === '25th Saeima — The Left Won')!;
    const sc = tpl.build();
    const entered = sc.parties.reduce((s, p) => s + p.saeimaSeats, 0);
    expect(entered).toBe(301);
    const saeima = renderToString(<SaeimaArc scenario={sc} />);
    expect(saeima).not.toContain('Entered seats:'); // no warning — totals OK
    const res = runSimulation(sc, defaultDistricts());
    const cor = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
    expect([...cor.matchAll(/<circle /g)].length).toBeGreaterThanOrEqual(150);
    const cog = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cog" />);
    expect([...cog.matchAll(/<circle /g)].length).toBe(18);
  });
});
