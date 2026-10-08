// ============================================================
// Calibration validation harness (R7).
// For each of the six historical elections: take the Saeima result
// as input, run the generator, and score against ground truth.
// Exposed behind the behind-the-scenes toggle.
// ============================================================
import type { District, SimulationResult, DistrictName } from '../types';
import { runSimulation, positionScore, computeAlliances } from './simulate';
import { defaultDistricts } from '../data/presets';
import {
  GROUND_TRUTHS, allianceMeta, parseSaeimaLine,
  type GroundTruth, type AllianceKey,
} from '../data/historicalElections';

export interface ElectionCalibration {
  label: string;
  governing: string[];
  governorAccuracy: number;         // 0..18
  governorTotal: number;
  shareCorrelation: number;         // mean Pearson over districts
  concentration: { alliance: string; peakDistrict: string; ratio: number }[];
  strongholdsHeld: number;
  strongholdsFlipped: number;
  flags: string[];
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

const STRONGHOLDS: Record<string, string[]> = {
  // district -> families that essentially never flip (P5)
  Liepāja: ['industrial-left'],
  Rēzekne: ['latgale-left'],
  Riga: ['urban-left'],
  Daugavpils: ['industrial-left', 'latgale-left'],
  Latgale: ['latgale-left'],
  'Greater Daugavpils': ['latgale-left'],
  Vidzeme: ['natcon'],
  Cēsis: ['natcon'],
};

export function calibrateElection(gt: GroundTruth, districts: District[]): { report: ElectionCalibration; res: SimulationResult } {
  const res = runSimulation(gt.scenario, districts);
  const nameToKey = new Map<string, AllianceKey>();
  for (const s of parseSaeimaLine(gt.election.saeima)) nameToKey.set('ha-' + s.key, s.key);

  // Governor accuracy
  let correct = 0, total = 0;
  for (const [dname, actualKey] of Object.entries(gt.governors) as [DistrictName, AllianceKey][]) {
    total++;
    const simulatedId = res.governors[dname];
    if (simulatedId && nameToKey.get(simulatedId) === actualKey) correct++;
  }

  // Per-district correlation: simulated ELECTED seats vs actual seats
  // (both sides quantized by STV — comparing vote shares to seat shares
  // underestimates agreement in small districts).
  const correlations: number[] = [];
  for (const pd of gt.districts) {
    const dr = res.districtResults[pd.district];
    if (!dr) continue;
    const keys = [...nameToKey.values()];
    const actual: number[] = [], simulated: number[] = [];
    const simSeats: Record<string, number> = {};
    for (const e of dr.elected) simSeats[e.allianceId] = (simSeats[e.allianceId] ?? 0) + 1;
    for (const k of keys) {
      actual.push((pd.seats[k] ?? 0) / Math.max(1, pd.totalSeats));
      simulated.push((simSeats['ha-' + k] ?? 0) / Math.max(1, dr.elected.length));
    }
    correlations.push(pearson(actual, simulated));
  }

  // Concentration: peak district share / national share for stronghold parties
  const concentration: ElectionCalibration['concentration'] = [];
  const saeimaParsed = parseSaeimaLine(gt.election.saeima);
  for (const { key } of saeimaParsed) {
    const drs = gt.districts.map((pd) => ({
      district: pd.district,
      share: (pd.seats[key] ?? 0) / Math.max(1, pd.totalSeats),
    })).filter((x) => x.share > 0);
    if (drs.length === 0) continue;
    const peak = drs.reduce((a, b) => (b.share > a.share ? b : a));
    const national = (gt.councilorTotals[key] ?? 0) / Math.max(1, gt.coorTotal);
    if (national <= 0) continue;
    const ratio = peak.share / national;
    if (ratio >= 2.0) {
      concentration.push({ alliance: allianceMeta(key).name, peakDistrict: peak.district, ratio });
    }
  }
  concentration.sort((a, b) => b.ratio - a.ratio);

  // Stronghold tracking: did the stronghold family hold the governorship?
  let held = 0, flipped = 0;
  for (const [dname, families] of Object.entries(STRONGHOLDS)) {
    const actualKey = gt.governors[dname as DistrictName];
    if (!actualKey) continue;
    const simId = res.governors[dname as DistrictName];
    const simKey = simId ? nameToKey.get(simId) : undefined;
    const actualFamily = allianceMeta(actualKey).family;
    const simFamily = simKey ? allianceMeta(simKey).family : undefined;
    if (families.includes(actualFamily)) {
      if (simFamily && families.includes(simFamily)) held++;
      else flipped++;
    }
  }

  const governing = saeimaParsed.filter((x) => x.status === 'Government')
    .map((x) => allianceMeta(x.key).name);

  const report: ElectionCalibration = {
    label: gt.election.label,
    governing,
    governorAccuracy: correct,
    governorTotal: total,
    shareCorrelation: correlations.length
      ? correlations.reduce((s, x) => s + x, 0) / correlations.length : 0,
    concentration: concentration.slice(0, 3),
    strongholdsHeld: held,
    strongholdsFlipped: flipped,
    flags: gt.flags,
  };
  return { report, res };
}

export interface CalibrationReport {
  elections: ElectionCalibration[];
  meanGovernorAccuracy: number;
  meanShareCorrelation: number;
  antiHomogenization: { district: string; correlation: number; tooUniform: boolean }[];
}

// Full report across all six elections + the P4 swing / anti-homogenization check.
export function runCalibration(districts: District[] = defaultDistricts()): CalibrationReport {
  const results = GROUND_TRUTHS.map((gt) => calibrateElection(gt, districts));
  const elections = results.map((r) => r.report);

  // Anti-homogenization (R3): per district, correlation of simulated
  // district winner-family shares vs national shares across the six elections.
  const antiHomog: CalibrationReport['antiHomogenization'] = [];
  const districtNames = districts.map((d) => d.name);
  for (const dname of districtNames) {
    const natShares: number[] = [], distShares: number[] = [];
    for (const { gt, res } of GROUND_TRUTHS.map((g, i) => ({ gt: g, res: results[i].res }))) {
      const dr = res.districtResults[dname];
      if (!dr) continue;
      // district left-share vs national left-share (P4)
      const alliances = computeAlliances(gt.scenario);
      const byId = new Map(alliances.map((a) => [a.id, a]));
      let dl = 0, dTot = 0;
      for (const [aid, log] of Object.entries(dr.shares)) {
        const a = byId.get(aid);
        if (!a) continue;
        const pos = positionScore(a.positions, a.dominantPosition);
        dl += log.finalShare * -pos; // higher = more left
        dTot += log.finalShare;
      }
      const natLeft = alliances.reduce((s, a) => {
        return s + a.seatShare * -positionScore(a.positions, a.dominantPosition);
      }, 0);
      distShares.push(dTot > 0 ? dl / dTot : 0);
      natShares.push(natLeft);
    }
    const corr = pearson(natShares, distShares);
    antiHomog.push({
      district: dname,
      correlation: corr,
      tooUniform: corr > 0.99,
    });
  }

  return {
    elections,
    meanGovernorAccuracy: elections.reduce((s, e) => s + e.governorAccuracy, 0) / elections.length,
    meanShareCorrelation: elections.reduce((s, e) => s + e.shareCorrelation, 0) / elections.length,
    antiHomogenization: antiHomog,
  };
}
