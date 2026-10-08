import { it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { valleyPositions, assertContiguous } from '../../components/parliament';

const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);
import { SaeimaArc, WestminsterDiagram } from '../../components/Diagrams';
import { runSimulation } from '../simulate';
import { defaultDistricts } from '../../data/presets';
import { buildScenario, RIGHT, RIGHT_BLOCS } from './reference.test';

it('valley geometry: opens UP (band below center), capacities ∝ radius, exact total', () => {
  const { slots, r_i, r_o, rows } = valleyPositions(301, 7.5, 9);
  expect(slots.length).toBe(301);
  expect(rows).toBeGreaterThanOrEqual(7);
  expect(rows).toBeLessThanOrEqual(14);
  // valley: all seats BELOW the arc center (y > 0), arms at the top (y≈0), bottom deep (y≈r_o)
  const ys = slots.map((p) => p.y);
  expect(Math.min(...ys)).toBeGreaterThan(-2);        // arms at the top edge
  expect(Math.max(...ys)).toBeCloseTo(r_o, -1);        // band bottom
  expect(Math.max(...ys)).toBeGreaterThan(r_o * 0.9);
  // symmetric around x=0
  expect(Math.abs(Math.max(...slots.map((p) => p.x)) + Math.min(...slots.map((p) => p.x)))).toBeLessThan(2 * 17.4);
  // capacity ∝ radius: outer row has ~r_o/r_i× inner row's seats
  const inner = slots.filter((p) => p.r === r_i).length;
  const outer = slots.filter((p) => p.r === r_o).length;
  expect(outer / inner).toBeCloseTo(r_o / r_i, 0);
  // reading order: boustrophedon rows — consecutive slots are always
  // geometrically adjacent (within 1.5 seat diameters), which guarantees
  // any consecutive run forms ONE connected block (contiguity invariant).
  const D = 2 * 7.5;
  for (let i = 1; i < slots.length; i++) {
    const d = Math.hypot(slots[i].x - slots[i - 1].x, slots[i].y - slots[i - 1].y);
    expect(d).toBeLessThanOrEqual(1.5 * D + 0.6);
  }
});

it('Saeima: valley orientation + one contiguous wedge per alliance', () => {
  const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
  const html = renderToString(<SaeimaArc scenario={sc} />);
  const vb = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
  const W = +vb[1];
  const circles = [...html.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="7\.5"/g)].map((m) => ({ cx: +m[1], cy: +m[2] }));
  expect(circles.length).toBe(301);
  // VALLEY: the LOWEST seats (max cy) are at bottom-CENTER; the HIGHEST seats (min cy) at the ENDS
  const cxMid = W / 2;
  const bottomSeats = circles.filter((c) => c.cy > Math.max(...circles.map((k) => k.cy)) - 10);
  const topSeats = circles.filter((c) => c.cy < Math.min(...circles.map((k) => k.cy)) + 10);
  const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);
  // bottom-center seats cluster around the middle x
  expect(Math.abs(avg(bottomSeats.map((c) => c.cx)) - cxMid)).toBeLessThan(W * 0.12);
  // top (arm-end) seats sit far left AND far right
  const topXs = topSeats.map((c) => c.cx);
  expect(Math.min(...topXs)).toBeLessThan(W * 0.25);
  expect(Math.max(...topXs)).toBeGreaterThan(W * 0.75);
  // contiguity: one DOM run per alliance
  const titles = [...html.matchAll(/<circle[^>]*><title>([^<]*)<\/title>/g)].map((m) => m[1]);
  const seq = titles.map((t) => t.split(' — ')[0]);
  const runs: string[] = [];
  for (const s of seq) if (runs[runs.length - 1] !== s) runs.push(s);
  expect(runs.length).toBe(new Set(seq).size);
});

it('CoR Westminster: facing banks, floor gap, sections contiguous', () => {
  const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
  const res = runSimulation(sc, defaultDistricts());
  const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
  const vb = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
  const W = +vb[1];
  const circles = [...html.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="9"/g)].map((m) => ({ cx: +m[1], cy: +m[2] }));
  expect(circles.length).toBe(150);
  // government seats on the LEFT half, opposition on the RIGHT half (by alliance status)
  const titles = [...html.matchAll(/<circle[^>]*><title>([^<]*)<\/title>/g)].map((m) => m[1]);
  const govNames = new Set(sc.alliances.filter((a) => a.saeimaStatus === 'Government').map((a) => a.name));
  const oppNames = new Set(sc.alliances.filter((a) => a.saeimaStatus === 'Opposition').map((a) => a.name));
  const govXs: number[] = [], oppXs: number[] = [];
  circles.forEach((_, i) => {
    const name = titles[i].replace(/ \(.*\)/, '');
    if (govNames.has(name)) govXs.push(circles[i].cx);
    if (oppNames.has(name)) oppXs.push(circles[i].cx);
  });
  expect(govXs.length).toBeGreaterThan(0);
  expect(oppXs.length).toBeGreaterThan(0);
  // government bank is left of opposition bank (mean comparison)
  expect(avg(govXs)).toBeLessThan(avg(oppXs));
  // clear floor gap: between the banks, BELOW the cross-bench zone (which
  // legitimately occupies the center above the floor), no seat may appear.
  const titlesAll = [...html.matchAll(/<circle[^>]*><title>([^<]*)<\/title>/g)].map((m) => m[1]);
  const crossNames = new Set(sc.alliances.filter((a) => a.saeimaStatus === 'Cross-bench').map((a) => a.name));
  const nonCrossIdx = circles.map((_, i) => i).filter((i) => !crossNames.has(titlesAll[i].replace(/ \(.*\)/, '')));
  const crossBottom = Math.max(...circles.filter((_, i) => crossNames.has(titlesAll[i].replace(/ \(.*\)/, ''))).map((c) => c.cy), 0);
  const floorHalf = W * 0.09;
  const inFloor = nonCrossIdx.map((i) => circles[i])
    .filter((c) => Math.abs(c.cx - W / 2) < floorHalf && c.cy > crossBottom - 2);
  expect(inFloor.length).toBe(0);
  // contiguity per alliance via adjacency graph (the runtime self-check also runs)
  const owner = titles.map((t) => t.replace(/ \(.*\)/, ''));
  assertContiguous('CoR-test', circles.map((c) => ({ x: c.cx, y: c.cy })), owner, 9);
  // labels present
  expect(html).toContain('GOVERNMENT');
  expect(html).toContain('OPPOSITION');
});

it('CoG Westminster: 18 seats, 2x badge, same layout', () => {
  const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
  const res = runSimulation(sc, defaultDistricts());
  const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cog" />);
  const circles = [...html.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="19"/g)];
  expect(circles.length).toBe(18);
  expect((html.match(/2×/g) ?? []).length).toBeGreaterThanOrEqual(18);
  expect(html).toContain('GOVERNMENT');
  expect(html).toContain('OPPOSITION');
});
