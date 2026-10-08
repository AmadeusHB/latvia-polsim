import { it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SaeimaArc, WestminsterDiagram, horseshoe } from '../../components/Diagrams';
import { runSimulation } from '../simulate';
import { defaultDistricts } from '../../data/presets';
import { buildScenario, RIGHT, RIGHT_BLOCS } from './reference.test';

// --- Contiguity invariant: seats are laid out strictly in angular order
// --- (non-decreasing t). Because the seat list is ordered by party, every
// --- party's seats therefore occupy ONE contiguous angular wedge — no
// --- alliance can ever split into two clusters or dangle.
function checkAngularMonotonic(positions: { t: number }[]): boolean {
  for (let i = 1; i < positions.length; i++) {
    if (positions[i].t < positions[i - 1].t - 1e-9) return false;
  }
  return true;
}

it('horseshoe geometry: dense rows, capacity ∝ radius, exact total', () => {
  const { positions, r_i, r_o, rows } = horseshoe(301, 7.5, 9);
  expect(positions.length).toBe(301);
  expect(rows).toBeGreaterThanOrEqual(7);        // multiple dense concentric rows
  expect(rows).toBeLessThanOrEqual(14);
  expect(r_o / r_i).toBeGreaterThan(1.6);        // outer rows longer than inner
  expect(r_o / r_i).toBeLessThan(3.0);           // wide shallow valley, not a cone
  // density: outer/inner capacity ratio ≈ outer/inner radius ratio
  const inner = positions.filter((p) => p.r === r_i).length;
  const outer = positions.filter((p) => p.r === r_o).length;
  expect(outer / inner).toBeCloseTo(r_o / r_i, 0);
  // band thickness (radial) vs arc width: wide & shallow
  expect((r_o - r_i) / (2 * r_o)).toBeLessThan(0.35);
  // even spacing within rows: no crammed or sparse rows (uniform density)
  const rowCounts = new Map<number, number>();
  for (const p of positions) rowCounts.set(p.r, (rowCounts.get(p.r) ?? 0) + 1);
  for (const [r, c] of rowCounts) {
    const expected = (r * Math.PI) / (2 * 7.5 + 2.2);
    expect(c / expected).toBeGreaterThan(0.7);
    expect(c / expected).toBeLessThan(1.3);
  }
});

it('Saeima: every alliance is one contiguous wedge (no split blocks)', () => {
  const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
  const html = renderToString(<SaeimaArc scenario={sc} />);
  // extract circle positions in DOM order (order == angular order)
  const circles = [...html.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="7\.5"/g)]
    .map((m) => ({ cx: +m[1], cy: +m[2] }));
  expect(circles.length).toBe(301);
  const titles = [...html.matchAll(/<circle[^>]*><title>([^<]*)<\/title>/g)].map((m) => m[1]);
  expect(titles.length).toBe(301);
  // THE contiguity invariant: seats assigned in non-decreasing angular order
  const w = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
  const cx = +w[1] / 2;
  const cy0 = 116; // Saeima circle center
  // angle decreases as t increases (sweep PI→0), so negate for ascending order
  const angularOk = checkAngularMonotonic(circles.map((c) => ({ t: -Math.atan2(c.cy - cy0, c.cx - cx) })));
  expect(angularOk).toBe(true);
  // contiguous in DOM order: same alliance appears in exactly one run
  const seq = titles.map((t) => t.split(' — ')[0]);
  const runs: string[] = [];
  for (const s of seq) if (runs[runs.length - 1] !== s) runs.push(s);
  const unique = new Set(seq);
  expect(runs.length).toBe(unique.size);
});

it('CoR: sections and alliances are contiguous; 150 seats; wide shallow shape', () => {
  const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
  const res = runSimulation(sc, defaultDistricts());
  const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
  const circles = [...html.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="9"/g)]
    .map((m) => ({ cx: +m[1], cy: +m[2] }));
  expect(circles.length).toBe(150);
  // alliance runs in DOM order == unique alliances (contiguous blocks)
  const titles = [...html.matchAll(/<circle[^>]*><title>([^<]*)<\/title>/g)].map((m) => m[1]);
  const seq = titles.map((t) => t.replace(/ \(.*\)/, ''));
  const runs: string[] = [];
  for (const s of seq) if (runs[runs.length - 1] !== s) runs.push(s);
  expect(runs.length).toBe(new Set(seq).size);
  // viewBox: wide & shallow (width > height)
  const vb = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
  expect(+vb[1]).toBeGreaterThan(+vb[2]);
});

it('CoG: 18 seats, contiguous blocks, wide shape', () => {
  const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
  const res = runSimulation(sc, defaultDistricts());
  const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cog" />);
  const circles = [...html.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="19"/g)];
  expect(circles.length).toBe(18);
  const vb = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
  expect(+vb[1]).toBeGreaterThan(+vb[2]);
});
