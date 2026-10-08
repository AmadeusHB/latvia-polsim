import { it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SaeimaArc, WestminsterDiagram } from '../../components/Diagrams';
import { runSimulation } from '../simulate';
import { defaultDistricts } from '../../data/presets';
import { mkScenario } from './calibration.test';

it('diagrams render with all seats', () => {
  const sc = mkScenario();
  const res = runSimulation(sc, defaultDistricts());
  const saeima = renderToString(<SaeimaArc scenario={sc} />);
  const corSeats = (saeima.match(/<circle /g) ?? []).length;
  expect(corSeats).toBe(301);
  const cor = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cor" />);
  const corCount = (cor.match(/<circle /g) ?? []).length;
  expect(corCount).toBe(150);
  const cog = renderToString(<WestminsterDiagram scenario={sc} results={res} mode="cog" />);
  const cogCount = (cog.match(/<circle /g) ?? []).length;
  expect(cogCount).toBe(18);
  // legend present
  expect(cor).toContain('legend-item');
});

it('bloc-less alliances still win CoR seats and governorships (#8)', () => {
  const sc = mkScenario();
  // detach all blocs
  for (const a of sc.alliances) a.regionalAllianceId = null;
  sc.regionalAlliances = [];
  const res = runSimulation(sc, defaultDistricts());
  const total = Object.values(res.councilorTotals).reduce((s, x) => s + x, 0);
  expect(total).toBe(150);
  expect(Object.keys(res.governors).length).toBe(18);
  // many distinct alliances hold seats without any blocs
  expect(Object.keys(res.councilorTotals).length).toBeGreaterThanOrEqual(10);
});
