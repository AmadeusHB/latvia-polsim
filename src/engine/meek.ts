import type { MeekRound } from '../types';

// Pure Meek STV counter on a weighted ballot schedule (rankings of alliance ids).
// Documented approach: ballots are aggregated into a weighted schedule (ranking -> count),
// which is mathematically equivalent to per-ballot counting.
export interface WeightedBallot {
  ranking: string[];
  weight: number; // count of identical ballots
}

export interface MeekResult {
  elected: string[];
  rounds: MeekRound[];
  quota: number;
  eliminatedOrder: string[];
}

export function droopQuota(valid: number, seats: number): number {
  return Math.floor(valid / (seats + 1)) + 1;
}

export function meekStv(
  ballots: WeightedBallot[],
  candidates: string[],
  seats: number,
  rngNext: () => number,
): MeekResult {
  // Aggregate identical rankings.
  const schedule = new Map<string, { ranking: string[]; weight: number }>();
  for (const b of ballots) {
    const key = b.ranking.join('|');
    const e = schedule.get(key);
    if (e) e.weight += b.weight;
    else schedule.set(key, { ranking: [...b.ranking], weight: b.weight });
  }
  const sched = [...schedule.values()];
  const totalWeight = sched.reduce((s, b) => s + b.weight, 0);
  const quota = droopQuota(totalWeight, seats);

  const active = new Set(candidates);
  const elected: string[] = [];
  const eliminatedOrder: string[] = [];
  const keep: Record<string, number> = {};
  for (const c of candidates) keep[c] = 1;

  const rounds: MeekRound[] = [];
  let round = 0;
  const prevTotals: Record<string, number> = {};

  const tally = (): Record<string, number> => {
    const t: Record<string, number> = {};
    for (const c of active) t[c] = 0;
    for (const b of sched) {
      for (const c of b.ranking) {
        if (active.has(c)) {
          t[c] += b.weight * keep[c];
          break;
        }
      }
    }
    return t;
  };

  while (elected.length < seats && active.size > 0) {
    round++;
    const t = tally();
    // Elect exactly ONE candidate per round (highest at/above quota) so surplus
    // reweighting applies before the next election — proper Meek ordering.
    const overQuota = [...active].filter((c) => t[c] >= quota)
      .sort((a, b) => t[b] - t[a]);
    const newlyElected: string[] = overQuota.length > 0 ? [overQuota[0]] : [];
    if (newlyElected.length > 0) {
      for (const c of newlyElected) {
        elected.push(c);
        active.delete(c);
        keep[c] = quota / t[c]; // progressive reweighting (surplus factor)
      }
      rounds.push({
        round,
        quota,
        tallies: { ...t },
        keepFactors: { ...keep },
        elected: newlyElected,
        eliminated: null,
        note: `${newlyElected.join(', ')} elected (quota ${quota.toFixed(1)}); keep factors updated.`,
      });
      for (const c of Object.keys(prevTotals)) prevTotals[c] = t[c] ?? prevTotals[c];
      for (const c of candidates) if (t[c] !== undefined) prevTotals[c] = t[c];
      continue;
    }
    if (active.size <= seats - elected.length) {
      const remaining = [...active].sort((a, b) => t[b] - t[a]);
      for (const c of remaining) {
        elected.push(c);
        active.delete(c);
      }
      rounds.push({ round, quota, tallies: { ...t }, keepFactors: { ...keep }, elected: remaining, eliminated: null, note: 'Remaining candidates seated to fill vacancies.' });
      break;
    }
    // Eliminate lowest; ties: previous-round totals, then RNG.
    let lowest: string | null = null;
    let lowestVal = Infinity;
    for (const c of active) {
      if (t[c] < lowestVal) { lowestVal = t[c]; lowest = c; }
    }
    const tied = [...active].filter((c) => Math.abs(t[c] - lowestVal) < 1e-9);
    if (tied.length > 1) {
      tied.sort((a, b) => (prevTotals[a] ?? 0) - (prevTotals[b] ?? 0));
      const minPrev = prevTotals[tied[0]] ?? 0;
      const prevTied = tied.filter((c) => (prevTotals[c] ?? 0) === minPrev);
      lowest = prevTied.length > 1 ? prevTied[Math.floor(rngNext() * prevTied.length)] : tied[0];
      rounds.push({
        round, quota, tallies: { ...t }, keepFactors: { ...keep },
        elected: [], eliminated: lowest,
        note: `Tie at ${lowestVal.toFixed(1)}: broken by ${prevTied.length > 1 ? 'seeded RNG' : 'previous-round totals'}.`,
      });
    } else {
      rounds.push({ round, quota, tallies: { ...t }, keepFactors: { ...keep }, elected: [], eliminated: lowest, note: `${lowest} eliminated.` });
    }
    active.delete(lowest!);
    eliminatedOrder.push(lowest!);
    keep[lowest!] = 0;
    for (const c of candidates) if (t[c] !== undefined) prevTotals[c] = t[c];
  }

  // Degenerate case: fewer candidates than seats. Remaining seats are filled
  // in reverse elimination order (standard "continue eliminating" practice) so
  // every seat is always filled.
  if (elected.length < seats) {
    for (const c of [...eliminatedOrder].reverse()) {
      if (elected.length >= seats) break;
      if (!elected.includes(c)) elected.push(c);
    }
  }

  return { elected, rounds, quota, eliminatedOrder };
}
