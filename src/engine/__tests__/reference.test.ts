import { describe, it, expect } from 'vitest';
import { runSimulation } from '../simulate';
import { defaultDistricts } from '../../data/presets';
import type { DistrictName } from '../../types';
import { buildScenario, RIGHT, RIGHT_BLOCS, RIGHT_GOV, ELECTIONS } from './referenceData';

function compareGovernors(res: ReturnType<typeof runSimulation>, expected: Record<string, string>) {
  const rows: { district: string; expected: string; got: string; ok: boolean }[] = [];
  for (const [district, expKey] of Object.entries(expected)) {
    const got = res.governors[district as DistrictName] ?? '';
    const gotKey = got.replace('a-', '');
    rows.push({ district, expected: expKey, got: gotKey, ok: gotKey === expKey });
  }
  return rows;
}

function topAllianceShares(res: ReturnType<typeof runSimulation>, district: string, n = 5) {
  const dr = res.districtResults[district as DistrictName];
  return Object.entries(dr.shares)
    .sort((a: any, b: any) => b[1].finalShare - a[1].finalShare)
    .slice(0, n)
    .map(([aid, log]: any) => ({ key: aid.replace('a-', ''), share: log.finalShare }));
}

describe('Calibration vs reference: 20th Saeima (RIGHT WON)', () => {
  const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
  const res = runSimulation(sc, defaultDistricts());

  it('totals are exact', () => {
    const total = Object.values(res.councilorTotals).reduce((s, x) => s + x, 0);
    expect(total).toBe(150);
    expect(Object.keys(res.governors).length).toBe(18);
  });

  it('many alliances win CoR seats (no sweep)', () => {
    expect(Object.keys(res.councilorTotals).length).toBeGreaterThanOrEqual(12);
    const top = Math.max(...Object.values(res.councilorTotals));
    expect(top).toBeLessThanOrEqual(40);
  });

  it('governors: reasonable agreement with reference', () => {
    const rows = compareGovernors(res, RIGHT_GOV);
    const hits = rows.filter((r) => r.ok).length;
    // Report for visibility
    const missed = rows.filter((r) => !r.ok).map((r) => `${r.district}: want ${r.expected}, got ${r.got}`);
    if (missed.length) console.log('GOV MISMATCHES:\n' + missed.join('\n'));
    console.log('GOV HITS: ' + hits + '/18');
    expect(hits).toBeGreaterThanOrEqual(6);
  });

  it('regional patterns: expected district leaders lead', () => {
    // Riga: PLP-led in reference
    const rigaTop = topAllianceShares(res, 'Riga', 1)[0];
    expect(rigaTop.key).toBe('prolp');
    // Latgale: regionalist lists strong (tfl + latcon combined significant)
    const latgale = topAllianceShares(res, 'Latgale', 8);
    const tflShare = latgale.find((x) => x.key === 'tfl')?.share ?? 0;
    const latconShare = latgale.find((x) => x.key === 'latcon')?.share ?? 0;
    expect(tflShare + latconShare).toBeGreaterThan(0.18);
    // Vidzeme: natcons strong (5/10 seats in reference)
    const vidzeme = topAllianceShares(res, 'Vidzeme', 3);
    expect(vidzeme[0].key).toBe('natcons');
  });

  it('district delegations roughly match reference shape', () => {
    // Reference Riga (25 seats): PLP 4, HSR 6, LA 2, RB 1 — left/urban lists strong
    const rigaSeats: Record<string, number> = {};
    for (const e of res.districtResults['Riga'].elected) {
      rigaSeats[e.allianceId.replace('a-', '')] = (rigaSeats[e.allianceId.replace('a-', '')] ?? 0) + 1;
    }
    // In reference, no single list takes more than 6/25 (24%) in Riga
    const maxSeats = Math.max(...Object.values(rigaSeats));
    expect(maxSeats).toBeLessThanOrEqual(9);
  });
});

// ---------------- 24th Saeima: CENTER WON ----------------

describe.each(ELECTIONS as readonly any[])('Reference: %s', (ele: any) => {
  const sc = buildScenario(ele.specs as any, ele.blocs as any, ele.seed);
  const res = runSimulation(sc, defaultDistricts());

  it('totals exact + no sweep', () => {
    const total = Object.values(res.councilorTotals).reduce((s, x) => s + x, 0);
    expect(total).toBe(150);
    expect(Object.keys(res.governors).length).toBe(18);
    expect(Object.keys(res.councilorTotals).length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...Object.values(res.councilorTotals))).toBeLessThanOrEqual(40);
  });

  it('governors match reference reasonably', () => {
    const rows = compareGovernors(res, ele.gov);
    const hits = rows.filter((r) => r.ok).length;
    const missed = rows.filter((r) => !r.ok).map((r) => `${r.district}: want ${r.expected} got ${r.got}`);
    console.log(`[${ele.name}] GOV HITS: ${hits}/18; misses: ${missed.join('; ') || 'none'}`);
    expect(hits).toBeGreaterThanOrEqual(7);
  });
});
