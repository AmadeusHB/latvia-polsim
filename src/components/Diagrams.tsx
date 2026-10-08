import type { RegionalAlliance, Scenario, SimulationResult } from '../types';
import { positionScore, computeAlliances } from '../engine/simulate';

// ============================================================
// Ordering helpers
// ============================================================

export function arcOrder(computed: ReturnType<typeof computeAlliances>): string[] {
  const score = (a: typeof computed[number]) => {
    const isBigTent = a.positions.includes('Big Tent');
    const isSyn = a.positions.includes('Syncretic');
    const pos = positionScore(a.positions, a.dominantPosition);
    const eu = a.euPosition === 'Hard Anti-EU' ? -1 : a.euPosition === 'Pro-EU' ? 1 : 0;
    if (isBigTent) return { center: 2, side: 0, eu, seats: a.saeimaSeats };
    if (isSyn) return { center: 1, side: pos >= 0 ? 1 : -1, eu, seats: a.saeimaSeats };
    return { center: 0, side: pos, eu, seats: a.saeimaSeats };
  };
  const withScore = computed.map((a) => ({ a, s: score(a) }));
  const left = withScore.filter((x) => x.s.center === 0 && x.s.side < 0)
    .sort((p, q) => p.s.side - q.s.side || p.s.eu - q.s.eu || q.s.seats - p.s.seats);
  const synL = withScore.filter((x) => x.s.center === 1 && x.s.side <= 0)
    .sort((p, q) => q.s.seats - p.s.seats);
  const exactCenter = withScore.filter((x) => x.s.center === 0 && x.s.side === 0)
    .sort((p, q) => q.s.seats - p.s.seats);
  const bigTent = withScore.filter((x) => x.s.center === 2)
    .sort((p, q) => q.s.seats - p.s.seats);
  const synR = withScore.filter((x) => x.s.center === 1 && x.s.side > 0)
    .sort((p, q) => q.s.seats - p.s.seats);
  const right = withScore.filter((x) => x.s.center === 0 && x.s.side > 0)
    .sort((p, q) => p.s.side - q.s.side || q.s.eu - p.s.eu || q.s.seats - p.s.seats);
  return [...left, ...synL, ...exactCenter, ...bigTent, ...synR, ...right].map((x) => x.a.id);
}

// ============================================================
// Horseshoe geometry (parliament-chart layout)
//
// A wide, shallow U-shaped band opening upward, centered on a circle whose
// center sits ABOVE the band. Rows are concentric arcs of one common center;
// row capacities are proportional to row radius, scaled to the exact seat
// total via largest remainder. Seats are then ordered strictly by angular
// position (left to right; inner row first at equal angle), so assigning an
// ordered seat list keeps every party/section as ONE contiguous wedge.
// ============================================================

export interface HsPos { x: number; y: number; t: number; r: number }

export function horseshoe(N: number, seatR: number, rowsWanted: number, sweep = Math.PI) {
  const pitch = 2 * seatR + 2.2;   // angular seat spacing
  const gap = 2 * seatR + 2.4;     // radial row spacing (dense band)
  const minInner = 7 * seatR;
  let R = Math.max(2, rowsWanted);
  let r_o = 0, r_i = 0;
  for (;;) {
    const sumR = (N * pitch) / sweep;
    r_o = sumR / R + (gap * (R - 1)) / 2;
    r_i = r_o - (R - 1) * gap;
    if (r_i >= minInner || R <= 2) break;
    R--;
  }
  const radii: number[] = [];
  for (let i = 0; i < R; i++) radii.push(r_i + i * gap); // inner -> outer
  // Raw capacities ∝ radius; scale to exactly N with largest remainder.
  const raw = radii.map((r) => (r * sweep) / pitch);
  const caps = raw.map((v) => Math.floor(v));
  let rem = N - caps.reduce((s, x) => s + x, 0);
  const byFrac = raw.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f);
  for (let k = 0; rem > 0 && k < byFrac.length; k++, rem--) caps[byFrac[k].i]++;
  const rows = radii.map((r, i) => ({ r, c: caps[i] })).filter((x) => x.c > 0);
  // Positions relative to the circle center. t walks the arc left→right;
  // a = sweep·(1−t) maps t=0 to the left arm end and t=1 to the right arm end,
  // with the bottom of the U at t=0.5 (SVG y grows downward).
  const positions: HsPos[] = [];
  for (const { r, c } of rows) {
    for (let k = 0; k < c; k++) {
      const t = (k + 0.5) / c;
      const a = sweep * (1 - t);
      positions.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, t, r });
    }
  }
  // Walk order: angular left→right; at equal angle, inner row first.
  positions.sort((A, B) => A.t - B.t || A.r - B.r);
  return { positions, r_i: rows[0]?.r ?? 0, r_o: rows[rows.length - 1]?.r ?? 0, rows: rows.length };
}

// ============================================================
// Shared UI
// ============================================================

function Legend({ scenario, entries, total }: { scenario: Scenario; entries: { id: string; seats: number }[]; total?: number }) {
  const byId = new Map(scenario.alliances.map((a) => [a.id, a]));
  const t = total ?? entries.reduce((s, e) => s + e.seats, 0);
  return (
    <div className="parliament-legend">
      {entries.map(({ id, seats }) => {
        const a = byId.get(id);
        if (!a || seats <= 0) return null;
        return (
          <span key={id} className="legend-item">
            <span className="legend-dot" style={{ background: a.color }} />
            {a.name} <strong>{seats}</strong>
            <span className="subtle" style={{ margin: 0 }}>({(100 * seats / (t || 1)).toFixed(1)}%)</span>
          </span>
        );
      })}
    </div>
  );
}

function ChamberCard({
  title, subtitle, swatch, children,
}: { title: string; subtitle: string; swatch: string; children: React.ReactNode }) {
  return (
    <div className="diagram-card">
      <div className="diagram-head">
        <div className="diagram-title">
          <span className="chamber-swatch" style={{ background: swatch }} />
          {title}
        </div>
        <div className="diagram-sub">{subtitle}</div>
      </div>
      <div className="diagram-body">{children}</div>
    </div>
  );
}

// ============================================================
// Saeima horseshoe (301 seats)
// ============================================================

export function SaeimaArc({ scenario }: { scenario: Scenario }) {
  const computed = computeAlliances(scenario);
  const order = arcOrder(computed);
  const seatsOf = (aid: string) => scenario.parties.filter((p) => p.allianceId === aid).reduce((sum, p) => sum + p.saeimaSeats, 0);
  const seatAssign: { allianceId: string }[] = [];
  for (const aid of order) {
    for (let k = 0; k < seatsOf(aid); k++) seatAssign.push({ allianceId: aid });
  }
  const total = seatAssign.length;
  const entries = order.map((aid) => ({ id: aid, seats: seatsOf(aid) })).filter((e) => e.seats > 0);
  if (total === 0) return (
    <ChamberCard title="Saeima" subtitle="no seats entered" swatch="linear-gradient(180deg,#3457d5,#7b96ec)">
      <div className="empty-note">No Saeima seats entered yet.</div>
    </ChamberCard>
  );

  const seatR = 7.5;
  const { positions, r_o } = horseshoe(total, seatR, 9);
  const padX = 96;
  const W = Math.round(2 * r_o + 2 * padX);
  const cx = W / 2;
  const cy0 = 116;                    // circle center: top of the valley
  const H = Math.round(cy0 + r_o + 52);
  const byId = new Map(scenario.alliances.map((a) => [a.id, a]));
  const majority = Math.floor(301 / 2) + 1;

  return (
    <ChamberCard
      title="Saeima"
      subtitle={`${total} of 301 seats · ${entries.length} alliances · majority at ${majority}`}
      swatch="linear-gradient(180deg,#3457d5,#7b96ec)"
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="diagram" role="img" aria-label="Saeima seat diagram">
        <defs>
          <radialGradient id="saeimaEmblem" cx="50%" cy="40%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#eef1f7" />
          </radialGradient>
        </defs>
        {positions.map((p, i) => {
          const a = byId.get(seatAssign[i].allianceId);
          return (
            <circle key={i} cx={cx + p.x} cy={cy0 + p.y} r={seatR}
              fill={a?.color ?? '#999'} stroke="#ffffff" strokeWidth={0.8}>
              <title>{`${a?.name ?? ''} — ${seatsOf(seatAssign[i].allianceId)} seats`}</title>
            </circle>
          );
        })}
        {/* majority tick at the bottom of the U */}
        <line x1={cx - 7} y1={cy0 + r_o + 7} x2={cx + 7} y2={cy0 + r_o + 7} stroke="#c3c9d8" strokeWidth={2} />
        <text x={cx} y={cy0 + r_o + 22} textAnchor="middle" className="svg-sub">majority {majority}</text>
        {/* center emblem in the mouth of the horseshoe */}
        <circle cx={cx} cy={cy0 - 62} r={52} fill="url(#saeimaEmblem)" stroke="#e4e8f0" />
        <text x={cx} y={cy0 - 74} textAnchor="middle" className="svg-title" fontSize={15}>Saeima</text>
        <text x={cx} y={cy0 - 60} textAnchor="middle" className="svg-sub">Republic of Latvia</text>
        <text x={cx} y={cy0 - 40} textAnchor="middle" fontSize={16} fontWeight={800} fill="#16192b">
          {total}<tspan fontSize={11} fill="#8b93a7"> / 301</tspan>
        </text>
        {/* axis labels at the arm ends */}
        <text x={cx - r_o - 44} y={cy0 - 10} textAnchor="middle" className="axis-label">← Left</text>
        <text x={cx + r_o + 44} y={cy0 - 10} textAnchor="middle" className="axis-label">Right →</text>
      </svg>
      <Legend scenario={scenario} entries={entries} />
    </ChamberCard>
  );
}

// ============================================================
// Westminster horseshoe (CoR 150 / CoG 18)
// ============================================================

type Sec = 'gov' | 'supply' | 'cross' | 'opp';

const SEC_STYLE: Record<Sec, { label: string; color: string }> = {
  gov: { label: 'Government', color: '#1d4ed8' },
  supply: { label: 'Supply & Confidence', color: '#0e7490' },
  cross: { label: 'Cross-bench', color: '#64748b' },
  opp: { label: 'Opposition', color: '#b91c1c' },
};

export function WestminsterDiagram({
  scenario, results, mode,
}: {
  scenario: Scenario;
  results: SimulationResult;
  mode: 'cor' | 'cog';
}) {
  const blocOf = new Map<string, RegionalAlliance>();
  for (const b of scenario.regionalAlliances) for (const a of b.memberAllianceIds) blocOf.set(a, b);
  const allianceById = new Map(scenario.alliances.map((a) => [a.id, a]));
  const computed = computeAlliances(scenario);
  const order = arcOrder(computed);

  let seatList: { allianceId: string; weight: number }[] = [];
  if (mode === 'cor') {
    for (const [aid, n] of Object.entries(results.councilorTotals)) {
      for (let i = 0; i < n; i++) seatList.push({ allianceId: aid, weight: 1 });
    }
  } else {
    for (const [, aid] of Object.entries(results.governors)) {
      if (aid) seatList.push({ allianceId: aid, weight: 2 });
    }
  }
  if (seatList.length === 0) return (
    <ChamberCard title={mode === 'cor' ? 'Council of Regions' : 'Council of Governors'}
      subtitle={mode === 'cor' ? '150 seats' : '18 governors · 2 votes each in joint session'}
      swatch={mode === 'cor' ? 'linear-gradient(180deg,#1a7f4e,#57c08a)' : 'linear-gradient(180deg,#9e2b3c,#d4704f)'}>
      <div className="empty-note">Run a simulation first.</div>
    </ChamberCard>
  );

  const secOf = new Map<string, Sec>();
  for (const a of scenario.alliances) {
    const st = a.saeimaStatus;
    secOf.set(a.id, st === 'Government' ? 'gov' : st === 'Supply and Confidence' ? 'supply' : st === 'Cross-bench' ? 'cross' : 'opp');
  }
  const blocOrder = new Map<string, number>();
  order.forEach((aid, i) => blocOrder.set(aid, i));
  const groups: Record<Sec, { allianceId: string; weight: number }[]> = { gov: [], supply: [], cross: [], opp: [] };
  for (const sec of Object.keys(groups) as Sec[]) {
    groups[sec] = seatList.filter((s) => secOf.get(s.allianceId) === sec)
      .sort((a, b) => (blocOrder.get(a.allianceId) ?? 99) - (blocOrder.get(b.allianceId) ?? 99));
  }

  // Sections occupy contiguous arc segments in this order:
  // Government (left arm end) → Supply & Confidence (adjacent) → Cross-bench (bottom) → Opposition (right arm end).
  const sectionSeq: Sec[] = ['gov', 'supply', 'cross', 'opp'];
  const ordered = sectionSeq.flatMap((sec) => groups[sec]);
  const N = ordered.length;

  const seatR = mode === 'cor' ? 9 : 19;
  const rowsWanted = mode === 'cor' ? 6 : 2;
  const { positions, r_i, r_o } = horseshoe(N, seatR, rowsWanted);

  const padX = 120;
  const W = Math.round(2 * r_o + 2 * padX);
  const cx = W / 2;
  const cy0 = mode === 'cor' ? 120 : 128;
  const H = Math.round(cy0 + r_o + 58);

  // Section boundaries (t at cumulative seat counts) for radial dividers.
  const boundaries: number[] = [];
  let acc = 0;
  for (const sec of sectionSeq) {
    if (groups[sec].length > 0) {
      acc += groups[sec].length;
      if (acc < N) boundaries.push(acc / N);
    }
  }
  // Section label positions: angular centers of each occupied segment.
  const sectionSpans: { sec: Sec; t0: number; t1: number }[] = [];
  {
    let prev = 0;
    for (const sec of sectionSeq) {
      const n = groups[sec].length;
      if (n > 0) {
        sectionSpans.push({ sec, t0: prev, t1: prev + n / N });
        prev += n / N;
      }
    }
  }

  const totalWeight = mode === 'cog' ? seatList.reduce((s, x) => s + x.weight, 0) : seatList.length;
  const secEntries = (sec: Sec) => {
    const ids = [...new Set(groups[sec].map((s) => s.allianceId))];
    return ids.map((id) => ({ id, seats: groups[sec].filter((s) => s.allianceId === id).length }));
  };

  const title = mode === 'cor' ? 'Council of Regions' : 'Council of Governors';
  const subtitle = mode === 'cor'
    ? `${N} of 150 seats · ${groups.gov.length} government · ${groups.opp.length} opposition`
    : `${N} governors · ${totalWeight} weighted votes (2× each)`;

  const angOf = (t: number) => Math.PI * (1 - t);

  return (
    <ChamberCard title={title} subtitle={subtitle}
      swatch={mode === 'cor' ? 'linear-gradient(180deg,#1a7f4e,#57c08a)' : 'linear-gradient(180deg,#9e2b3c,#d4704f)'}>
      <svg viewBox={`0 0 ${W} ${H}`} className="diagram" role="img" aria-label={`${title} seat diagram`}>
        <defs>
          <radialGradient id={`wstEmblem-${mode}`} cx="50%" cy="40%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#eef1f7" />
          </radialGradient>
        </defs>
        {/* radial dividers between sections */}
        {boundaries.map((bt, i) => {
          const a = angOf(bt);
          return (
            <line key={i}
              x1={cx + (r_i - 6) * Math.cos(a)} y1={cy0 + (r_i - 6) * Math.sin(a)}
              x2={cx + (r_o + 10) * Math.cos(a)} y2={cy0 + (r_o + 10) * Math.sin(a)}
              stroke="#d4d9e4" strokeWidth={1.5} />
          );
        })}
        {/* seats: ordered list mapped to angular positions → every section and
            alliance inside it is one contiguous wedge */}
        {positions.map((p, i) => {
          const al = allianceById.get(ordered[i].allianceId);
          const bloc = blocOf.get(ordered[i].allianceId);
          const outline = bloc ? bloc.color : '#aab1bf';
          return (
            <circle key={i} cx={cx + p.x} cy={cy0 + p.y} r={seatR}
              fill={al?.color ?? '#bbb'} stroke={outline} strokeWidth={mode === 'cor' ? 2 : 4.5}>
              <title>{`${al?.name ?? ''}${bloc ? ` (${bloc.name})` : ''}${mode === 'cog' ? ' · 2 votes' : ''}`}</title>
            </circle>
          );
        })}
        {mode === 'cog' && positions.map((p, i) => (
          <text key={'t' + i} x={cx + p.x} y={cy0 + p.y + 5} textAnchor="middle" fontSize="12" fill="#fff" fontWeight={800}>2×</text>
        ))}
        {/* center emblem in the mouth of the horseshoe */}
        <circle cx={cx} cy={cy0 - 66} r={mode === 'cor' ? 48 : 56} fill={`url(#wstEmblem-${mode})`} stroke="#e4e8f0" />
        <text x={cx} y={cy0 - 78} textAnchor="middle" className="svg-title" fontSize={mode === 'cor' ? 15 : 17}>
          {mode === 'cor' ? 'CoR' : 'CoG'}
        </text>
        <text x={cx} y={cy0 - 64} textAnchor="middle" className="svg-sub">
          {mode === 'cor' ? 'Council of Regions' : 'Council of Governors'}
        </text>
        <text x={cx} y={cy0 - 44} textAnchor="middle" fontSize={15} fontWeight={800} fill="#16192b">
          {mode === 'cor' ? N : totalWeight}
          <tspan fontSize={11} fill="#8b93a7">{mode === 'cor' ? ' / 150' : ' joint votes'}</tspan>
        </text>
        {/* section labels just outside the band at each segment's angular center */}
        {sectionSpans.map(({ sec, t0, t1 }) => {
          const a = angOf((t0 + t1) / 2);
          const lx = cx + (r_o + 34) * Math.cos(a);
          const ly = cy0 + (r_o + 34) * Math.sin(a) + 4;
          return (
            <text key={sec} x={lx} y={ly} textAnchor="middle" className="divider-label" fill={SEC_STYLE[sec].color}>
              {`${SEC_STYLE[sec].label} · ${groups[sec].length}`}
            </text>
          );
        })}
      </svg>
      <div className="legend-cols">
        {sectionSeq.map((sec) => (
          groups[sec].length > 0 && (
            <div key={sec} className="legend-col">
              <div className="legend-title">
                <span className="sec-dot" style={{ background: SEC_STYLE[sec].color }} />
                {SEC_STYLE[sec].label} — {groups[sec].length}
              </div>
              <Legend scenario={scenario} entries={secEntries(sec)} total={N} />
            </div>
          )
        ))}
      </div>
    </ChamberCard>
  );
}
