import type { RegionalAlliance, Scenario, SimulationResult } from '../types';
import { positionScore, computeAlliances } from '../engine/simulate';

// ---------- ordering helpers ----------
function arcOrder(scenario: Scenario, computed: { id: string; dominantPosition: string; positions: any[]; euPosition: string; saeimaSeats: number }[]) {
  const items = computed.filter((a) => a.saeimaSeats > 0 || scenario.alliances.find((x) => x.id === a.id));
  const score = (a: typeof items[number]) => {
    const hasBigTent = a.positions.includes('Big Tent');
    if (hasBigTent) return { center: true, side: 0, eu: 0, seats: a.saeimaSeats };
    const isSyn = a.positions.includes('Syncretic');
    const pos = positionScore(a.positions, a.dominantPosition as any);
    const eu = a.euPosition === 'Hard Anti-EU' ? -1 : a.euPosition === 'Pro-EU' ? 1 : 0;
    if (isSyn) return { center: true, side: pos >= 0 ? 1 : -1, eu, seats: a.saeimaSeats };
    return { center: false, side: pos, eu, seats: a.saeimaSeats };
  };
  const withScore = items.map((a) => ({ a, s: score(a) }));
  const left = withScore.filter((x) => !x.s.center && x.s.side < 0).sort((p, q) => p.s.side - q.s.side || p.s.eu - q.s.eu || q.s.seats - p.s.seats);
  const center = withScore.filter((x) => x.s.center && x.a.positions.includes('Big Tent'));
  const synL = withScore.filter((x) => x.s.center && !x.a.positions.includes('Big Tent') && x.s.side <= 0)
    .sort((p, q) => q.s.seats - p.s.seats);
  const synR = withScore.filter((x) => x.s.center && !x.a.positions.includes('Big Tent') && x.s.side > 0)
    .sort((p, q) => q.s.seats - p.s.seats);
  const right = withScore.filter((x) => !x.s.center && x.s.side > 0).sort((p, q) => p.s.side - q.s.side || q.s.eu - p.s.eu || q.s.seats - p.s.seats);
  return [...left, ...synL, ...center, ...synR, ...right].map((x) => x.a.id);
}

export function seatArcPositions(count: number, cx: number, cy: number, r: number, a0: number, a1: number) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = a0 + t * (a1 - a0);
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

// ---------- Saeima arc (horseshoe, 301) ----------
export function SaeimaArc({ scenario, onHover }: { scenario: Scenario; onHover?: (id: string | null) => void }) {
  const computed = computeAlliances(scenario);
  const order = arcOrder(scenario, computed as any);
  const seatsOf: Record<string, number> = {};
  for (const a of computed) seatsOf[a.id] = a.saeimaSeats;
  const total = Object.values(seatsOf).reduce((s, x) => s + x, 0);
  if (total === 0) return <div className="empty-note">No Saeima seats entered yet.</div>;
  const W = 900, H = 520, cx = W / 2, cy = 460;
  const rows = 8;
  const seatAssign: { id: string }[] = [];
  for (const aid of order) for (let k = 0; k < (seatsOf[aid] ?? 0); k++) seatAssign.push({ id: aid });
  const seats: { x: number; y: number; id: string }[] = [];
  const perRow = Math.ceil(seatAssign.length / rows);
  let idx = 0;
  const a0 = Math.PI * 1.02, a1 = Math.PI * 1.98;
  for (let row = 0; row < rows; row++) {
    const r = 380 - row * 34;
    const n = Math.min(perRow, seatAssign.length - idx);
    if (n <= 0) break;
    // Interpolate angle span per row for a balanced arc
    const span = (a1 - a0) * (perRow === 0 ? 1 : Math.min(1, n / perRow) * (0.5 + 0.5 * (row + 1) / rows));
    const ra0 = a0 + ((a1 - a0) - span) / 2;
    const pts = seatArcPositions(n, cx, cy, r, ra0, ra0 + span);
    for (const p of pts) {
      if (idx >= seatAssign.length) break;
      seats.push({ ...p, id: seatAssign[idx].id });
      idx++;
    }
  }
  const nameOf = new Map(scenario.alliances.map((a) => [a.id, a.name]));
  const colOf = new Map(scenario.alliances.map((a) => [a.id, a.color]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="diagram">
      {seats.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={6} fill={colOf.get(s.id) ?? '#999'}
          onMouseEnter={() => onHover?.(s.id)} onMouseLeave={() => onHover?.(null)}>
          <title>{nameOf.get(s.id) ?? s.id} — {seatsOf[s.id]} seats</title>
        </circle>
      ))}
      <text x={W / 2 - 260} y={H - 6} textAnchor="middle" className="axis-label">← Far Left</text>
      <text x={W / 2 + 260} y={H - 6} textAnchor="middle" className="axis-label">Far Right →</text>
    </svg>
  );
}

// ---------- Westminster hemicycle (CoR 150 / CoG 18) ----------
interface WestSeat { x: number; y: number; allianceId: string; isGov: boolean; }

export function WestminsterDiagram({
  scenario, results, mode, showBlocOutlines,
}: {
  scenario: Scenario;
  results: SimulationResult;
  mode: 'cor' | 'cog';
  showBlocOutlines?: boolean;
}) {
  const blocOf = new Map<string, RegionalAlliance>();
  for (const b of scenario.regionalAlliances) for (const a of b.memberAllianceIds) blocOf.set(a, b);
  const allianceById = new Map(scenario.alliances.map((a) => [a.id, a]));
  const computed = computeAlliances(scenario);
  const order = arcOrder(scenario, computed as any);

  type Sec = 'gov' | 'supply' | 'cross' | 'opp';
  const secOf = new Map<string, Sec>();
  for (const a of scenario.alliances) {
    const st = a.saeimaStatus;
    secOf.set(a.id, st === 'Government' ? 'gov' : st === 'Supply and Confidence' ? 'supply' : st === 'Cross-bench' ? 'cross' : 'opp');
  }

  // Build seat list
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

  const groups: Record<Sec, { allianceId: string; weight: number }[]> = { gov: [], supply: [], cross: [], opp: [] };
  // Within each section, alliances in bloc order (arc order, blocs together)
  const blocOrder = new Map<string, number>();
  order.forEach((aid, i) => blocOrder.set(aid, i));
  for (const sec of Object.keys(groups) as Sec[]) {
    groups[sec] = seatList.filter((s) => secOf.get(s.allianceId) === sec)
      .sort((a, b) => (blocOrder.get(a.allianceId) ?? 99) - (blocOrder.get(b.allianceId) ?? 99));
  }

  const W = 960, H = 500, cx = W / 2, cy = H - 40;
  const rows = mode === 'cor' ? 6 : 2;
  const seatR = mode === 'cor' ? 8 : 22;

  // Sections: gov left arc, opp right arc, cross top arc, supply adjacent to gov.
  const counts = {
    gov: groups.gov.length, supply: groups.supply.length,
    cross: groups.cross.length, opp: groups.opp.length,
  };
  const seats: WestSeat[] = [];
  // Compact clustered placement: each section forms a dense wedge whose angular
  // width follows the arc length actually needed for its seats (not its share of
  // the chamber), so alliances stay visually clustered together.
  const rowGap = mode === 'cor' ? 19 : 50;
  const seatGap = mode === 'cor' ? 2.5 : 4; // px between seat edges
  const rBase = mode === 'cor' ? 330 : 300;
  const placeSection = (sec: Sec, centerAngle: number): number => {
    const list = groups[sec];
    if (list.length === 0) return 0;
    const rowCounts: number[] = [];
    let remaining = list.length;
    while (remaining > 0 && rowCounts.length < rows) {
      const r = rBase - rowCounts.length * rowGap;
      const capacity = Math.max(1, Math.floor((Math.PI * r) / (2 * seatR + seatGap)));
      const n = Math.min(remaining, capacity);
      rowCounts.push(n);
      remaining -= n;
    }
    const maxRow = Math.max(...rowCounts);
    const widthAngle = (maxRow * (2 * seatR + seatGap)) / rBase;
    let idx = 0;
    rowCounts.forEach((n, row) => {
      const r = rBase - row * rowGap;
      const a0 = centerAngle - widthAngle / 2;
      const pts = seatArcPositions(n, cx, cy, r, a0, a0 + widthAngle);
      for (const p of pts) {
        if (idx >= list.length) return;
        seats.push({ x: p.x, y: p.y, allianceId: list[idx].allianceId, isGov: sec === 'gov' || sec === 'supply' });
        idx++;
      }
    });
    return widthAngle;
  };
  // Angle layout (top-half arc): gov wedge just left of top-center, opp just
  // right of it, supply hugging gov on its outer side, cross at top-center.
  // Clusters stay tight; only the cross-bench sits at the apex between them.
  const GAP = mode === 'cor' ? 0.10 : 0.16;
  const apex = Math.PI * 1.5;
  const govW = placeSection('gov', apex - GAP / 2 - 0.02);
  const supplyCenter = apex - GAP / 2 - 0.02 - (govW > 0 ? govW / 2 + GAP / 2 : 0);
  placeSection('supply', supplyCenter);
  const oppW = placeSection('opp', apex + GAP / 2 + 0.02);
  const crossCenter = counts.cross > 0
    ? apex + (oppW / 2 - govW / 2) * 0.5 + (counts.gov + counts.supply > 0 && counts.opp > 0 ? GAP / 2 : 0)
    : apex;
  placeSection('cross', crossCenter);

  const totalWeight = mode === 'cog' ? seatList.reduce((s, x) => s + x.weight, 0) : seatList.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="diagram">
      {seats.map((s, i) => {
        const al = allianceById.get(s.allianceId);
        const bloc = blocOf.get(s.allianceId);
        const outline = bloc ? bloc.color : '#8a8a8a';
        return (
          <circle key={i} cx={s.x} cy={s.y} r={seatR}
            fill={al?.color ?? '#bbb'} stroke={showBlocOutlines !== false ? outline : 'none'} strokeWidth={mode === 'cor' ? 2.5 : 5}>
            <title>{al?.name}{bloc ? ` (${bloc.name})` : ''}</title>
          </circle>
        );
      })}
      {mode === 'cog' && seatList.map((_, i) => {
        return (
          <text key={'t' + i} x={0} y={0} fontSize="11" fill="#fff" fontWeight="bold"
            transform={`translate(${seats[i].x - 7},${seats[i].y + 4})`}>2×</text>
        );
      })}
      <text x={W * 0.18} y={H - 8} className="axis-label" fill="#2563eb">Government</text>
      <text x={W * 0.82} y={H - 8} className="axis-label" fill="#dc2626">Opposition</text>
      {counts.cross > 0 && <text x={W / 2} y={H - 8} className="axis-label" fill="#71717a">Cross-bench</text>}
      <text x={W / 2} y={24} textAnchor="middle" className="axis-label">
        {mode === 'cor' ? `Council of Regions — ${seats.length} seats` : `Council of Governors — ${seats.length} governors · ${totalWeight} weighted votes in joint session (2× each)`}
      </text>
    </svg>
  );
}
