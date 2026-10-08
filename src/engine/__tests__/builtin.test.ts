import { it, expect } from 'vitest';
import { BUILTIN_TEMPLATES } from '../../data/builtinTemplates';
import { runSimulation, validateScenario } from '../simulate';
import { defaultDistricts } from '../../data/presets';

it('built-in template: 25th Saeima loads and simulates correctly', () => {
  const tpl = BUILTIN_TEMPLATES.find((t) => t.label === '25th Saeima — The Left Won');
  expect(tpl).toBeDefined();
  const sc = tpl!.build();
  // Structure: 18 alliances, 4 blocs, 301 Saeima seats total
  expect(sc.alliances.length).toBe(17);
  expect(sc.regionalAlliances.length).toBe(4);
  // The 25th Saeima lore tables sum to 300 seats (one seat unlisted).
  const seats = sc.parties.reduce((s, p) => s + p.saeimaSeats, 0);
  expect(seats).toBe(300);
  // Validation: no errors
  const issues = validateScenario(sc, defaultDistricts());
  expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  // Simulation: totals exact, no sweep
  const res = runSimulation(sc, defaultDistricts());
  const total = Object.values(res.councilorTotals).reduce((s, x) => s + x, 0);
  expect(total).toBe(150);
  expect(Object.keys(res.governors).length).toBe(18);
  expect(res.governors['Living Outside Latvia']).toBeUndefined();
  expect(Object.keys(res.councilorTotals).length).toBeGreaterThanOrEqual(10);
  // Government (repc-led) should be the largest CoR force
  const repcSeats = res.councilorTotals['a-repc'] ?? 0;
  const top = Math.max(...Object.values(res.councilorTotals));
  expect(repcSeats).toBe(top);
});

it('ideology catalog: spectrum-ordered, complete, no dupes', async () => {
  const { IDEOLOGIES: items } = await import('../../data/presets');
  expect(items.length).toBe(61);
  expect(new Set(items).size).toBe(items.length);
  // far-left first, far-right last of the spectrum section
  expect(items[0]).toBe('Marxism');
  expect(items.indexOf('Socialism')).toBeLessThan(items.indexOf('Centrism'));
  expect(items.indexOf('Centrism')).toBeLessThan(items.indexOf('National Conservatism'));
  expect(items.indexOf('Ethnic Nationalism')).toBeLessThan(items.indexOf('Populism'));
  // spectrum-external at the bottom
  const last6 = items.slice(-6);
  expect(last6).toContain('Latgalian Regionalism');
  expect(last6).toContain('EU Federalism');
});
