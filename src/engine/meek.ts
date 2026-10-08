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

  const active = new Set(candidates);        // hopeful or elected
  const hopeful = new Set(candidates);       // not yet elected/eliminated
  const elected: string[] = [];
  const eliminatedOrder: string[] = [];
  const keep: Record<string, number> = {};
  for (const c of candidates) keep[c] = 1;

  const rounds: MeekRound[] = [];
  let round = 0;
  let finalQuota = 0;
  const prevTotals: Record<string, number> = {};

  // Meek tally: a ballot's value flows down its ranking; an elected candidate
  // consumes only keep[c] of the remaining value, and the REST continues to
  // later preferences. Eliminated candidates (keep=0) consume nothing.
  const tally = (): Record<string, number> => {
    const t: Record<string, number> = {};
    for (const c of active) t[c] = 0;
    for (const b of sched) {
      let v = b.weight;
      for (const c of b.ranking) {
        if (v <= 1e-9) break;
        if (!active.has(c)) continue;
        const take = Math.min(v, v * keep[c]);
        t[c] += take;
        v -= take;
        if (hopeful.has(c)) break; // hopeful takes ALL remaining value
      }
      // any leftover v is non-transferable (exhausted ballot)
    }
    return t;
  };

  while (elected.length < seats && hopeful.size > 0) {
    round++;
    const t = tally();
    const totalVote = Object.values(t).reduce((s, x) => s + x, 0);
    const seatsLeft = seats - elected.length;
    const quota = seatsLeft > 0 ? totalVote / (seatsLeft + 1) : totalVote;
    finalQuota = quota;

    // Elect exactly ONE candidate per round (highest hopeful at/above quota)
    // so surplus reweighting applies before the next election — proper Meek order.
    const overQuota = [...hopeful].filter((c) => t[c] >= quota)
      .sort((a, b) => t[b] - t[a]);
    if (overQuota.length > 0) {
      const c = overQuota[0];
      elected.push(c);
      hopeful.delete(c);
      keep[c] = quota / t[c]; // progressive reweighting (surplus factor)
      rounds.push({
        round, quota,
        tallies: { ...t }, keepFactors: { ...keep },
        elected: [c], eliminated: null,
        note: `${c} elected (quota ${quota.toFixed(1)}, tally ${t[c].toFixed(1)}); keep factor set to ${keep[c].toFixed(4)}.`,
      });
      for (const x of candidates) if (t[x] !== undefined) prevTotals[x] = t[x];
      continue;
    }
    if (hopeful.size <= seatsLeft) {
      // everyone remaining can be seated
      const remaining = [...hopeful].sort((a, b) => (t[b] ?? 0) - (t[a] ?? 0));
      for (const c of remaining) { elected.push(c); hopeful.delete(c); }
      rounds.push({ round, quota, tallies: { ...t }, keepFactors: { ...keep }, elected: remaining, eliminated: null, note: 'Remaining candidates seated to fill vacancies.' });
      break;
    }
    // Eliminate lowest; ties: previous-round totals, then RNG.
    let lowest: string | null = null;
    let lowestVal = Infinity;
    for (const c of hopeful) {
      if (t[c] < lowestVal) { lowestVal = t[c]; lowest = c; }
    }
    const tied = [...hopeful].filter((c) => Math.abs(t[c] - lowestVal) < 1e-9);
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
    hopeful.delete(lowest!);
    eliminatedOrder.push(lowest!);
    keep[lowest!] = 0;
    for (const x of candidates) if (t[x] !== undefined) prevTotals[x] = t[x];
  }

  // Degenerate case: fewer candidates than seats. Remaining seats are filled
  // in reverse elimination order so every seat is always filled.
  if (elected.length < seats) {
    for (const c of [...eliminatedOrder].reverse()) {
      if (elected.length >= seats) break;
      if (!elected.includes(c)) elected.push(c);
    }
  }

  return { elected, rounds, quota: finalQuota, eliminatedOrder };
}
