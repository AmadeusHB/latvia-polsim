import { it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { WestminsterDiagram } from '../../components/Diagrams';
import { runSimulation } from '../simulate';
import { defaultDistricts } from '../../data/presets';
import { buildScenario, RIGHT, RIGHT_BLOCS } from './reference.test';

it('CoG: government seats sit on the left arm, opposition on the right', () => {
  const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
  const res = runSimulation(sc, defaultDistricts());
  const html = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cog" />);
  // W = 2*r_o + 240; get viewBox
  const vb = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
  const W = +vb[1];
  const circles = [...html.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="19"/g)].map((m) => ({ cx: +m[1], cy: +m[2] }));
  const titles = [...html.matchAll(/<circle[^>]*><title>([^<]*)<\/title>/g)].map((m) => m[1]);
  // gov districts: first quarter of seats should be left of center; opp right
  const first = titles[0];
  const last = titles[titles.length - 1];
  expect(circles[0].cx).toBeLessThan(W / 2);
  expect(circles[circles.length - 1].cx).toBeGreaterThan(W / 2);
  expect(first).toBeTruthy();
  expect(last).toBeTruthy();
});
