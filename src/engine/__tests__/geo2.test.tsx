import { it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SaeimaArc, WestminsterDiagram } from '../../components/Diagrams';
import { runSimulation } from '../simulate';
import { defaultDistricts } from '../../data/presets';
import { buildScenario, RIGHT, RIGHT_BLOCS } from './reference.test';

it('Saeima arc renders above the baseline (not upside down)', () => {
  const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
  const html = renderToString(<SaeimaArc scenario={sc} />);
  // extract all seat circle positions
  const circles = [...html.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="7.6"/g)]
    .map((m) => ({ cx: +m[1], cy: +m[2] }));
  expect(circles.length).toBeGreaterThan(200);
  // baseline cy is at H-44 = 456 (viewBox 920x500). Seats must be ABOVE it (cy < 456)
  // except a few end-row seats that can dip slightly; the arc's apex (top) must be well above the ends.
  const cys = circles.map((c) => c.cy);
  const minCy = Math.min(...cys);   // apex (highest)
  const maxCy = Math.max(...cys);   // ends (lowest)
  // apex should be near the TOP of the canvas
  expect(minCy).toBeLessThan(150);
  // ends should be at/near the baseline, much lower than apex
  expect(maxCy).toBeGreaterThan(380);
  // center column of seats should be higher than the outer columns (arc shape)
  const centerSeats = circles.filter((c) => Math.abs(c.cx - 460) < 20);
  const edgeSeats = circles.filter((c) => c.cx < 120 || c.cx > 800);
  const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);
  expect(avg(centerSeats.map((c) => c.cy))).toBeLessThan(avg(edgeSeats.map((c) => c.cy)));
});

it('Westminster legend percentages are relative to the whole chamber', () => {
  const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
  const res = runSimulation(sc, defaultDistricts());
  const cor = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
  // extract all legend percentage values
  const pcts = [...cor.matchAll(/\(<!-- -->(\d+\.\d)<!-- -->%/g)].map((m) => +m[1]);
  expect(pcts.length).toBeGreaterThan(5);
  const sum = pcts.reduce((s, x) => s + x, 0);
  // all legend items together across sections should sum to ~100% of the chamber
  expect(sum).toBeCloseTo(100, 0);
  // and each individual value should be its share of 150 (max ~<= 30%)
  expect(Math.max(...pcts)).toBeLessThan(35);
  const cog = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cog" />);
  const cogPcts = [...cog.matchAll(/\(<!-- -->(\d+\.\d)<!-- -->%/g)].map((m) => +m[1]);
  const cogSum = cogPcts.reduce((s, x) => s + x, 0);
  expect(cogSum).toBeCloseTo(100, 0);
});
