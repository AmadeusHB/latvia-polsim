import { it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SaeimaArc, WestminsterDiagram } from '../../components/Diagrams';
import { runSimulation } from '../simulate';
import { defaultDistricts } from '../../data/presets';
import { buildScenario, RIGHT, RIGHT_BLOCS } from './reference.test';

it('diagram cards render polished structure', () => {
  const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
  const res = runSimulation(sc, defaultDistricts());
  const html = renderToString(<div><SaeimaArc scenario={sc} /><WestminsterDiagram scenario={sc} results={res} mode="cor" /><WestminsterDiagram scenario={sc} results={res} mode="cog" /></div>);
  expect(html).toContain('diagram-card');
  expect(html).toContain('diagram-title');
  expect(html).toContain('Saeima');
  expect(html).toContain('Council of Regions');
  expect(html).toContain('Council of Governors');
  expect(html).toContain('legend-cols');
  expect(html).toContain('Government');

});
