# Latvia PolSim — CoR & CoG Election Simulator

A single-page React + TypeScript (Vite) application that simulates Council of Regions (CoR) and
Council of Governors (CoG) elections for a fictional Republic of Latvia (~40M people).
No backend; everything runs client-side with localStorage persistence and JSON import/export.

## Run

```bash
npm install
npm run dev      # dev server
npm run build    # production build in dist/
npx vitest run   # engine sanity tests
```

## Structure

- `src/types.ts` — data model (Party, Alliance, RegionalAlliance, Scenario, results)
- `src/data/presets.ts` — 19 districts + trait profiles, 61 ideologies + affinity vectors,
  positions, EU positions, euro groups, default weights
- `src/engine/meek.ts` — pure, unit-tested Meek STV counter
- `src/engine/simulate.ts` — vote generation model, governor two-stage elections, validation
- `src/engine/rng.ts` — seeded RNG (mulberry32 + Box–Muller log-normal noise)
- `src/components/Diagrams.tsx` — Saeima arc + Westminster hemicycle SVGs
- `src/store.ts` — Zustand store with localStorage persistence

## Totals (hard-enforced)

- 19 districts, 150 CoR councilors total, 18 governors (diaspora elects 7 councilors, no governor).

## Seats → implied national vote share (documented)

```
s = saeimaSeats / 301                       (seat share)
v = s × (0.85 + 0.30·e^(−3s) + 0.5·α·(1−s))  (implied vote share)
```

Small parties get a conversion factor above 1 (vote share slightly **above** their seat share);
large parties below 1 (vote share slightly **below** seat share) — a gentle diminishing curve.
`α` (`seatCurveAlpha`, default 0.06) adds a user-tunable linear tilt in the Weights panel.

## Vote generation model

Per alliance-district score:

```
score = Σ party base × ideologyFit × positionFit × euEffect × incumbency × noise
```

1. **Base (party-level concentration model)**: each member party's implied national
   vote is distributed across the districts it runs in, proportional to
   `population × (home ? homeBonus × homeConcentration : 1)`, normalized so its national
   total is preserved. Regionalist lists (high `homeConcentration`) dominate their home
   turf; broad national parties stay even. A party with no home districts runs evenly
   everywhere. Parties can be restricted to specific running districts (they contribute
   0 outside them; an alliance runs wherever it or any member party runs).

The model is calibrated against three reference elections (20th right-win, 24th center-win,
25th left-win Saeima) encoded in `src/engine/__tests__/reference.test.ts`: governor winners
match the reference in ~85% of districts (46/54) across all three, with exact 150/18 totals,
no alliance sweeps, and regionalists winning their homelands.
2. **Ideology fit** (×0.5–×1.7): direct affinity score — each trait the ideology cares
   about is multiplied by the district's normalized trait value, weighted (dominant ×2.0,
   secondaries ×0.5), then mapped around 1.0.
3. **Position fit** (×0.55–×1.3): symmetric Gaussian of the distance between the alliance's
   weighted position and the district's dynamic lean.
4. **EU effect** (×0.85–×1.15): asymmetric — Pro-EU overperforms in high-enthusiasm districts;
   hard anti-EU is the mirror image; soft anti-EU is a weakened version (`euSoftFactor`).
5. **Incumbency** ×1.05 for the sitting governor's alliance.
6. **Noise**: log-normal, σ = 0.03, from a seeded RNG (seed shown & editable; results record it).

**Dynamic regional lean**: before each run, the national implied lean is computed from the
parties' Saeima seat shares (seat-weighted mean position). The lean used in position fit is
`lean = preset × (1 − pull) + national × pull`, with `leanNationalPull` (default 0.35)
tunable in the Weights panel — 0 = fully static preset leans, 1 = fully national.

Scores normalize within the district. Alliances not running in a district receive zero votes.
Manual overrides lock chosen shares; the remainder is redistributed among unlocked alliances;
overridden districts are highlighted and exported.

## Meek STV

- Droop quota: `floor(valid/(seats+1))+1`.
- Counted on an aggregated **weighted ballot schedule** (equivalent to 100k ballots, deterministic
  and compact). Each alliance fields a slate of candidate "clones" (up to the district's seat
  count) — clones map back to their alliance — so a district can elect more councilors than
  there are alliances.
- Progressive reweighting: keep factor `k = quota/tally` per elected candidate; one election per
  round so surplus reweighting applies before the next election.
- Elimination ties: previous-round totals, then seeded RNG.
- Ballot preferences: bloc cross-endorsement first (default 70% probability), then
  ideological/position similarity.
- Governor stage 1: blocs field one candidate (locally strongest member); bloc partner
  voters back it at 75% fidelity, the rest defect to ideologically closer candidates.
  Runoff transfers: same-bloc full transfer; otherwise a closeness split with 35%
  abstention, weighted by the district's ballot-preference schedule.

## Governor elections (two-stage, per district except diaspora)

1. One candidate per bloc (its strongest district alliance) + one per bloc-less alliance.
2. Absolute majority in stage 1 wins; otherwise a runoff of the top two with bloc transfer,
   then ideological closeness, plus seeded noise.
3. Incumbency bonus applies in both stages. Each governor carries **2 votes** in the joint
   session (shown as "2×" badges and total weight in the CoG diagram).

## Outputs

- Saeima horseshoe arc (301): left→right ordering, Big Tent centered, Syncretic adjacent to
  center, anti-EU outward on ties.
- Westminster hemicycles: government/opposite sides, cross-bench top arc, supply-and-confidence
  adjacent to government; seat fill = alliance color, outline = bloc color (gray if none).
  Sections render as compact, tightly-packed wedges (angular width sized to the seats each
  cluster actually needs) so alliances stay visually clustered rather than fanning out.
- District results table with governor stages and councilor seat counts.
- Behind-the-scenes toggle: quota, per-round Meek tallies with keep factors, elimination order,
  every modifier, seed, and full weight settings.
- CSV export (district × alliance, governors, summaries) and full-scenario JSON export/import.

## Acceptance checks

Covered by `src/engine/__tests__/engine.test.ts`: totals always 150/18, diaspora has no
governor, fixed seed reproducibility, duplicate-membership rejection, Meek proportionality
and transfer behavior.
