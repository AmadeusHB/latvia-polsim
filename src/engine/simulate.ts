import type {
  District, DistrictResult, DistrictTraits, GovernorResult, ModifierLog,
  Party, Scenario, SimulationResult, Weights, Position, EUPosition,
} from '../types';
import { TRAIT_KEYS, IDEOLOGY_AFFINITIES, DISTRICT_IDENTITY } from '../data/presets';
import type { TraitKey } from '../data/presets';
import { Rng } from './rng';
import { meekStv, droopQuota } from './meek';
import type { WeightedBallot } from './meek';

// ---------- Seats -> implied national vote share ----------
// Documented conversion (adjustable via seatCurveAlpha):
//   s = seats/301 (seat share)
//   v = s * (0.85 + 0.30 * exp(-3*s) + alpha * (1 - s) * 0.5)
// Small parties (s→0): factor ≈ 1.15 → vote share slightly ABOVE seat share.
// Large parties (s→1): factor ≈ 0.85 → vote share slightly BELOW seat share.
// The seatCurveAlpha term adds a gentle linear tilt the user can tune.
export function impliedVoteShare(saemimaSeats: number, total: number, alpha: number): number {
  const s = Math.min(1, saemimaSeats / total);
  return s * (0.85 + 0.3 * Math.exp(-3 * s) + alpha * 0.5 * (1 - s));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function traitVector(t: DistrictTraits): number[] {
  return TRAIT_KEYS.map((k) => (t as any)[k] ?? 0);
}

// Standardized trait vector: (x - mean) / sd over the given districts, so that
// cosine similarity between ideology affinity vectors and district profiles
// actually discriminates (raw 0–10 scales all point the same direction).
export function traitVectorsStandardized(districts: District[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  const n = districts.length;
  for (let i = 0; i < TRAIT_KEYS.length; i++) {
    const vals = districts.map((d) => (d.traits as any)[TRAIT_KEYS[i]] ?? 0);
    const mean = vals.reduce((s, x) => s + x, 0) / n;
    const sd = Math.sqrt(vals.reduce((s, x) => s + (x - mean) ** 2, 0) / n) || 1;
    districts.forEach((d, j) => {
      const v = map.get(d.name) ?? new Array(TRAIT_KEYS.length).fill(0);
      v[i] = (vals[j] - mean) / sd;
      map.set(d.name, v);
    });
  }
  return map;
}

export function ideologyVector(ideology: string, secondaries: string[], weights: Weights): number[] {
  const vec = new Array(TRAIT_KEYS.length).fill(0);
  const add = (ideo: string, w: number) => {
    const aff = IDEOLOGY_AFFINITIES[ideo];
    if (!aff) return;
    for (let i = 0; i < TRAIT_KEYS.length; i++) {
      const v = aff[TRAIT_KEYS[i] as TraitKey];
      if (typeof v === 'number') vec[i] += v * w;
    }
  };
  add(ideology, weights.dominantIdeologyWeight);
  for (const s of secondaries) add(s, weights.secondaryIdeologyWeight);
  return vec;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

// Direct ideology-region affinity: for each trait an ideology cares about,
// multiply its affinity (-n..+n) by the district's normalized trait (0..1),
// then average weighted by |affinity|. Result ~1 = neutral, >1 favorable.
export function affinityScore(ideology: string, secondaries: string[], t: DistrictTraits, w: Weights): number {
  const ideoScores: { aff: Partial<Record<TraitKey, number>>; weight: number }[] = [
    { aff: IDEOLOGY_AFFINITIES[ideology] ?? {}, weight: w.dominantIdeologyWeight },
    ...secondaries.map((sec) => ({ aff: IDEOLOGY_AFFINITIES[sec] ?? {}, weight: w.secondaryIdeologyWeight })),
  ];
  let sum = 0, wsum = 0;
  for (const { aff, weight } of ideoScores) {
    for (const [k, v] of Object.entries(aff) as [TraitKey, number][]) {
      const traitVal = ((t as any)[k] ?? 0) / 10; // 0..1
      sum += v * traitVal * weight * 0.1;
      wsum += Math.abs(v) * weight * 0.1;
    }
  }
  // sum ranges roughly [-1, 1] for strong matches; center at 1.0
  return wsum > 0 ? 1 + sum / wsum * Math.min(1, wsum) : 1;
}

export function positionScore(positions: Position[], dominant: Position): number {
  // Weighted mean numeric position; Big Tent -> 0; Syncretic -> 0 (placed by secondary).
  let sum = 0, wsum = 0;
  for (const p of positions) {
    const n = p === 'Big Tent' || p === 'Syncretic' ? 0 : (({ 'Far Left': -3, 'Left Wing': -2, 'Center Left': -1, 'Center': 0, 'Center Right': 1, 'Right Wing': 2, 'Far Right': 3 } as any)[p]);
    const w = p === dominant ? 1 : 0.4;
    sum += n * w; wsum += w;
  }
  return wsum > 0 ? sum / wsum : 0;
}

export function euEffect(stance: EUPosition, enthusiasm: number, w: Weights): number {
  const e = enthusiasm / 10; // 0..1
  const scale = (2 * e - 1); // -1..1, high enthusiasm -> +1
  let base = 1;
  if (stance === 'Pro-EU') {
    base = scale >= 0
      ? 1 + (w.euProHigh - 1) * scale
      : 1 + (1 - w.euProLow) * scale;
  } else if (stance === 'Hard Anti-EU') {
    const hi = w.euHardAntiHigh, lo = w.euHardAntiLow;
    base = scale >= 0
      ? 1 + (hi - 1) * scale
      : 1 + (1 - lo) * scale;
  } else {
    const hi = 1 + (w.euHardAntiHigh - 1) * w.euSoftFactor;
    const lo = 1 + (1 - w.euHardAntiLow) * w.euSoftFactor;
    base = scale >= 0 ? 1 + (hi - 1) * scale : 1 + (1 - lo) * scale;
  }
  return clamp(base, w.euMin, w.euMax);
}

export interface AllianceComputed {
  id: string;
  name: string;
  color: string;
  ideology: string;
  secondaryIdeologies: string[];
  positions: Position[];
  dominantPosition: Position;
  euPosition: EUPosition;
  nationalShare: number; // implied vote share
  seatShare: number;
  runningDistricts: Set<string>;
  homeDistricts: Set<string>;
  partyIds: string[];
  regionalAllianceId: string | null;
  saeimaSeats: number;
  memberParties: {
    id: string; name: string;
    impliedShare: number;
    positions: Position[];
    dominantPosition: Position;
    homeDistricts: Set<string>;
    runningDistricts: Set<string>;
    homeConcentration: number;
  }[];
}

export function computeAlliances(scenario: Scenario): AllianceComputed[] {
  const parties = new Map<string, Party>(scenario.parties.map((p) => [p.id, p]));
  const w = scenario.weights;
  const totalSeats = scenario.saeimaTotalSeats || 301;
  const out: AllianceComputed[] = [];
  for (const a of scenario.alliances) {
    const members = a.memberPartyIds.map((id) => parties.get(id)).filter(Boolean) as Party[];
    const seatSum = members.reduce((s, p) => s + p.saeimaSeats, 0);
    const implied = members.reduce((s, p) => s + impliedVoteShare(p.saeimaSeats, totalSeats, w.seatCurveAlpha), 0);
    let ideology: string, secondaries: string[], positions: Position[], dominant: Position, eu: EUPosition;
    if (a.autoIdeology) {
      const sorted = [...members].sort((x, y) => y.saeimaSeats - x.saeimaSeats);
      ideology = sorted[0]?.ideology ?? 'Centrism';
      const secCount = new Map<string, number>();
      for (const m of sorted) {
        secCount.set(m.ideology, (secCount.get(m.ideology) ?? 0) + m.saeimaSeats * w.dominantIdeologyWeight);
        for (const s of m.secondaryIdeologies) secCount.set(s, (secCount.get(s) ?? 0) + m.saeimaSeats * w.secondaryIdeologyWeight);
      }
      secondaries = [...secCount.entries()]
        .filter(([k]) => k !== ideology)
        .sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => k);
    } else {
      ideology = a.overrideIdeology ?? 'Centrism';
      secondaries = a.overrideSecondaryIdeologies ?? [];
    }
    if (a.autoPosition) {
      const sorted = [...members].sort((x, y) => y.saeimaSeats - x.saeimaSeats);
      positions = sorted[0]?.positions ?? ['Center'];
      dominant = sorted[0]?.dominantPosition ?? 'Center';
      const extra = new Set<Position>();
      for (const m of members) for (const p of m.positions) if (!positions.includes(p)) extra.add(p);
      positions = [...positions, ...extra];
      eu = sorted[0]?.euPosition ?? 'Pro-EU';
    } else {
      positions = a.overridePositions ?? ['Center'];
      dominant = a.overrideDominantPosition ?? positions[0] ?? 'Center';
      eu = a.overrideEuPosition ?? 'Pro-EU';
    }
    const home = new Set<string>();
    for (const m of members) for (const d of m.homeDistricts) home.add(d);
    // Effective districts: alliance checkbox OR any member party running there.
    const running = new Set<string>(a.runningDistricts);
    for (const m of members) for (const d of m.runningDistricts) running.add(d);
    out.push({
      id: a.id, name: a.name, color: a.color,
      ideology, secondaryIdeologies: secondaries, positions, dominantPosition: dominant, euPosition: eu,
      nationalShare: implied, seatShare: seatSum / totalSeats,
      runningDistricts: running,
      homeDistricts: home, partyIds: a.memberPartyIds,
      regionalAllianceId: a.regionalAllianceId,
      saeimaSeats: seatSum,
      memberParties: members.map((m) => ({
        id: m.id, name: m.name,
        impliedShare: impliedVoteShare(m.saeimaSeats, totalSeats, w.seatCurveAlpha),
        positions: m.positions,
        dominantPosition: m.dominantPosition,
        homeDistricts: new Set(m.homeDistricts),
        runningDistricts: new Set(m.runningDistricts),
        homeConcentration: m.homeConcentration ?? 1,
      })),
    });
  }
  return out;
}

export function euAffiliationWeights(scenario: Scenario, allianceId: string): Record<string, number> {
  const parties = new Map<string, Party>(scenario.parties.map((p) => [p.id, p]));
  const a = scenario.alliances.find((x) => x.id === allianceId);
  if (!a) return {};
  const members = a.memberPartyIds.map((id) => parties.get(id)).filter(Boolean) as Party[];
  const total = members.reduce((s, p) => s + p.saeimaSeats, 0) || 1;
  const agg: Record<string, number> = {};
  for (const m of members) agg[m.euroGroup] = (agg[m.euroGroup] ?? 0) + m.saeimaSeats / total;
  return agg;
}

// District identity multiplier (R1): product over the alliance's ideology
// entries of the district's persistent identity vector, raised to
// identityStrength. Applies equally to renamed/merged alliances because it
// keys on ideology strings only (R8/P6).
export function identityMultiplier(
  ideology: string, secondaries: string[], districtName: string, w: Weights,
): number {
  const vec = DISTRICT_IDENTITY[districtName as keyof typeof DISTRICT_IDENTITY];
  if (!vec || w.identityStrength === 0) return 1;
  let m = 1;
  const entries: [string, number][] = [
    [ideology, w.dominantIdeologyWeight],
    ...secondaries.map((sec) => [sec, w.secondaryIdeologyWeight] as [string, number]),
  ];
  for (const [ideo, weight] of entries) {
    const v = vec[ideo];
    if (typeof v === 'number' && v !== 1) m *= Math.pow(v, weight / w.dominantIdeologyWeight * w.identityStrength);
  }
  return clamp(m, 0.25, 3.5);
}

// National government coattails (R4): governing alliances get a small CoR
// vote bonus; Supply & Confidence at half effect. Never overrides identity.
export function coattailMultiplier(status: string | undefined, w: Weights): number {
  if (status === 'Government') return w.govCoattails;
  if (status === 'Supply and Confidence') return 1 + (w.govCoattails - 1) * 0.5;
  return 1;
}

export function runSimulation(scenario: Scenario, districts: District[]): SimulationResult {
  const w = scenario.weights;
  const seed = scenario.seed;
  const alliances = computeAlliances(scenario);
  const byId = new Map(alliances.map((a) => [a.id, a]));
  const overrides = new Map(scenario.overrides.map((o) => [o.district, o]));
  const districtResults: Record<string, DistrictResult> = {};
  const councilorTotals: Record<string, number> = {};
  const governors: Record<string, string> = {};
  const jointSessionWeights: Record<string, number> = {};

  // Dynamic regional lean: the district's political lean is pulled toward the
  // national implied lean (computed from the parties' Saeima seat shares) with
  // strength w.leanNationalPull (0 = static preset lean, 1 = fully national).
  const nationalLean = (() => {
    const totalSeats = scenario.parties.reduce((s, p) => s + p.saeimaSeats, 0);
    if (totalSeats === 0) return 0;
    return scenario.parties.reduce((s, p) => {
      const positions = [p.dominantPosition];
      return s + positionScore(positions, p.dominantPosition) * (p.saeimaSeats / totalSeats);
    }, 0);
  })();
  const leanOf = (d: District): number =>
    d.traits.lean * (1 - w.leanNationalPull) + nationalLean * w.leanNationalPull;

  for (const d of districts) {
    const dSeedOff = hashString(d.name);
    const dRng = new Rng((seed ^ dSeedOff) >>> 0);
    const running = alliances.filter((a) => a.runningDistricts.has(d.name));
    const ovr = overrides.get(d.name);
    const shares: Record<string, ModifierLog> = {};
    let total = 0;
    const rawScores: Record<string, number> = {};
    const rawMeta: Record<string, any> = {};
    interface ScoreMeta { score: number; breakdown: Record<string, number>; ideologyFit: number; positionFit: number; eu: number; inc: number; noise: number; base: number; identity?: number; coattails?: number; regional?: number; }
    const scoreAlliance = (a: AllianceComputed): ScoreMeta => {
      const ideologyFitRaw = affinityScore(a.ideology, a.secondaryIdeologies, d.traits, w);
      // Map affinity score into [ideologyMin, ideologyMax] with 1.0 at neutral.
      const ideologyFit = clamp(
        1 + (ideologyFitRaw - 1) * 1.6,
        w.ideologyMin, w.ideologyMax);
      const aPos = positionScore(a.positions, a.dominantPosition);
      const posDist = Math.abs(aPos - leanOf(d));
      // Symmetric Gaussian: same closeness bonus/penalty on both sides.
      const positionFit = clamp(Math.exp(-0.5 * (posDist / w.positionCurve) ** 2), w.positionMin, w.positionMax);
      const eu = euEffect(a.euPosition, d.traits.euEnthusiasm, w);
      const incumbentId = scenario.incumbentGovernors[d.name];
      const inc = incumbentId && incumbentId === a.id ? w.incumbentBonus : 1;
      const noise = dRng.logNormal(w.noiseSigma);
      // Base: sum of member-party scores, each distributed by a concentration
      // model. A party's per-district weight = population × (home ? concentration
      // : 1), normalized over the districts it runs in, so its total across the
      // country equals its implied national share × total population. Regional
      // parties (few home districts) dominate their turf; broad parties stay even.
      const districtsOf = (mp: AllianceComputed['memberParties'][number]) =>
        mp.runningDistricts.size > 0
          ? districts.filter((x) => mp.runningDistricts.has(x.name) || a.runningDistricts.has(x.name))
          : districts.filter((x) => a.runningDistricts.has(x.name));
      let partySum = 0;
      const breakdown: Record<string, number> = {};
      for (const mp of a.memberParties) {
        const runs = districtsOf(mp);
        if (runs.length === 0 || !runs.some((x) => x.name === d.name)) continue;
        const weightOf = (x: District) =>
          x.traits.population * (mp.homeDistricts.has(x.name) ? w.homeBonus * mp.homeConcentration : 1);
        const totalWeight = runs.reduce((sm, x) => sm + weightOf(x), 0) || 1;
        const pv = mp.impliedShare * (weightOf(d) / totalWeight);
        breakdown[mp.id] = pv;
        partySum += pv;
      }
      if (partySum === 0) {
        const totalPop = districts.reduce((sm, x) => sm + x.traits.population, 0) || 1;
        partySum = a.nationalShare * (d.traits.population / totalPop);
      }
      const identity = identityMultiplier(a.ideology, a.secondaryIdeologies, d.name, w);
      const coattails = coattailMultiplier(
        scenario.alliances.find((x) => x.id === a.id)?.saeimaStatus, w);
      // Regional floor (R2/P1): alliances below the national threshold win
      // seats effectively only inside their strongholds; elsewhere their vote
      // is suppressed below the STV quota.
      const regional = a.seatShare < w.regionalFloorThreshold && !a.homeDistricts.has(d.name)
        ? w.regionalFloor : 1;
      return {
        score: partySum * ideologyFit * positionFit * eu * inc * identity * coattails * regional * noise,
        breakdown,
        ideologyFit, positionFit, eu, inc, identity, coattails, regional, noise, base: partySum,
      };
    };
    for (const a of running) {
      const r = scoreAlliance(a);
      rawScores[a.id] = r.score;
      rawMeta[a.id] = r;
    }
    // Apply overrides: locked shares fixed; non-locked scores renormalized over remainder.
    const locked: Record<string, number> = {};
    if (ovr) for (const [aid, sh] of Object.entries(ovr.shares)) if (byId.has(aid)) locked[aid] = sh;
    const lockedSum = Object.values(locked).reduce((s, x) => s + x, 0);
    const unlocked = running.filter((a) => !(a.id in locked));
    const unlockedRawSum = unlocked.reduce((s, a) => s + rawScores[a.id], 0) || 1;
    for (const a of unlocked) {
      const share = (1 - lockedSum) * (rawScores[a.id] / unlockedRawSum);
      rawScores[a.id] = share;
    }
    for (const aid of Object.keys(locked)) rawScores[aid] = -1; // marker
    for (const a of running) {
      if (a.id in locked) {
        shares[a.id] = {
          baseShare: 0, ideologyFit: 0, positionFit: 0,
          euEffect: 0, homeBonus: 0, incumbencyBonus: 0, noise: 0,
          finalShare: locked[a.id], rawScore: locked[a.id], votes: Math.round(locked[a.id] * w.ballotsPerDistrict),
        };
      } else {
        const m = rawMeta[a.id];
        shares[a.id] = {
          baseShare: m.base, ideologyFit: m.ideologyFit, positionFit: m.positionFit,
          euEffect: m.eu, homeBonus: w.homeBonus, incumbencyBonus: m.inc, noise: 1,
          finalShare: rawScores[a.id], rawScore: rawScores[a.id],
          votes: Math.round(rawScores[a.id] * w.ballotsPerDistrict),
          partyBreakdown: m.breakdown,
        };
      }
      total += shares[a.id].finalShare;
    }
    // Normalize
    for (const a of running) shares[a.id].finalShare = shares[a.id].finalShare / (total || 1);

    // Generate ballots (weighted schedule via sampling; representative schedule)
    const ballots = generateBallots(running, shares, w, dRng, byId);
    // Each alliance fields a slate of candidate clones (up to d.corSeats) so a
    // district can elect more councilors than there are alliances. Elected
    // clones are mapped back to their alliance afterwards.
    const cloneOf: Record<string, string> = {};
    const candidates: string[] = [];
    for (const a of running) {
      for (let k = 1; k <= d.corSeats; k++) {
        const cid = `${a.id}#${k}`;
        cloneOf[cid] = a.id;
        candidates.push(cid);
      }
    }
    const expandedBallots = ballots.map((b) => ({
      weight: b.weight,
      ranking: b.ranking.flatMap((aid) =>
        Array.from({ length: d.corSeats }, (_, k) => `${aid}#${k + 1}`)),
    }));
    const stv = meekStv(expandedBallots, candidates, d.corSeats, () => dRng.next());
    const electedAlliances = stv.elected.map((cid) => cloneOf[cid]);
    for (const c of electedAlliances) councilorTotals[c] = (councilorTotals[c] ?? 0) + 1;

    let governor: GovernorResult | undefined;
    if (d.electsGovernor) {
      governor = runGovernor(running, shares, w, dRng, byId, ballots);
      if (governor?.winner) {
        governors[d.name] = governor.winner;
        jointSessionWeights[governor.winner] = (jointSessionWeights[governor.winner] ?? 0) + 2;
      }
    }
    districtResults[d.name] = {
      district: d.name,
      turnoutBallots: w.ballotsPerDistrict,
      quota: droopQuota(w.ballotsPerDistrict, d.corSeats),
      shares,
      ballots,
      rounds: stv.rounds,
      elected: electedAlliances.map((id, i) => ({ allianceId: id, order: i + 1 })),
      eliminatedOrder: stv.eliminatedOrder.map((cid) => cloneOf[cid]),
      governor,
      overridden: !!ovr && Object.keys(ovr.shares).length > 0,
    };
  }
  return {
    seed, weights: { ...w }, districtResults,
    councilorTotals, governors, jointSessionWeights, timestamp: Date.now(),
  };
}

function generateBallots(
  running: AllianceComputed[], shares: Record<string, ModifierLog>,
  w: Weights, rng: Rng,
  byId: Map<string, AllianceComputed>,
): WeightedBallot[] {
  // Representative ballot types: for each first-choice alliance, we build a few
  // preference orderings (bloc-first vs similarity-first) and split the vote count
  // between them — equivalent to sampling 100k ballots but deterministic & compact.
  const totalVotes = w.ballotsPerDistrict;
  const ballots: WeightedBallot[] = [];
  const ids = running.map((a) => a.id);
  const sim = (a: string, b: string) => {
    const A = byId.get(a)!, B = byId.get(b)!;
    const pa = positionScore(A.positions, A.dominantPosition);
    const pb = positionScore(B.positions, B.dominantPosition);
    const iva = ideologyVector(A.ideology, A.secondaryIdeologies, w);
    const ivb = ideologyVector(B.ideology, B.secondaryIdeologies, w);
    return 0.5 * cosine(iva, ivb) + 0.5 * Math.exp(-Math.abs(pa - pb));
  };
  const SAMPLES = 40;
  for (const first of ids) {
    const firstShare = shares[first]?.finalShare ?? 0;
    if (firstShare <= 0) continue;
    const others = ids.filter((x) => x !== first);
    const blocOfFirst = byId.get(first)!.regionalAllianceId;
    const blocMates = others.filter((x) => byId.get(x)!.regionalAllianceId && byId.get(x)!.regionalAllianceId === blocOfFirst);
    const nonBloc = others.filter((x) => !blocMates.includes(x));
    for (let s = 0; s < SAMPLES; s++) {
      const useBloc = rng.next() < w.crossEndorsementProb && blocMates.length > 0;
      let rest: string[];
      if (useBloc) {
        const shuffledBloc = [...blocMates].sort(() => rng.next() - 0.5);
        const sortedNonBloc = [...nonBloc].sort((a, b) => sim(first, b) - sim(first, a));
        rest = [...shuffledBloc, ...sortedNonBloc];
      } else {
        const sortedNonBloc = [...others].sort((a, b) => sim(first, b) - sim(first, a));
        rest = sortedNonBloc;
      }
      ballots.push({ ranking: [first, ...rest], weight: (firstShare * totalVotes) / SAMPLES });
    }
  }
  return ballots;
}

function runGovernor(
  running: AllianceComputed[], shares: Record<string, ModifierLog>,
  w: Weights, rng: Rng,
  byId: Map<string, AllianceComputed>,
  ballots: WeightedBallot[],
): GovernorResult {
  // One candidate per bloc (strongest alliance in district) + one per bloc-less alliance.
  const inDistrict = [...running].sort((a, b) => (shares[b.id]?.finalShare ?? 0) - (shares[a.id]?.finalShare ?? 0));
  const seenBloc = new Set<string>();
  const candidates: GovernorResult['candidates'] = [];
  const candAllianceOf: Record<string, string> = {}; // candidate key -> alliance id
  for (const a of inDistrict) {
    if (a.regionalAllianceId && !seenBloc.has(a.regionalAllianceId)) {
      seenBloc.add(a.regionalAllianceId);
      const blocMates = running.filter((x) => x.regionalAllianceId === a.regionalAllianceId).map((x) => x.id);
      candidates.push({ allianceId: a.id, label: a.name, stage1Share: 0, blocAllianceIds: blocMates });
      candAllianceOf[a.id] = a.id;
    } else if (!a.regionalAllianceId) {
      candidates.push({ allianceId: a.id, label: a.name, stage1Share: 0, blocAllianceIds: [a.id] });
      candAllianceOf[a.id] = a.id;
    }
  }
  // Stage 1: a bloc fields ONE candidate (its locally strongest alliance). Most
  // of a bloc's voters back that candidate, but a share defects to ideologically
  // closer non-bloc candidates (bloc fidelity is high but not absolute) —
  // this prevents the bloc's national leader from sweeping every district.
  const BLOC_FIDELITY = 0.75;
  const stage1: Record<string, number> = {};
  for (const c of candidates) stage1[c.allianceId] = 0;
  const candPos = (id: string) => positionScore(byId.get(id)!.positions, byId.get(id)!.dominantPosition);
  for (const c of candidates) {
    const candPosOwn = candPos(c.allianceId);
    for (const aid of c.blocAllianceIds) {
      const aidShare = (shares[aid]?.finalShare ?? 0) * w.ballotsPerDistrict;
      const isCandidateItself = aid === c.allianceId;
      if (isCandidateItself || c.blocAllianceIds.length === 1) {
        stage1[c.allianceId] += aidShare;
        continue;
      }
      // bloc partner vote: fidelity share stays, remainder splits to closer
      // non-bloc candidates by ideological distance (or abstains)
      stage1[c.allianceId] += aidShare * BLOC_FIDELITY;
      const defectors = aidShare * (1 - BLOC_FIDELITY);
      const others = candidates.filter((o) => o.allianceId !== c.allianceId);
      if (others.length > 0) {
        const dists = others.map((o) => Math.exp(-Math.abs(candPos(aid) - candPosOwn - (candPos(aid) - candPos(o.allianceId)))));
        void dists;
        // split defectors across non-bloc candidates by closeness of voter to candidate
        const wts = others.map((o) => Math.exp(-Math.abs(candPos(aid) - candPos(o.allianceId))));
        const wsum = wts.reduce((sm, x) => sm + x, 0) || 1;
        others.forEach((o, i) => { stage1[o.allianceId] += defectors * (wts[i] / wsum); });
      }
    }
  }
  const valid = Object.values(stage1).reduce((s, x) => s + x, 0);
  const stage1Shares: Record<string, number> = {};
  for (const [k, v] of Object.entries(stage1)) stage1Shares[k] = valid > 0 ? v / valid : 0;
  for (const c of candidates) c.stage1Share = stage1Shares[c.allianceId] ?? 0;

  const winner = (id: string | null): GovernorResult => ({
    candidates, stage1Shares, winner: id, wonInStage1: !!id, totalValid: valid,
  });
  if (candidates.length === 0) return winner(null);
  if (candidates.length === 1) return winner(candidates[0].allianceId);

  const sorted = [...candidates].sort((a, b) => (stage1Shares[b.allianceId] ?? 0) - (stage1Shares[a.allianceId] ?? 0));
  if (sorted[0].stage1Share > 0.5) return winner(sorted[0].allianceId);

  // Runoff between top two.
  const A = sorted[0].allianceId, B = sorted[1].allianceId;
  const runoffShares: Record<string, number> = { [A]: 0, [B]: 0 };
  const transfers: Record<string, string> = {};
  const runoffAbstain = 0.35; // share of non-bloc transfers that abstain
  for (const c of sorted.slice(2)) {
    // Votes of an eliminated candidate transfer: (a) to a runoff candidate from
    // the same bloc if one is present (full transfer); otherwise (b) split by
    // ideological closeness, with a share of voters abstaining instead.
    const blocId = byId.get(c.allianceId)!.regionalAllianceId;
    const blocCand = [A, B].find((x) => byId.get(x)!.regionalAllianceId && byId.get(x)!.regionalAllianceId === blocId);
    const cShare = stage1Shares[c.allianceId] ?? 0;
    if (blocCand) {
      transfers[c.allianceId] = blocCand;
      runoffShares[blocCand] += cShare;
    } else {
      // Non-bloc transfer: voters follow their list's local alignment. The
      // ballot schedule already encodes whose voters rank whom next (district
      // affinity), so use the district's ballot preference order: measure how
      // often c's voters rank A vs B higher (weighted schedule), fall back to
      // position distance.
      const countAbove = (target: string): number => {
        let total = 0;
        for (const b of ballots) {
          const idxC = b.ranking.indexOf(c.allianceId);
          const idxT = b.ranking.indexOf(target);
          if (idxC >= 0 && idxT >= 0 && idxT > idxC) total += b.weight * (1 / (1 + idxT - idxC));
        }
        return total;
      };
      const wA = countAbove(A), wB = countAbove(B);
      const posA = positionScore(byId.get(A)!.positions, byId.get(A)!.dominantPosition);
      const posB = positionScore(byId.get(B)!.positions, byId.get(B)!.dominantPosition);
      const posC = positionScore(byId.get(c.allianceId)!.positions, byId.get(c.allianceId)!.dominantPosition);
      const ideow = Math.exp(-Math.abs(posC - posA)), ideowB = Math.exp(-Math.abs(posC - posB));
      const numA = wA + ideow, numB = wB + ideowB;
      const transferable = cShare * (1 - runoffAbstain);
      const fA = numA / (numA + numB || 1);
      runoffShares[A] += transferable * fA;
      runoffShares[B] += transferable * (1 - fA);
      transfers[c.allianceId] = `split ${(100 * transferable * fA).toFixed(0)}%→${byId.get(A)?.name}`;
    }
  }
  runoffShares[A] += stage1Shares[A] ?? 0;
  runoffShares[B] += stage1Shares[B] ?? 0;
  // seeded noise
  runoffShares[A] *= rng.logNormal(w.govRunoffNoise);
  runoffShares[B] *= rng.logNormal(w.govRunoffNoise);
  const runoffWinner = runoffShares[A] >= runoffShares[B] ? A : B;
  return {
    candidates, stage1Shares, winner: runoffWinner, wonInStage1: false,
    runoff: { a: A, b: B, shares: runoffShares, transfers }, totalValid: valid,
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------- Validation ----------
export interface ValidationIssue { level: 'error' | 'warn'; message: string; }

export function validateScenario(scenario: Scenario, districts: District[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenParties = new Set<string>();
  for (const a of scenario.alliances) {
    for (const pid of a.memberPartyIds) {
      if (seenParties.has(pid)) {
        const p = scenario.parties.find((x) => x.id === pid);
        issues.push({ level: 'error', message: `Party "${p?.name ?? pid}" belongs to multiple alliances.` });
      }
      seenParties.add(pid);
    }
  }
  for (const p of scenario.parties) {
    if (!p.allianceId || !scenario.alliances.some((a) => a.id === p.allianceId)) {
      issues.push({ level: 'error', message: `Party "${p.name}" has no valid parent alliance.` });
    }
    if (!p.color) issues.push({ level: 'warn', message: `Party "${p.name}" has no color recorded.` });
  }
  const seenAlliances = new Set<string>();
  for (const b of scenario.regionalAlliances) {
    for (const aid of b.memberAllianceIds) {
      if (seenAlliances.has(aid)) {
        issues.push({ level: 'error', message: `Alliance is a member of multiple regional alliances.` });
      }
      seenAlliances.add(aid);
    }
  }
  for (const a of scenario.alliances) {
    if (!a.color) issues.push({ level: 'error', message: `Alliance "${a.name}" is missing a color.` });
    if (a.memberPartyIds.length === 0) issues.push({ level: 'warn', message: `Alliance "${a.name}" has no member parties.` });
  }
  for (const d of districts) {
    const anyRunning = scenario.alliances.some((a) => a.runningDistricts.includes(d.name));
    if (!anyRunning) issues.push({ level: 'warn', message: `No alliance runs in "${d.name}".` });
  }
  // Party running where alliance doesn't run is structurally prevented; check member home districts
  for (const p of scenario.parties) {
    const a = scenario.alliances.find((x) => x.id === p.allianceId);
    if (a) for (const hd of p.homeDistricts) {
      if (!a.runningDistricts.includes(hd)) {
        issues.push({ level: 'warn', message: `${p.name} is based in ${hd} but its alliance doesn't run there.` });
      }
    }
  }
  return issues;
}
