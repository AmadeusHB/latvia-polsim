import type { RegionalAlliance, Scenario, SimulationResult } from '../types';
import { positionScore, computeAlliances } from '../engine/simulate';

// ============================================================
// Shared helpers
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

interface SeatXY { x: number; y: number; row: number; allianceId: string; }

function layoutArcRows(
  seatAssign: { allianceId: string }[],
  opts: { cx: number; cy: number; r0: number; rowGap: number; seatR: number; a0: number; a1: number },
): SeatXY[] {
  const { cx, cy, r0, rowGap, seatR, a0, a1 } = opts;
  const seats: SeatXY[] = [];
  if (seatAssign.length === 0) return seats;
  const seatPitch = 2 * seatR + 3;
  const maxRows = Math.floor(r0 / rowGap);
  const rowsNeeded = (() => {
    for (let rows = 1; rows <= maxRows; rows++) {
      let cap = 0;
      for (let r = 0; r < rows; r++) {
        const rr = r0 - r * rowGap;
        if (rr > seatPitch) cap += Math.floor((rr * (a1 - a0)) / seatPitch);
      }
      if (cap >= seatAssign.length) return rows;
    }
    return maxRows;
  })();
  const rows2 = rowsNeeded;
  const perRow: number[] = [];
  const radii: number[] = [];
  for (let r = 0; r < rows2; r++) radii.push(r0 - r * rowGap);
  const capOf = radii.map((r) => Math.floor((r * (a1 - a0)) / seatPitch));
  const totalCap = capOf.reduce((s, x) => s + x, 0);
  let remaining = seatAssign.length;
  for (let r = 0; r < rows2; r++) {
    const n = r === rows2 - 1 ? remaining : Math.min(remaining, capOf[r], Math.round(seatAssign.length * capOf[r] / totalCap));
    perRow.push(n);
    remaining -= n;
  }
  const assigned = perRow.reduce((s, x) => s + x, 0);
  if (assigned < seatAssign.length && perRow.length > 0) {
    perRow[0] += seatAssign.length - assigned;
  }
  let idx = 0;
  for (let r = 0; r < rows2; r++) {
    const rr = radii[r];
    const n = perRow[r];
    if (n <= 0) continue;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const ang = a0 + t * (a1 - a0);
      pts.push({ x: cx + rr * Math.cos(ang), y: cy + rr * Math.sin(ang) });
    }
    for (const p of pts) {
      if (idx >= seatAssign.length) break;
      seats.push({ x: p.x, y: p.y, row: r, allianceId: seatAssign[idx].allianceId });
      idx++;
    }
  }
  return seats;
}

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

// Chamber card wrapper: title bar + svg + legend
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
  const seatAssign: { allianceId: string }[] = [];
  const seatsOf = (aid: string) => scenario.parties.filter((p) => p.allianceId === aid).reduce((sum, p) => sum + p.saeimaSeats, 0);
  for (const aid of order) {
    for (let k = 0; k < seatsOf(aid); k++) seatAssign.push({ allianceId: aid });
  }
  const total = seatAssign.length;
  if (total === 0) return (
    <ChamberCard title="Saeima" subtitle="no seats entered" swatch="linear-gradient(180deg,#3457d5,#7b96ec)">
      <div className="empty-note">No Saeima seats entered yet.</div>
    </ChamberCard>
  );
  const W = 920, H = 500, cx = W / 2, cy = H - 44;
  const seats = layoutArcRows(seatAssign, { cx, cy, r0: 390, rowGap: 27, seatR: 7.5, a0: -Math.PI * 0.97, a1: -Math.PI * 0.03 });
  const byId = new Map(scenario.alliances.map((a) => [a.id, a]));
  const entries = order.map((aid) => ({ id: aid, seats: seatsOf(aid) })).filter((e) => e.seats > 0);
  const majority = Math.floor(301 / 2) + 1;

  return (
    <ChamberCard
      title="Saeima"
      subtitle={`${total} of 301 seats · ${entries.length} alliances · majority at ${majority}`}
      swatch="linear-gradient(180deg,#3457d5,#7b96ec)"
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="diagram" role="img" aria-label="Saeima seat diagram">
        <defs>
          <radialGradient id="centerEmblem" cx="50%" cy="42%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f0f2f7" />
          </radialGradient>
        </defs>
        {/* soft backdrop arc */}
        <path d={`M ${cx - 402} ${cy} A 402 402 0 0 1 ${cx + 402} ${cy}`} fill="none" stroke="#eef1f6" strokeWidth={30} strokeLinecap="round" transform={`rotate(180 ${cx} ${cy})`} opacity="0" />
        <path d={`M ${cx - 402} ${cy} A 402 402 0 0 0 ${cx + 402} ${cy}`} fill="none" stroke="#eef1f6" strokeWidth={30} strokeLinecap="round" />
        {/* majority tick at center-top */}
        <line x1={cx - 6} y1={cy - 404} x2={cx + 6} y2={cy - 404} stroke="#c3c9d8" strokeWidth={2} />
        <text x={cx} y={cy - 412} textAnchor="middle" className="svg-sub">50%</text>
        {seats.map((s, i) => {
          const a = byId.get(s.allianceId);
          return (
            <circle key={i} cx={s.x} cy={s.y} r={7.6}
              fill={a?.color ?? '#999'} stroke="#ffffff" strokeWidth={0.9}>
              <title>{a?.name ?? s.allianceId} — {seatsOf(s.allianceId)} seats</title>
            </circle>
          );
        })}
        {/* center emblem */}
        <circle cx={cx} cy={cy - 150} r={74} fill="url(#centerEmblem)" stroke="#e4e8f0" />
        <text x={cx} y={cy - 158} textAnchor="middle" className="svg-title" fontSize={19}>Saeima</text>
        <text x={cx} y={cy - 136} textAnchor="middle" className="svg-sub">Republic of Latvia</text>
        <text x={cx} y={cy - 112} textAnchor="middle" fontSize={15} fontWeight={800} fill="#16192b">{total}<tspan fontSize={11} fill="#8b93a7"> / 301</tspan></text>
        <text x={cx - 355} y={H - 10} className="axis-label" textAnchor="middle">← Left</text>
        <text x={cx + 355} y={H - 10} className="axis-label" textAnchor="middle">Right →</text>
      </svg>
      <Legend scenario={scenario} entries={entries} />
    </ChamberCard>
  );
}

// ============================================================
// Westminster hemicycle (CoR 150 / CoG 18)
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
  const emptySubtitle = mode === 'cor' ? '150 seats' : '18 governors · 2 votes each in joint session';
  if (seatList.length === 0) return (
    <ChamberCard title={mode === 'cor' ? 'Council of Regions' : 'Council of Governors'} subtitle={emptySubtitle}
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

  const W = 960, H = 520, cx = W / 2, cy = H - 52;
  const seatR = mode === 'cor' ? 8.2 : 19;
  const seats: (SeatXY & { sec: Sec })[] = [];
  const rowGap = mode === 'cor' ? 21 : 54;
  const rBase = mode === 'cor' ? 352 : 302;

  const packSection = (sec: Sec, center: number, list: { allianceId: string }[]) => {
    if (list.length === 0) return;
    const rowsN = mode === 'cor' ? 4 : 2;
    const perRow: number[] = [];
    const radii: number[] = [];
    for (let r = 0; r < rowsN; r++) radii.push(rBase - r * rowGap);
    let remaining = list.length;
    for (let r = 0; r < rowsN; r++) {
      const n = r === rowsN - 1 ? remaining : Math.min(remaining, Math.ceil(list.length / rowsN));
      perRow.push(n); remaining -= n;
    }
    const maxN = Math.max(...perRow);
    const width = (maxN * 2 * (seatR + 1.6)) / rBase;
    let idx = 0;
    for (let r = 0; r < rowsN; r++) {
      const rr = radii[r];
      const n = perRow[r];
      if (n <= 0) continue;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const ang = center - width / 2 + t * width;
        seats.push({ x: cx + rr * Math.cos(ang), y: cy + rr * Math.sin(ang), row: r, allianceId: list[idx].allianceId, sec });
        idx++;
      }
    }
  };

  const govList = groups.gov.map((s) => ({ allianceId: s.allianceId }));
  const oppList = groups.opp.map((s) => ({ allianceId: s.allianceId }));
  const crossList = groups.cross.map((s) => ({ allianceId: s.allianceId }));
  const supplyList = groups.supply.map((s) => ({ allianceId: s.allianceId }));
  const angDeg = (deg: number) => (deg * Math.PI) / 180;
  packSection('gov', angDeg(205), govList);
  packSection('supply', angDeg(232), supplyList);
  packSection('cross', angDeg(270), crossList);
  packSection('opp', angDeg(335), oppList);

  const totalWeight = mode === 'cog' ? seatList.reduce((s, x) => s + x.weight, 0) : seatList.length;
  const govWeighted = groups.gov.reduce((s, x) => s + x.weight, 0) + groups.supply.reduce((s, x) => s + x.weight, 0);
  const secEntries = (sec: Sec) => {
    const ids = [...new Set(groups[sec].map((s) => s.allianceId))];
    return ids.map((id) => ({ id, seats: groups[sec].filter((s) => s.allianceId === id).length }));
  };

  const title = mode === 'cor' ? 'Council of Regions' : 'Council of Governors';
  const subtitle = mode === 'cor'
    ? `${seats.length} of 150 seats · ${groups.gov.length} government · ${groups.opp.length} opposition`
    : `${seats.length} governors · ${totalWeight} weighted votes · government+supply ${govWeighted}`;

  return (
    <ChamberCard title={title} subtitle={subtitle}
      swatch={mode === 'cor' ? 'linear-gradient(180deg,#1a7f4e,#57c08a)' : 'linear-gradient(180deg,#9e2b3c,#d4704f)'}>
      <svg viewBox={`0 0 ${W} ${H}`} className="diagram" role="img" aria-label={`${title} seat diagram`}>
        <defs>
          <radialGradient id={`center-${mode}`} cx="50%" cy="40%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f0f2f7" />
          </radialGradient>
        </defs>
        {/* backdrop */}
        <path d={`M ${cx - rBase - 15} ${cy} A ${rBase + 15} ${rBase + 15} 0 0 1 ${cx + rBase + 15} ${cy}`}
          fill="none" stroke="#eef1f6" strokeWidth={mode === 'cor' ? 24 : 46} strokeLinecap="round" />
        {/* section dividers (radial ticks between wedges) */}
        {[
          { deg: 188, on: groups.gov.length > 0 },
          { deg: 218, on: groups.supply.length > 0 },
          { deg: 252, on: groups.supply.length > 0 && groups.cross.length > 0 },
          { deg: 288, on: groups.cross.length > 0 },
          { deg: 322, on: groups.opp.length > 0 },
        ].filter((t) => t.on).map((t, i) => {
          const r1 = rBase + 4 * rowGap - 6;
          const r2 = rBase + 18;
          const a = angDeg(t.deg);
          return (
            <line key={i} x1={cx + r1 * Math.cos(a)} y1={cy + r1 * Math.sin(a)}
              x2={cx + r2 * Math.cos(a)} y2={cy + r2 * Math.sin(a)}
              stroke="#d4d9e4" strokeWidth={1.5} />
          );
        })}
        {seats.map((s, i) => {
          const al = allianceById.get(s.allianceId);
          const bloc = blocOf.get(s.allianceId);
          const outline = bloc ? bloc.color : '#aab1bf';
          return (
            <circle key={i} cx={s.x} cy={s.y} r={seatR}
              fill={al?.color ?? '#bbb'} stroke={outline} strokeWidth={mode === 'cor' ? 2 : 4.5}>
              <title>{al?.name}{bloc ? ` (${bloc.name})` : ''}{mode === 'cog' ? ' · 2 votes' : ''}</title>
            </circle>
          );
        })}
        {mode === 'cog' && seats.map((s, i) => (
          <text key={'t' + i} x={s.x} y={s.y + 4} textAnchor="middle" fontSize="11.5" fill="#fff" fontWeight={800}>2×</text>
        ))}
        {/* center emblem */}
        <circle cx={cx} cy={cy - 128} r={mode === 'cor' ? 62 : 74} fill={`url(#center-${mode})`} stroke="#e4e8f0" />
        <text x={cx} y={cy - (mode === 'cor' ? 134 : 140)} textAnchor="middle" className="svg-title" fontSize={mode === 'cor' ? 15 : 17}>
          {mode === 'cor' ? 'CoR' : 'CoG'}
        </text>
        <text x={cx} y={cy - (mode === 'cor' ? 116 : 118)} textAnchor="middle" className="svg-sub">
          {mode === 'cor' ? 'Council of Regions' : 'Council of Governors'}
        </text>
        <text x={cx} y={cy - (mode === 'cor' ? 96 : 96)} textAnchor="middle" fontSize={16} fontWeight={800} fill="#16192b">
          {mode === 'cor' ? seats.length : `${totalWeight}`}
          <tspan fontSize={11} fill="#8b93a7">{mode === 'cor' ? ' / 150' : ' joint votes'}</tspan>
        </text>
        {/* section labels */}
        {(['gov', 'supply', 'cross', 'opp'] as Sec[]).map((sec) => {
          if (groups[sec].length === 0) return null;
          const positions: Record<Sec, number> = { gov: 0.115, supply: 0.29, cross: 0.5, opp: 0.845 };
          return (
            <text key={sec} x={W * positions[sec]} y={H - 12} textAnchor="middle"
              className="divider-label" fill={SEC_STYLE[sec].color}>
              {SEC_STYLE[sec].label} · {groups[sec].length}
            </text>
          );
        })}
      </svg>
      <div className="legend-cols">
        {(['gov', 'supply', 'cross', 'opp'] as Sec[]).map((sec) => (
          groups[sec].length > 0 && (
            <div key={sec} className="legend-col">
              <div className="legend-title">
                <span className="sec-dot" style={{ background: SEC_STYLE[sec].color }} />
                {SEC_STYLE[sec].label} — {groups[sec].length}
              </div>
              <Legend scenario={scenario} entries={secEntries(sec)} total={seatList.length} />
            </div>
          )
        ))}
      </div>
    </ChamberCard>
  );
}
