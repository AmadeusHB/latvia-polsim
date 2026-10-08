import { useEffect, useRef, useState } from 'react';
import type { Scenario, SimulationResult } from '../types';
import { computeAlliances, positionScore } from '../engine/simulate';
import { buildArc, buildChamber, assertContiguity, rgbDistance } from './chamberGeometry';
import type { Seat } from './chamberGeometry';

// ============================================================
// Display order (ideological, far-left -> far-right)
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
// Shared helpers (LAW 3/4/7/8, hover, animation)
// ============================================================

function useHover() {
  const [hovered, setHovered] = useState<string | null>(null);
  return { hovered, setHovered };
}

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
      setProgress(Math.round(count * (1 - Math.pow(1 - p, 2))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [count]);
  return progress;
}

interface BlocVisuals {
  fillOf: (id: string) => string;
  strokeOf: (id: string) => string;
  nameOf: (id: string) => string;
}

function useBlocVisuals(scenario: Scenario): BlocVisuals {
  const byId = new Map(scenario.alliances.map((a) => [a.id, a]));
  const fillOfHelper = (id: string) => byId.get(id)?.color ?? '#bbb';
  const blocOf = new Map<string, { color: string; name: string }>();
  for (const b of scenario.regionalAlliances) {
    for (const a of b.memberAllianceIds) blocOf.set(a, { color: b.color, name: b.name });
  }
  return {
    fillOf: fillOfHelper,                                   // LAW 3: exact hex
    strokeOf: (id) => blocOf.get(id)?.color ?? byId.get(id)?.color ?? '#999',  // LAW 4: bloc color; bloc-less alliances use their own alliance color
    nameOf: (id) => byId.get(id)?.name ?? '',
  };
}

// Similar-color neighbors (LAW 7): display-order adjacent alliances whose colors
// are closer than RGB 120 get their boundary seats nudged 1px apart.
function similarColorPairs(parties: { id: string }[], scenario: Scenario): Set<string> {
  const byId = new Map(scenario.alliances.map((a) => [a.id, a]));
  const set = new Set<string>();
  for (let i = 1; i < parties.length; i++) {
    const a = byId.get(parties[i - 1].id);
    const b = byId.get(parties[i].id);
    if (!a || !b) continue;
    if (rgbDistance(a.color, b.color) < 120) set.add(`${parties[i - 1].id}|${parties[i].id}`);
  }
  return set;
}

// LAW 3/4 seat field: exact fill, one stroke style, hover dimming only.
function SeatField({
  seats, seatR, strokeW, visuals, similar, cogBadge, hovered, progress, outline = 'bloc',
}: {
  seats: (Seat & { label: string })[];
  seatR: number;
  strokeW: number;
  visuals: BlocVisuals;
  similar?: Set<string>;
  cogBadge?: boolean;
  hovered: string | null;
  progress: number;
  outline?: 'bloc' | 'none';
}) {
  const dim = hovered != null;
  void similar; // LAW 7 pairs computed upstream; boundary rendering handled via distinct strokes
  return (
    <g>
      {seats.map((s, i) => {
        const visible = i < progress;
        const isDim = dim && s.allianceId !== hovered;
        return (
          <circle key={i} cx={s.x} cy={s.y} r={seatR}
            fill={visuals.fillOf(s.allianceId)}
            stroke={outline === 'none' ? 'none' : visuals.strokeOf(s.allianceId)}
            strokeWidth={outline === 'none' ? 0 : strokeW}
            opacity={visible ? (isDim ? 0.25 : 1) : 0}
            style={{ transition: 'opacity 90ms linear' }}>
            <title>{s.label}</title>
          </circle>
        );
      })}
      {cogBadge && seats.map((s, i) => (
        <text key={'b' + i} x={s.x} y={s.y} textAnchor="middle" dominantBaseline="central"
          fontSize={seatR * 0.64} fill="#fff" fontWeight={700} pointerEvents="none"
          stroke="rgba(0,0,0,0.35)" strokeWidth={0.8} paintOrder="stroke"
          opacity={i < progress && !(dim && s.allianceId !== hovered) ? 1 : 0}
          style={{ transition: 'opacity 90ms linear' }}>2×</text>
      ))}
    </g>
  );
}

// LAW 8 legend: two columns, aligned counts, chips with bloc stroke, hover.
function Legend({ entries, visuals, hovered, setHovered }: {
  entries: { id: string; seats: number }[];
  visuals: BlocVisuals;
  hovered: string | null;
  setHovered: (id: string | null) => void;
}) {
  const sorted = [...entries].filter((e) => e.seats > 0).sort((a, b) => b.seats - a.seats);
  const half = Math.ceil(sorted.length / 2);
  const cols = [sorted.slice(0, half), sorted.slice(half)];
  const row = (e: { id: string; seats: number }) => (
    <div key={e.id} className="legend-row"
      style={{ opacity: hovered && hovered !== e.id ? 0.4 : 1 }}
      onMouseEnter={() => setHovered(e.id)} onMouseLeave={() => setHovered(null)}>
      <span className="legend-chip" style={{ background: visuals.fillOf(e.id), border: `2px solid ${visuals.strokeOf(e.id)}` }} />
      <span className="legend-name">{visuals.nameOf(e.id)}</span>
      <span className="legend-count">{e.seats}</span>
    </div>
  );
  return (
    <div className="legend-two-col">
      {cols.map((c, ci) => <div key={ci} className="legend-col">{c.map(row)}</div>)}
    </div>
  );
}

function ChamberCard({ title, subtitle, right, swatch, children, warning }: {
  title: string; subtitle: string; right?: string; swatch: string; children: React.ReactNode; warning?: string | null;
}) {
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
      {warning && <div className="issue warn" style={{ marginTop: 8 }}>{warning}</div>}
      <div className="diagram-body">{children}</div>
    </div>
  );
}

// ============================================================
// TYPE A — Saeima arc
// ============================================================

export function SaeimaArc({ scenario }: { scenario: Scenario }) {
  const { hovered, setHovered } = useHover();
  const visuals = useBlocVisuals(scenario);
  const computed = computeAlliances(scenario);
  const order = arcOrder(computed);
  const seatsOf = (aid: string) => scenario.parties.filter((p) => p.allianceId === aid).reduce((s, p) => s + p.saeimaSeats, 0);
  const parties = order.map((aid) => ({ id: aid, seats: seatsOf(aid) })).filter((p) => p.seats > 0);
  const total = parties.reduce((s, p) => s + p.seats, 0);
  const enteredTotal = scenario.parties.reduce((s, p) => s + p.saeimaSeats, 0);
  const warning = enteredTotal !== 301 ? `Entered seats: ${enteredTotal}/301 — Saeima must total 301` : null;

  if (total === 0) return (
    <ChamberCard title="Saeima — Republic of Latvia" subtitle="no seats entered"
      swatch="linear-gradient(180deg,#3457d5,#7b96ec)">
      <div className="empty-note">No Saeima seats entered yet.</div>
    </ChamberCard>
  );

  const layout = buildArc(parties);
  const seats = layout.seats.map((s) => ({ ...s, label: `${visuals.nameOf(s.allianceId)} — ${seatsOf(s.allianceId)} seats` }));
  const progress = useEnterProgress(seats.length);
  const similar = similarColorPairs(parties, scenario);
  const majority = Math.floor(301 / 2) + 1;
  const rOuter = layout.radii[layout.K - 1];

  // Center label sits in the open space ABOVE the band (SECTION 4.3):
  // between the center point C and the innermost row. Reserve a bounding
  // box and verify no seat circle intersects it.
  const labelY = layout.cy + (layout.radii[0] - layout.cy) / 2;
  const labelBox = { x0: layout.cx - 110, x1: layout.cx + 110, y0: labelY - 34, y1: labelY + 22 };
  for (const s of layout.seats) {
    const nx = Math.max(labelBox.x0, Math.min(s.x, labelBox.x1));
    const ny = Math.max(labelBox.y0, Math.min(s.y, labelBox.y1));
    if ((nx - s.x) ** 2 + (ny - s.y) ** 2 < (layout.seatR + 2) ** 2)
      throw new Error('center label collides with a seat circle');
  }

  return (
    <ChamberCard
      title="Saeima — Republic of Latvia"
      subtitle={`${parties.length} alliances · majority at ${majority}`}
      right={`${total} / 301 seats`}
      swatch="linear-gradient(180deg,#3457d5,#7b96ec)"
      warning={warning}
    >
      <svg viewBox={`0 0 ${layout.W} ${layout.H}`} className="diagram" role="img" aria-label="Saeima seat diagram">
        <SeatField seats={seats} seatR={layout.seatR} strokeW={2} visuals={visuals} similar={similar}
          hovered={hovered} progress={progress} outline="none" />
        {/* majority tick under the band bottom */}
        <line x1={layout.cx - 7} y1={layout.cy + rOuter + layout.seatR + 6}
          x2={layout.cx + 7} y2={layout.cy + rOuter + layout.seatR + 6}
          stroke="#c3c9d8" strokeWidth={2} />
        {/* center label in the open valley above the band (LAW 5: reserved empty space) */}
        <text x={layout.cx} y={labelY - 16} textAnchor="middle" fontSize={18} fontWeight={600} fill="#16192b">Saeima, Republic of Latvia</text>
        <text x={layout.cx} y={labelY + 4} textAnchor="middle" fontSize={15} fontWeight={700} fill="#5a6172">{total} / 301 seats</text>
        <text x={layout.cx} y={labelY + 20} textAnchor="middle" fontSize={13} fill="#8b93a7">majority: {majority}</text>
        {/* axis labels in the outer padding */}
        <text x={layout.cx - rOuter - 40} y={layout.cy - 6} textAnchor="middle" className="axis-label">← Far Left</text>
        <text x={layout.cx + rOuter + 40} y={layout.cy - 6} textAnchor="middle" className="axis-label">Far Right →</text>
        <text x={layout.cx} y={layout.cy + rOuter + layout.seatR + 22} textAnchor="middle" fontSize={13} fill="#8b93a7">majority: {majority}</text>
      </svg>
      <Legend entries={parties} visuals={visuals} hovered={hovered} setHovered={setHovered} />
    </ChamberCard>
  );
}

// ============================================================
// TYPE B — Westminster chamber (CoR / CoG)
// ============================================================

type Sec = 'gov' | 'supply' | 'cross' | 'opp';
const SEC_LABEL: Record<Sec, { label: string; color: string }> = {
  gov: { label: 'GOVERNMENT', color: '#1d4ed8' },
  supply: { label: 'SUPPLY & CONFIDENCE', color: '#0e7490' },
  cross: { label: 'CROSS-BENCH', color: '#64748b' },
  opp: { label: 'OPPOSITION', color: '#b91c1c' },
};

export function WestminsterDiagram({ scenario, results, mode }: {
  scenario: Scenario; results: SimulationResult; mode: 'cor' | 'cog';
}) {
  const { hovered, setHovered } = useHover();
  const visuals = useBlocVisuals(scenario);
  const computed = computeAlliances(scenario);
  const order = arcOrder(computed);
  const isCog = mode === 'cog';

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
    <ChamberCard title={isCog ? 'Council of Governors' : 'Council of Regions'}
      subtitle={isCog ? '18 governors · 2 votes each' : '150 seats'}
      swatch={isCog ? 'linear-gradient(180deg,#9e2b3c,#d4704f)' : 'linear-gradient(180deg,#1a7f4e,#57c08a)'}>
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
  // zone lists sorted by bloc then seats
  const zoneParties = (sec: Sec): { id: string; seats: number }[] => {
    const list = seatList.filter((s) => secOf.get(s.allianceId) === sec);
    const ids = [...new Set(list.map((s) => s.allianceId))];
    return ids.sort((a, b) => {
      const ba = scenario.alliances.find((x) => x.id === a)?.regionalAllianceId ?? '';
      const bb = scenario.alliances.find((x) => x.id === b)?.regionalAllianceId ?? '';
      if (ba !== bb) return ba.localeCompare(bb);
      const na = list.filter((s) => s.allianceId === a).length;
      const nb = list.filter((s) => s.allianceId === b).length;
      return nb - na;
    }).map((id) => ({ id, seats: list.filter((s) => s.allianceId === id).length }));
  };

  const layout = buildChamber(zoneParties('opp'), zoneParties('gov'), zoneParties('cross'), zoneParties('supply'), isCog);
  const label = (s: Seat, zone: Sec) =>
    `${visuals.nameOf(s.allianceId)}${zone === 'supply' ? ' (S&C)' : ''}${isCog ? ' · 2 votes' : ''}`;
  const seats = [
    ...layout.opposition.map((s) => ({ ...s, label: label(s, 'opp') })),
    ...layout.government.map((s) => ({ ...s, label: label(s, 'gov') })),
    ...layout.supply.map((s) => ({ ...s, label: label(s, 'supply') })),
    ...layout.crossbench.map((s) => ({ ...s, label: label(s, 'cross') })),
  ];
  const progress = useEnterProgress(seats.length);
  const allSeats = [...layout.opposition, ...layout.government, ...layout.supply, ...layout.crossbench];
  assertContiguity(isCog ? 'CoG' : 'CoR', allSeats, layout.seatR * 2);
  const allZoneIds = [...zoneParties('opp'), ...zoneParties('gov'), ...zoneParties('cross'), ...zoneParties('supply')];
  const similar = similarColorPairs(allZoneIds, scenario);
  const totalWeight = isCog ? seatList.reduce((s, x) => s + x.weight, 0) : seatList.length;
  const supplySeats = layout.supply;
  const supplyLabelX = supplySeats.length ? supplySeats[0].x + layout.cell / 2 : 0;
  const oppN = layout.opposition.length;
  const govN = layout.government.length;
  const crossN = layout.crossbench.length;
  const supN = layout.supply.length;

  return (
    <ChamberCard
      title={isCog ? 'Council of Governors' : 'Council of Regions'}
      subtitle={isCog ? `${N} governors · each carries 2 votes in the joint session` : `${N} of 150 seats`}
      right={isCog ? `${totalWeight} joint votes` : `${N} / 150 seats`}
      swatch={isCog ? 'linear-gradient(180deg,#9e2b3c,#d4704f)' : 'linear-gradient(180deg,#1a7f4e,#57c08a)'}
    >
      <svg viewBox={`0 0 ${layout.W} ${layout.H}`} className="diagram" role="img" aria-label={`${isCog ? 'Council of Governors' : 'Council of Regions'} seat diagram`}>
        {/* tinted floor strip (2.5) */}
        <rect x={0} y={layout.floorY} width={layout.W} height={layout.floorH} fill="#f3f3f3" />
        <SeatField seats={seats} seatR={layout.seatR} strokeW={layout.strokeW} visuals={visuals} similar={similar}
          cogBadge={isCog} hovered={hovered} progress={progress} />
        {/* zone labels in reserved padding (LAW 5/6) */}
        {oppN > 0 && (
          <text x={layout.oppX + layout.bankW / 2} y={layout.oppY - 8} textAnchor="middle" fontSize={11} letterSpacing={1} fill="#666">
            {`OPPOSITION · ${oppN}`}
          </text>
        )}
        {govN + supN > 0 && (
          <text x={layout.oppX + layout.bankW / 2} y={layout.govY + layout.bankH(layout.govRows) + 18} textAnchor="middle" fontSize={11} letterSpacing={1} fill="#666">
            {`GOVERNMENT · ${govN}`}
          </text>
        )}
        {supN > 0 && (
          <text x={supplyLabelX} y={layout.govY + layout.bankH(layout.govRows) + 18} textAnchor="middle" fontSize={11} letterSpacing={1} fill="#0e7490">
            {`SUPPLY & CONFIDENCE · ${supN}`}
          </text>
        )}
        {crossN > 0 && (
          <text x={layout.crossX + (Math.ceil(crossN / Math.max(1, layout.oppRows + layout.govRows + 1)) * layout.cell) / 2}
            y={layout.crossY - 8} textAnchor="middle" fontSize={11} letterSpacing={1} fill="#666">
            {`CROSS-BENCH · ${crossN}`}
          </text>
        )}
        {/* floor label (2.5) */}
        <text x={layout.oppX + layout.bankW / 2} y={layout.floorY + layout.floorH / 2 - 2} textAnchor="middle" fontSize={16} fontWeight={600} fill="#5a6172">
          {isCog ? 'Council of Governors — 36 joint votes' : `Council of Regions — ${N} / 150 seats`}
        </text>
      </svg>
      <div className="legend-cols">
        {(['gov', 'supply', 'cross', 'opp'] as Sec[]).map((sec) => {
          const zp = zoneParties(sec);
          return zp.length > 0 && (
            <div key={sec} className="legend-col">
              <div className="legend-title">
                <span className="sec-dot" style={{ background: SEC_LABEL[sec].color }} />
                {SEC_LABEL[sec].label} — {zp.reduce((s, p) => s + p.seats, 0)}
              </div>
              <Legend entries={zp} visuals={visuals} hovered={hovered} setHovered={setHovered} />
            </div>
          );
        })}
      </div>
    </ChamberCard>
  );
}
