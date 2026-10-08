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

// Parliament-style curved arc rows. Seats flow left→right along the arc,
// grouped per alliance in `order`. Angles in radians; 180° = left end.
function layoutArcRows(
  seatAssign: { allianceId: string }[],
  opts: { cx: number; cy: number; r0: number; rowGap: number; seatR: number; a0: number; a1: number },
): SeatXY[] {
  const { cx, cy, r0, rowGap, seatR, a0, a1 } = opts;
  const seats: SeatXY[] = [];
  if (seatAssign.length === 0) return seats;
  // Row capacity: seats per row limited by arc length; keep adding rows until
  // all seats fit (parliament graphics typically use 8–12 rows for 300 seats).
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
  // distribute seats: outer rows get proportionally more (arc length grows with r),
  // but never more than the row's physical capacity.
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
  // Fail-safe: if rounding dropped seats, place them on the widest row anyway
  // (slightly tighter than ideal but guarantees every seat is drawn).
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

function Legend({ scenario, entries }: { scenario: Scenario; entries: { id: string; seats: number }[] }) {
  const byId = new Map(scenario.alliances.map((a) => [a.id, a]));
  return (
    <div className="parliament-legend">
      {entries.map(({ id, seats }) => {
        const a = byId.get(id);
        if (!a || seats <= 0) return null;
        return (
          <span key={id} className="legend-item">
            <span className="legend-dot" style={{ background: a.color }} />
            {a.name} <strong>{seats}</strong>
          </span>
        );
      })}
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
  for (const aid of order) {
    const seats = scenario.parties.filter((p) => p.allianceId === aid).reduce((sum, p) => sum + p.saeimaSeats, 0);
    for (let k = 0; k < seats; k++) seatAssign.push({ allianceId: aid });
  }
  const total = seatAssign.length;
  if (total === 0) return <div className="empty-note">No Saeima seats entered yet.</div>;

  const W = 920, H = 480, cx = W / 2, cy = H - 30;
  const seats = layoutArcRows(seatAssign, { cx, cy, r0: 390, rowGap: 26, seatR: 7.5, a0: Math.PI * 0.03, a1: Math.PI * 0.97 });
  const byId = new Map(scenario.alliances.map((a) => [a.id, a]));
  const entries = order.map((aid) => ({ id: aid, seats: scenario.parties.filter((p) => p.allianceId === aid).reduce((sum, p) => sum + p.saeimaSeats, 0) }))
    .filter((e) => e.seats > 0);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="diagram">
        {/* subtle backdrop arc */}
        <path d={`M ${cx - 400} ${cy} A 400 400 0 0 1 ${cx + 400} ${cy}`} fill="none" stroke="#eef2f7" strokeWidth="26" />
        {seats.map((s, i) => {
          const a = byId.get(s.allianceId);
          return (
            <circle key={i} cx={s.x} cy={s.y} r={8}
              fill={a?.color ?? '#999'} stroke="#ffffff" strokeWidth={1}>
              <title>{a?.name ?? s.allianceId}</title>
            </circle>
          );
        })}
        <text x={cx - 330} y={H - 6} className="axis-label" textAnchor="middle">← Left</text>
        <text x={cx + 330} y={H - 6} className="axis-label" textAnchor="middle">Right →</text>
        <text x={cx} y={H - 6} className="axis-label" textAnchor="middle" fontWeight="600">
          Saeima — {total}/301 seats
        </text>
      </svg>
      <Legend scenario={scenario} entries={entries} />
    </div>
  );
}

// ============================================================
// Westminster hemicycle (CoR 150 / CoG 18)
// ============================================================

type Sec = 'gov' | 'supply' | 'cross' | 'opp';

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
  if (seatList.length === 0) return <div className="empty-note">Run a simulation first.</div>;

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

  const W = 960, H = 500, cx = W / 2, cy = H - 46;
  const seatR = mode === 'cor' ? 8 : 20;
  const seats: (SeatXY & { sec: Sec })[] = [];

  // Section wedges: gov from 190°, opp ends at 350°, cross at top. Seats packed
  // along concentric rows inside each wedge, clustered (wedge width ∝ seats).
  const rowGap = mode === 'cor' ? 20 : 52;
  const rBase = mode === 'cor' ? 350 : 300;
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
    // wedge width from widest row
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

  // Place: gov left-of-top, opp right-of-top, cross at apex, supply hugging gov.
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
  const secEntries = (sec: Sec) => {
    const ids = [...new Set(groups[sec].map((s) => s.allianceId))];
    return ids.map((id) => ({ id, seats: groups[sec].filter((s) => s.allianceId === id).length }));
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="diagram">
        <path d={`M ${cx - rBase - 14} ${cy} A ${rBase + 14} ${rBase + 14} 0 0 1 ${cx + rBase + 14} ${cy}`} fill="none" stroke="#eef2f7" strokeWidth={mode === 'cor' ? 22 : 40} />
        {seats.map((s, i) => {
          const al = allianceById.get(s.allianceId);
          const bloc = blocOf.get(s.allianceId);
          const outline = bloc ? bloc.color : '#9aa4b2';
          return (
            <circle key={i} cx={s.x} cy={s.y} r={seatR}
              fill={al?.color ?? '#bbb'} stroke={outline} strokeWidth={mode === 'cor' ? 2 : 4.5}>
              <title>{al?.name}{bloc ? ` (${bloc.name})` : ''}</title>
            </circle>
          );
        })}
        {mode === 'cog' && seats.map((s, i) => (
          <text key={'t' + i} x={s.x} y={s.y + 4} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">2×</text>
        ))}
        <text x={W * 0.13} y={H - 8} className="axis-label" fill="#1d4ed8" fontWeight="600">Government</text>
        {groups.supply.length > 0 && <text x={W * 0.30} y={H - 8} className="axis-label" fill="#0e7490" fontWeight="600">Supply &amp; Confidence</text>}
        {groups.cross.length > 0 && <text x={W / 2} y={H - 8} className="axis-label" fill="#52525b" fontWeight="600">Cross-bench</text>}
        <text x={W * 0.85} y={H - 8} className="axis-label" fill="#b91c1c" fontWeight="600">Opposition</text>
        <text x={W / 2} y={20} textAnchor="middle" className="axis-label" fontWeight="700">
          {mode === 'cor'
            ? `Council of Regions — ${seats.length} of 150 seats`
            : `Council of Governors — ${seats.length} governors · ${totalWeight} weighted votes (2× each)`}
        </text>
      </svg>
      <div className="legend-cols">
        {(['gov', 'supply', 'cross', 'opp'] as Sec[]).map((sec) => (
          groups[sec].length > 0 && (
            <div key={sec} className="legend-col">
              <div className="legend-title">
                {sec === 'gov' ? 'Government' : sec === 'supply' ? 'Supply & Confidence' : sec === 'cross' ? 'Cross-bench' : 'Opposition'}
              </div>
              <Legend scenario={scenario} entries={secEntries(sec)} />
            </div>
          )
        ))}
      </div>
    </div>
  );
}
