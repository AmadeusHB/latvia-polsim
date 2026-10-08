import { describe, it, expect } from 'vitest';
import { meekStv, droopQuota } from '../meek';
import { Rng } from '../rng';
import { impliedVoteShare, runSimulation, validateScenario } from '../simulate';
import { defaultDistricts, DEFAULT_WEIGHTS } from '../../data/presets';
import type { Scenario, Alliance, Party } from '../../types';

function mkAlliance(id: string, name: string, seats: number, districts: string[]): { a: Alliance; p: Party } {
  const party: Party = {
    id: 'p-' + id, name: name + ' Party', ideology: 'Centrism', secondaryIdeologies: [],
    positions: ['Center'], dominantPosition: 'Center', euPosition: 'Pro-EU', euroGroup: 'NI',
    saeimaSeats: seats, homeDistricts: [], runningDistricts: [], allianceId: id, color: '#888888',
  };
  const a: Alliance = {
    id, name, color: '#123456', memberPartyIds: [party.id], autoIdeology: true, autoPosition: true,
    autoEuPosition: true, runningDistricts: districts as any, saeimaStatus: 'Opposition', regionalAllianceId: null,
  };
  return { a, p: party };
}

function mkScenario(n: number): Scenario {
  const parties: Party[] = [];
  const alliances: Alliance[] = [];
  for (let i = 0; i < n; i++) {
    const { a, p } = mkAlliance('a' + i, 'A' + i, 10 + i * 5, ['Riga']);
    parties.push(p);
    alliances.push(a);
  }
  const all = defaultDistricts().map((d) => d.name);
  for (const a of alliances) a.runningDistricts = all as any;
  return {
    id: 's1', name: 'test', createdAt: 0, seed: 42,
    parties, alliances, regionalAlliances: [],
    weights: { ...DEFAULT_WEIGHTS }, overrides: [], incumbentGovernors: {},
    saeimaTotalSeats: 301, results: null,
  };
}

describe('Meek STV', () => {
  it('elects the strongest two proportionally in a multi-alliance district', () => {
    const ballots = [
      { ranking: ['A'], weight: 600 },
      { ranking: ['B'], weight: 300 },
      { ranking: ['C'], weight: 100 },
    ];
    const rng = new Rng(1);
    const r = meekStv(ballots, ['A', 'B', 'C'], 2, () => rng.next());
    expect(r.elected.length).toBe(2);
    expect(r.elected).toContain('A');
    expect(r.elected).toContain('B');
    expect(r.elected).not.toContain('C');
    expect(r.eliminatedOrder).toContain('C');
  });

  it('transfers preferences when a small alliance is eliminated', () => {
    // Quota = floor(100/3)+1 = 34. A (50) is elected with a surplus; B (30) and
    // C (20) are below quota, so C is eliminated and its ballots transfer to B,
    // which then reaches quota.
    const ballots = [
      { ranking: ['A'], weight: 50 },
      { ranking: ['B'], weight: 30 },
      { ranking: ['C', 'B'], weight: 20 },
    ];
    const rng = new Rng(1);
    const r = meekStv(ballots, ['A', 'B', 'C'], 2, () => rng.next());
    expect(r.elected.length).toBe(2);
    expect(r.eliminatedOrder).toContain('C');
    expect(r.elected).toContain('A');
    expect(r.elected).toContain('B');
  });

  it('droop quota is correct', () => {
    expect(droopQuota(1000, 4)).toBe(201);
    expect(droopQuota(100, 2)).toBe(34);
  });
});

describe('Simulation totals', () => {
  it('always elects exactly 150 councilors and 18 governors', () => {
    const sc = mkScenario(12);
    const res = runSimulation(sc, defaultDistricts());
    const totalSeats = Object.values(res.councilorTotals).reduce((s, x) => s + x, 0);
    expect(totalSeats).toBe(150);
    expect(Object.keys(res.governors).length).toBe(18);
    expect(res.governors['Living Outside Latvia']).toBeUndefined();
    expect(res.districtResults['Living Outside Latvia'].governor).toBeUndefined();
  });

  it('reproduces identical results with a fixed seed', () => {
    const sc = mkScenario(8);
    const r1 = runSimulation(sc, defaultDistricts());
    const r2 = runSimulation(sc, defaultDistricts());
    expect(r1.councilorTotals).toEqual(r2.councilorTotals);
    expect(r1.governors).toEqual(r2.governors);
  });
});

describe('Validation', () => {
  it('rejects a party in two alliances', () => {
    const sc = mkScenario(3);
    const { a: rogue } = mkAlliance('rogue', 'Rogue', 10, ['Riga']);
    rogue.memberPartyIds = [sc.parties[0].id];
    sc.alliances.push(rogue);
    const issues = validateScenario(sc, defaultDistricts());
    expect(issues.some((i) => i.level === 'error' && /multiple alliances/.test(i.message))).toBe(true);
  });
});

describe('Seat curve', () => {
  it('gives small parties above seat share and big parties below', () => {
    const small = impliedVoteShare(5, 301, 0.06);
    const big = impliedVoteShare(150, 301, 0.06);
    expect(small).toBeGreaterThan(5 / 301);
    expect(big).toBeLessThan(150 / 301);
  });
});
