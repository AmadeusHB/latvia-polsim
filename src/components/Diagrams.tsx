import { useEffect, useMemo, useRef, useState } from 'react';
import type { RegionalAlliance, Scenario, SimulationResult } from '../types';
import { positionScore, computeAlliances } from '../engine/simulate';
import { valleyPositions, bankPositions, assertContiguous } from './parliament';
import type { Slot } from './parliament';

// ============================================================
// Ordering
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
// Shared presentation
// ============================================================

interface SeatDatum { x: number; y: number; allianceId: string; label: string; }

interface SeatFieldProps {
  seats: SeatDatum[];
  seatR: number;
  outlineOf: (allianceId: string) => string;
  fillOf: (allianceId: string) => string;
  cogBadge?: boolean;
  hovered: string | null;
  enterProgress: number; // 0..N — seats with index < progress are visible
}

function SeatField({ seats, seatR, outlineOf, fillOf, cogBadge, hovered, enterProgress }: SeatFieldProps) {
  const dim = hovered != null;
  return (
    <g>
      {seats.map((s, i) => {
        const visible = i < enterProgress;
        const isDim = dim && s.allianceId !== hovered;
        return (
          <circle key={i} cx={s.x} cy={s.y} r={seatR}
            fill={fillOf(s.allianceId)} stroke={outlineOf(s.allianceId)} strokeWidth={2}
            opacity={visible ? (isDim ? 0.22 : 1) : 0}
            style={{ transition: 'opacity 90ms linear' }}>
            <title>{s.label}</title>
          </circle>
        );
      })}
      {cogBadge && seats.map((s, i) => (
        <text key={'b' + i} x={s.x} y={s.y + 4.5} textAnchor="middle" fontSize={seatR * 0.62} fill="#fff"
          fontWeight={800} opacity={i < enterProgress && !(dim && s.allianceId !== hovered) ? 1 : 0}
          style={{ transition: 'opacity 90ms linear', pointerEvents: 'none' }}>2×</text>
      ))}
    </g>
  );
}

// Entrance animation: reveal seats in display order over ~600ms (respects reduced motion).
function useEnterProgress(count: number): number {
  const [progress, setProgress] = useState(count);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || count === 0) { setProgress(count); return; }
    const t0 = performance.now();
    const D = 600;
    setProgress(0);
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / D);
      // ease-out
      setProgress(Math.round(count * (1 - Math.pow(1 - p, 2))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [count]);
  return progress;
}

function useHover() {
  const [hovered, setHovered] = useState<string | null>(null);
  return { hovered, setHovered };
}

function LegendList({
  scenario, entries, total, hovered, setHovered,
}: {
  scenario: Scenario;
  entries: { id: string; seats: number }[];
  total: number;
  hovered: string | null;
  setHovered: (id: string | null) => void;
}) {
  const byId = new Map(scenario.alliances.map((a) => [a.id, a]));
  const blocOf = new Map<string, RegionalAlliance>();
  for (const b of scenario.regionalAlliances) for (const a of b.memberAllianceIds) blocOf.set(a, b);
  const sorted = [...entries].sort((a, b) => b.seats - a.seats);
  return (
    <div className="parliament-legend">
      {sorted.map(({ id, seats }) => {
        const a = byId.get(id);
        if (!a || seats <= 0) return null;
        const bloc = blocOf.get(id);
        return (
          <span key={id} className="legend-item" style={{ opacity: hovered && hovered !== id ? 0.35 : 1 }}
            onMouseEnter={() => setHovered(id)} onMouseLeave={() => setHovered(null)}>
            <span className="legend-dot" style={{ background: a.color, borderColor: bloc ? bloc.color : '#aab1bf', borderWidth: 2 }} />
            {a.name} <strong>{seats}</strong>
            <span className="subtle" style={{ margin: 0 }}>({(100 * seats / (total || 1)).toFixed(1)}%)</span>
          </span>
        );
      })}
    </div>
  );
}

function ChamberCard({
  title, subtitle, right, swatch, children,
}: { title: string; subtitle: string; right?: string; swatch: string; children: React.ReactNode }) {
  return (
    <div className="diagram-card">
      <div className="diagram-head">
        <div>
          <div className="diagram-title">
            <span className="chamber-swatch" style={{ background: swatch }} />
            {title}
          </div>
          <div className="diagram-sub">{subtitle}</div>
        </div>
        {right && <div className="diagram-total">{right}</div>}
      </div>
      <div className="diagram-body">{children}</div>
    </div>
  );
}

// ============================================================
// Saeima — valley U, ideological order left → right
// ============================================================

export function SaeimaArc({ scenario }: { scenario: Scenario }) {
  const { hovered, setHovered } = useHover();
  const computed = computeAlliances(scenario);
  const order = arcOrder(computed);
  const seatsOf = (aid: string) => scenario.parties.filter((p) => p.allianceId === aid).reduce((sum, p) => sum + p.saeimaSeats, 0);
  const seatAssign: string[] = [];
  for (const aid of order) for (let k = 0; k < seatsOf(aid); k++) seatAssign.push(aid);
  const total = seatAssign.length;
  const entries = order.map((aid) => ({ id: aid, seats: seatsOf(aid) })).filter((e) => e.seats > 0);

  const seatR = 7.5;
  const geo = useMemo(() => valleyPositions(Math.max(total, 1), seatR, 9), [total]);
  const progress = useEnterProgress(total);
  const byId = new Map(scenario.alliances.map((a) => [a.id, a]));

  const r_o = geo.r_o;
  const padX = 100;
  const W = Math.round(2 * r_o + 2 * padX);
  const cx = W / 2;
  const cy0 = 108;                 // circle center — valley opens UP from here
  const H = Math.round(cy0 + r_o + 56);
  const majority = Math.floor(301 / 2) + 1;

  const seats: SeatDatum[] = geo.slots.map((s, i) => ({
    x: cx + s.x, y: cy0 + s.y,
    allianceId: seatAssign[i] ?? '',
    label: `${byId.get(seatAssign[i] ?? '')?.name ?? ''} — ${seatsOf(seatAssign[i] ?? '')} seats`,
  }));

  if (total === 0) return (
    <ChamberCard title="Saeima — Republic of Latvia" subtitle="no seats entered"
      swatch="linear-gradient(180deg,#3457d5,#7b96ec)">
      <div className="empty-note">No Saeima seats entered yet.</div>
    </ChamberCard>
  );

  // Self-check: contiguity per alliance (Fix 3 Step 4)
  assertContiguous('Saeima', seats, seatAssign, seatR);

  return (
    <ChamberCard
      title="Saeima — Republic of Latvia"
      subtitle={`${entries.length} alliances · majority at ${majority}`}
      right={`${total} / 301 seats`}
      swatch="linear-gradient(180deg,#3457d5,#7b96ec)"
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="diagram" role="img" aria-label="Saeima seat diagram">
        {SeatField({
          seats, seatR,
          fillOf: (id) => byId.get(id)?.color ?? '#999',
          outlineOf: () => '#ffffff',
          hovered, enterProgress: progress,
        })}
        {/* majority tick at the bottom-center of the band */}
        <line x1={cx - 7} y1={cy0 + r_o + 7} x2={cx + 7} y2={cy0 + r_o + 7} stroke="#c3c9d8" strokeWidth={2} />
        <text x={cx} y={cy0 + r_o + 23} textAnchor="middle" className="svg-sub">majority {majority}</text>
        {/* light center label inside the valley mouth */}
        <text x={cx} y={cy0 - 26} textAnchor="middle" className="svg-sub" fontSize={12}>Saeima · Republic of Latvia</text>
        <text x={cx} y={cy0 - 8} textAnchor="middle" fontSize={17} fontWeight={800} fill="#98a0b3">
          {total}<tspan fontSize={11} fill="#b6bcc9"> / 301</tspan>
        </text>
        {/* ideological axis */}
        <text x={cx - r_o - 50} y={cy0 - 4} textAnchor="middle" className="axis-label">← Far Left</text>
        <text x={cx + r_o + 50} y={cy0 - 4} textAnchor="middle" className="axis-label">Far Right →</text>
      </svg>
      <LegendList scenario={scenario} entries={entries} total={total} hovered={hovered} setHovered={setHovered} />
    </ChamberCard>
  );
}

// ============================================================
// Westminster chamber (CoR / CoG): facing banks + floor + cross-bench
// ============================================================

type Sec = 'gov' | 'supply' | 'cross' | 'opp';

const SEC_STYLE: Record<Sec, { label: string; color: string }> = {
  gov: { label: 'GOVERNMENT', color: '#1d4ed8' },
  supply: { label: 'SUPPLY & CONFIDENCE', color: '#0e7490' },
  cross: { label: 'CROSS-BENCH', color: '#64748b' },
  opp: { label: 'OPPOSITION', color: '#b91c1c' },
};

export function WestminsterDiagram({
  scenario, results, mode,
}: {
  scenario: Scenario;
  results: SimulationResult;
  mode: 'cor' | 'cog';
}) {
  const { hovered, setHovered } = useHover();
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
  const N = seatList.length;
  if (N === 0) return (
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

  const seatR = mode === 'cor' ? 9 : 19;
  const progress = useEnterProgress(N);

  // ---- Bank geometry ----
  // Government: left bank, arc opening toward the floor (right-down).
  // Supply: attached at the government bank's floor end (bottom of its arc).
  // Opposition: right bank, mirrored. Cross-bench: small bank above the floor.
  // Each bank gets its own slot list; sections map onto slots contiguously.
  const govN = groups.gov.length, supN = groups.supply.length, oppN = groups.opp.length, crossN = groups.cross.length;
  const sweep = (100 * Math.PI) / 180;
  const govRows = mode === 'cor' ? 4 : 2;
  const govGeo = bankPositions(Math.max(govN + supN, 1), seatR, govRows, sweep, 1);
  const oppGeo = bankPositions(Math.max(oppN, 1), seatR, mode === 'cor' ? 4 : 2, sweep, -1);
  const crossGeo = bankPositions(Math.max(crossN, 1), seatR, mode === 'cor' ? 2 : 1, (70 * Math.PI) / 180, 1);

  // Chamber layout: banks face each other across a floor gap at bottom-center.
  // Left bank: opening (its valley mouth) faces RIGHT. Our valley opens up;
  // rotate the left bank -90°-ish so its arc faces the floor... simpler:
  // rotate banks by 90°: left bank = valley rotated so band runs vertically
  // on the left, arcing toward center-bottom.
  const rot = (slots: Slot[], deg: number): Slot[] => {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a), s = Math.sin(a);
    return slots.map((p) => ({ ...p, x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
  };

  // Government bank: valley rotated +90° → band arcs on the LEFT, opening faces RIGHT (toward floor).
  const govSlots = rot(govGeo.slots, 90);
  // Opposition bank: valley rotated -90° → band on the RIGHT, opening faces LEFT.
  const oppSlots = rot(oppGeo.slots, -90);
  // Cross-bench: unrotated valley above the floor, opening faces DOWN.
  const crossSlots = crossGeo.slots;

  const extOf = (slots: Slot[]) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of slots) { x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
    return { x0, x1, y0, y1 };
  };
  const gExt = extOf(govSlots);
  const oExt = extOf(oppSlots);
  const cExt = extOf(crossSlots);

  const floorW = mode === 'cor' ? 210 : 250;   // clear floor gap between banks
  const pad = 66;
  const leftW = gExt.x1 - gExt.x0 + 2 * seatR;
  const rightW = oExt.x1 - oExt.x0 + 2 * seatR;
  const W = Math.round(pad + leftW + floorW + rightW + pad);
  const crossZoneH = crossN > 0 ? cExt.y1 - cExt.y0 + 2 * seatR + 26 : 0;
  const H = Math.round(crossZoneH + Math.max(gExt.y1 - gExt.y0, oExt.y1 - oExt.y0) + 2 * seatR + pad + 54);

  // Offsets: government bank sits left of the floor; its seats ordered so the
  // first slot (t=0 end) is nearest the floor? For the rotated valley (rot +90°),
  // t=0 end lands at the BOTTOM. We want Government to own the upper part and
  // Supply the seats nearest the floor: government run starts at t=0 (bottom)
  // — no: supply must be nearest the floor. So give Supply the FIRST run
  // (bottom end of the bank) and Government the rest? The instruction says
  // Supply is "at the bank's end nearest the floor" — as long as it's attached
  // there, either internal order works; Gov first from the top reads better.
  // t=0 after +90° rotation maps to the bottom; so assign Government from the
  // END of the slot list backwards? Simplest: reverse the govSlots so t runs
  // bottom→top... instead: assign supply LAST run nearest floor = give supply
  // the slots at the bottom = the first slots after rotation.
  const govOffsetX = pad + seatR - gExt.x0;
  const bankBottom = H - pad - 30;
  const govOffsetY = bankBottom - gExt.y1;
  const oppOffsetX = W - pad - seatR - oExt.x1;
  const oppOffsetY = bankBottom - oExt.y1;
  const crossOffsetX = W / 2 - (cExt.x0 + cExt.x1) / 2;
  const crossOffsetY = pad - cExt.y0;

  // Build ordered seat arrays per bank. Government+Supply share the left bank:
  // Government takes the run of slots AWAY from the floor, Supply the run at
  // the floor end (bottom of the rotated arc), so the two stay attached.
  const govRun = govSlots.slice(0, govN);
  const supRun = govSlots.slice(govN, govN + supN);
  // After +90° rotation, slot index 0 (t=0) is at the BOTTOM (floor end).
  // We want Supply nearest the floor → Supply gets slots [0..supN).
  const leftBankRun = [...supRun, ...govRun];
  const leftOrdered: { allianceId: string }[] = [...groups.supply.map((s) => ({ allianceId: s.allianceId })), ...groups.gov.map((s) => ({ allianceId: s.allianceId }))];

  const seats: SeatDatum[] = [];
  const owners: string[] = [];
  const pushBank = (slots: Slot[], orderedOwner: { allianceId: string }[], ox: number, oy: number) => {
    slots.forEach((s, i) => {
      const owner = orderedOwner[i]?.allianceId ?? orderedOwner[orderedOwner.length - 1]?.allianceId ?? '';
      const al = allianceById.get(owner);
      const bloc = blocOf.get(owner);
      seats.push({
        x: ox + s.x, y: oy + s.y, allianceId: owner,
        label: `${al?.name ?? ''}${bloc ? ` (${bloc.name})` : ''}${mode === 'cog' ? ' · 2 votes' : ''}`,
      });
      owners.push(owner);
    });
  };
  pushBank(leftBankRun, leftOrdered, govOffsetX, govOffsetY);
  pushBank(oppSlots, groups.opp, oppOffsetX, oppOffsetY);
  if (crossN > 0) pushBank(crossSlots, groups.cross, crossOffsetX, crossOffsetY);

  // Self-check per section (Fix 3 Step 4) — zones are separate banks by
  // construction, so verify per alliance within the whole set.
  assertContiguous(mode === 'cor' ? 'CoR' : 'CoG', seats, owners, seatR);

  const totalWeight = mode === 'cog' ? seatList.reduce((s, x) => s + x.weight, 0) : seatList.length;
  const secEntries = (sec: Sec) => {
    const ids = [...new Set(groups[sec].map((s) => s.allianceId))];
    return ids.map((id) => ({ id, seats: groups[sec].filter((s) => s.allianceId === id).length }));
  };

  const title = mode === 'cor' ? 'Council of Regions' : 'Council of Governors';
  const fillOf = (id: string) => allianceById.get(id)?.color ?? '#bbb';
  const outlineOf = (id: string) => blocOf.get(id)?.color ?? '#aab1bf';

  // Label anchors
  const govLabel = { x: govOffsetX + gExt.x0 + (gExt.x1 - gExt.x0) / 2, y: govOffsetY + gExt.y0 - 14 };
  const oppLabel = { x: oppOffsetX + oExt.x0 + (oExt.x1 - oExt.x0) / 2, y: oppOffsetY + oExt.y0 - 14 };
  const crossLabel = { x: W / 2, y: crossN > 0 ? crossOffsetY + cExt.y1 + 18 : 0 };

  return (
    <ChamberCard
      title={title}
      subtitle={mode === 'cor'
        ? `${N} of 150 seats · ${groups.gov.length} government · ${groups.opp.length} opposition`
        : `${N} governors · each carries 2 votes in the joint session`}
      right={mode === 'cor' ? `${N} / 150 seats` : `${totalWeight} joint votes`}
      swatch={mode === 'cor' ? 'linear-gradient(180deg,#1a7f4e,#57c08a)' : 'linear-gradient(180deg,#9e2b3c,#d4704f)'}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="diagram" role="img" aria-label={`${title} seat diagram`}>
        {SeatField({ seats, seatR, fillOf, outlineOf, cogBadge: mode === 'cog', hovered, enterProgress: progress })}
        {/* section labels */}
        {groups.gov.length > 0 && (
          <text x={govLabel.x} y={govLabel.y} textAnchor="middle" className="divider-label" fill={SEC_STYLE.gov.color}>
            {SEC_STYLE.gov.label} · {groups.gov.length}
          </text>
        )}
        {groups.supply.length > 0 && (
          <text x={govOffsetX + gExt.x0 + (gExt.x1 - gExt.x0) / 2} y={govOffsetY + gExt.y1 + 20}
            textAnchor="middle" className="divider-label" fill={SEC_STYLE.supply.color}>
            {SEC_STYLE.supply.label} · {groups.supply.length}
          </text>
        )}
        {groups.cross.length > 0 && (
          <text x={crossLabel.x} y={crossLabel.y} textAnchor="middle" className="divider-label" fill={SEC_STYLE.cross.color}>
            {SEC_STYLE.cross.label} · {groups.cross.length}
          </text>
        )}
        {groups.opp.length > 0 && (
          <text x={oppLabel.x} y={oppLabel.y} textAnchor="middle" className="divider-label" fill={SEC_STYLE.opp.color}>
            {SEC_STYLE.opp.label} · {groups.opp.length}
          </text>
        )}
        {/* center floor label */}
        <text x={W / 2} y={bankBottom - 26} textAnchor="middle" className="svg-sub" fontSize={12}>
          {mode === 'cor' ? 'Council of Regions' : 'Council of Governors'}
        </text>
        <text x={W / 2} y={bankBottom - 8} textAnchor="middle" fontSize={17} fontWeight={800} fill="#98a0b3">
          {mode === 'cor' ? N : totalWeight}
          <tspan fontSize={11} fill="#b6bcc9">{mode === 'cor' ? ' / 150' : ' joint votes'}</tspan>
        </text>
      </svg>
      <div className="legend-cols">
        {(['gov', 'supply', 'cross', 'opp'] as Sec[]).map((sec) => (
          groups[sec].length > 0 && (
            <div key={sec} className="legend-col">
              <div className="legend-title">
                <span className="sec-dot" style={{ background: SEC_STYLE[sec].color }} />
                {SEC_STYLE[sec].label} — {groups[sec].length}
              </div>
              <LegendList scenario={scenario} entries={secEntries(sec)} total={N} hovered={hovered} setHovered={setHovered} />
            </div>
          )
        ))}
      </div>
    </ChamberCard>
  );
}
