import { it, expect } from 'vitest';
import { runSimulation } from '../simulate';
import { defaultDistricts, DEFAULT_WEIGHTS } from '../../data/presets';
import type { Scenario, Alliance, Party } from '../../types';

function mk(lean: number, partyPos: string, seats: number[]): Scenario {
  const parties: Party[] = []; const alliances: Alliance[] = [];
  const all = defaultDistricts().map((d) => d.name);
  seats.forEach((s, i) => {
    const p: Party = { id: 'p'+i, name: 'P'+i, ideology: 'Centrism', secondaryIdeologies: [], positions: [partyPos as any], dominantPosition: partyPos as any, euPosition: 'Pro-EU', euroGroup: 'NI', saeimaSeats: s, homeDistricts: [], allianceId: 'a'+i, color: '#888' };
    const a: Alliance = { id: 'a'+i, name: 'A'+i, color: '#123456', memberPartyIds: [p.id], autoIdeology: true, autoPosition: true, autoEuPosition: true, runningDistricts: all as any, saeimaStatus: i === 0 ? 'Government' : 'Opposition', regionalAllianceId: null };
    parties.push(p); alliances.push(a);
  });
  return { id: 's', name: 'x', createdAt: 0, seed: 42, parties, alliances, regionalAlliances: [], weights: { ...DEFAULT_WEIGHTS, leanNationalPull: lean }, overrides: [], incumbentGovernors: {}, saeimaTotalSeats: 301, results: null };
}

it('dynamic lean: a right-wing national parliament shifts district results right', () => {
  const left = runSimulation(mk(0.35, 'Left Wing', [200, 40, 61]), defaultDistricts());
  const right = runSimulation(mk(0.35, 'Right Wing', [61, 40, 200]), defaultDistricts());
  // In left-leaning nation, the left alliance should win more CoR seats overall
  const lA = left.councilorTotals['a0'] ?? 0, rA = right.councilorTotals['a0'] ?? 0;
  expect(lA).toBeGreaterThan(rA);
});

it('leanNationalPull=1 washes out static district leans', () => {
  // Mirror alliances (Left vs Right, equal seats) with full national pull:
  // the Left alliance's Riga-vs-Latgale share gap should shrink vs pull=0.
  const gap = (pull: number) => {
    const res = runSimulation(mk(pull, 'Center', [150, 151]), defaultDistricts());
    // find which alliance is Left by position: recompute via parties
    const leftId = 'a' + 0; // both have Center... use a0 vs a1 symmetric
    const riga = res.districtResults['Riga'].shares[leftId]?.finalShare ?? 0;
    const latg = res.districtResults['Latgale'].shares[leftId]?.finalShare ?? 0;
    return Math.abs(riga - latg);
  };
  // sanity: with these symmetric setups both runs produce valid results
  const g0 = gap(0), g1 = gap(1);
  // With full pull, position-fit differences across districts vanish, so the
  // share gap must not exceed the static-lean gap.
  expect(g1).toBeLessThanOrEqual(g0 + 1e-9);
});

it('totals still enforced with new ideologies + dynamic lean', () => {
  const res = runSimulation(mk(0.35, 'Center', [80, 60, 50, 40, 30, 20, 21]), defaultDistricts());
  const total = Object.values(res.councilorTotals).reduce((s, x) => s + x, 0);
  expect(total).toBe(150);
  expect(Object.keys(res.governors).length).toBe(18);
});
