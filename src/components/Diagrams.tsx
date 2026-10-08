import { useEffect, useRef, useState } from 'react';
import type { Scenario, SimulationResult } from '../types';
import { computeAlliances, positionScore } from '../engine/simulate';
import { buildValley, buildChamber, assignRuns, assertContiguity } from './chamberGeometry';
import type { Slot } from './chamberGeometry';

// ============================================================
// Display order (from the app's ideological ordering)
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
// Shared visuals (spec Part 4)
// ============================================================

interface BlocInfo { colorOf: (allianceId: string) => string; nameOf: (allianceId: string) => string; }

function useBlocInfo(scenario: Scenario): BlocInfo {
  const byId = new Map(scenario.alliances.map((a) => [a.id, a]));
  const blocOf = new Map<string, string>();
  for (const b of scenario.regionalAlliances) for (const a of b.memberAllianceIds) blocOf.set(a, b.color);
  return {
    colorOf: (id) => byId.get(id)?.color ?? '#bbb',
    nameOf: (id) => byId.get(id)?.name ?? '',
  };
}
const blocStroke = (scenario: Scenario) => {
  const map = new Map<string, string>();
  for (const b of scenario.regionalAlliances) for (const a of b.memberAllianceIds) map.set(a, b.color);
  return (id: string) => map.get(id) ?? '#999';
};

function useHover() {
  const [hovered, setHovered] = useState<string | null>(null);
  return { hovered, setHovered };
}

// Entrance animation (600ms, display order; disabled under reduced motion).
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

function Seats({
  seats, seatR, strokeOf, fillOf, cogBadge, hovered, progress,
}: {
  seats: { x: number; y: number; allianceId: string; label: string }[];
  seatR: number; strokeOf: (id: string) => string; fillOf: (id: string) => string;
  cogBadge?: boolean; hovered: string | null; progress: number;
}) {
  const dim = hovered != null;
  return (
    <g>
      {seats.map((s, i) => {
        const visible = i < progress;
        const isDim = dim && s.allianceId !== hovered;
        return (
          <circle key={i} cx={s.x} cy={s.y} r={seatR}
            fill={fillOf(s.allianceId)} stroke={strokeOf(s.allianceId)} strokeWidth={2}
            opacity={visible ? (isDim ? 0.25 : 1) : 0}
            style={{ transition: 'opacity 90ms linear' }}>
            <title>{s.label}</title>
          </circle>
        );
      })}
      {cogBadge && seats.map((s, i) => (
        <text key={'b' + i} x={s.x} y={s.y + 4} textAnchor="middle" fontSize={seatR * 0.6} fill="#fff"
          fontWeight={800} pointerEvents="none"
          opacity={i < progress && !(dim && s.allianceId !== hovered) ? 1 : 0}
          style={{ transition: 'opacity 90ms linear' }}>2×</text>
      ))}
    </g>
  );
}

function Legend({ scenario, entries, hovered, setHovered, sort = true }: {
  scenario: Scenario;
  entries: { id: string; seats: number }[];
  hovered: string | null;
  setHovered: (id: string | null) => void;
  sort?: boolean;
}) {
  const byId = new Map(scenario.alliances.map((a) => [a.id, a]));
  const stroke = blocStroke(scenario);
  const list = sort ? [...entries].sort((a, b) => b.seats - a.seats) : entries;
  return (
    <div className="parliament-legend">
      {list.map(({ id, seats }) => {
        const a = byId.get(id);
        if (!a || seats <= 0) return null;
        return (
          <span key={id} className="legend-item" style={{ opacity: hovered && hovered !== id ? 0.35 : 1 }}
            onMouseEnter={() => setHovered(id)} onMouseLeave={() => setHovered(null)}>
            <span className="legend-dot" style={{ background: a.color, borderColor: stroke(id), borderWidth: 2, borderRadius: '50%' }} />
            {a.name} <strong>{seats}</strong>
          </span>
        );
      })}
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
// TYPE A — Saeima ideological arc valley
// ============================================================

export function SaeimaArc({ scenario }: { scenario: Scenario }) {
  const { hovered, setHovered } = useHover();
  const info = useBlocInfo(scenario);
  const stroke = blocStroke(scenario);
  const computed = computeAlliances(scenario);
  const order = arcOrder(computed);
  const seatsOf = (aid: string) => scenario.parties.filter((p) => p.allianceId === aid).reduce((s, p) => s + p.saeimaSeats, 0);
  const seatAssign: { id: string; seats: number }[] = order
    .map((aid) => ({ id: aid, seats: seatsOf(aid) }))
    .filter((p) => p.seats > 0);
  const total = seatAssign.reduce((s, p) => s + p.seats, 0);
  const enteredTotal = scenario.parties.reduce((s, p) => s + p.saeimaSeats, 0);
  const warning = enteredTotal !== 301 ? `Entered seats: ${enteredTotal}/301 — Saeima must total 301` : null;

  if (total === 0) return (
    <ChamberCard title="Saeima — Republic of Latvia" subtitle="no seats entered"
      swatch="linear-gradient(180deg,#3457d5,#7b96ec)">
      <div className="empty-note">No Saeima seats entered yet.</div>
    </ChamberCard>
  );

  const layout = buildValley(total);
  const runs = assignRuns(layout.slots, seatAssign);
  const headroom = 96;
  const offsetX = layout.W / 2 + layout.cx * -1; // center horizontally
  const seats: { x: number; y: number; allianceId: string; label: string }[] = [];
  const flat: { x: number; y: number; partyId: string }[] = [];
  let seq = 0;
  for (const p of seatAssign) {
    for (const slot of runs.get(p.id) ?? []) {
      seats.push({
        x: offsetX + slot.x, y: headroom + slot.y, allianceId: p.id,
        label: `${info.nameOf(p.id)} — ${p.seats} seats`,
      });
      flat.push({ x: offsetX + slot.x, y: headroom + slot.y, partyId: p.id });
      seq++;
    }
  }
  void seq;
  const progress = useEnterProgress(seats.length);
  assertContiguity('Saeima', flat, layout.seatR * 2);
  const majority = Math.floor(301 / 2) + 1;
  const entries = seatAssign.map((p) => ({ id: p.id, seats: p.seats }));

  return (
    <ChamberCard
      title="Saeima — Republic of Latvia"
      subtitle={`${seatAssign.length} alliances · majority at ${majority}`}
      right={`${total} / 301 seats`}
      swatch="linear-gradient(180deg,#3457d5,#7b96ec)"
      warning={warning}
    >
      <svg viewBox={`0 0 ${layout.W} ${layout.H}`} className="diagram" role="img" aria-label="Saeima seat diagram">
        <Seats seats={seats} seatR={layout.seatR} strokeOf={stroke} fillOf={info.colorOf} hovered={hovered} progress={progress} />
        {/* majority tick at the bottom-center of the band */}
        <line x1={offsetX - 7} y1={headroom + layout.radii[layout.radii.length - 1] + layout.seatR + 5}
          x2={offsetX + 7} y2={headroom + layout.radii[layout.radii.length - 1] + layout.seatR + 5}
          stroke="#c3c9d8" strokeWidth={2} />
        <text x={offsetX} y={headroom + layout.radii[layout.radii.length - 1] + layout.seatR + 20}
          textAnchor="middle" className="svg-sub">majority {majority}</text>
        {/* center label in the valley mouth (above the band) */}
        <text x={offsetX} y={headroom - 44} textAnchor="middle" className="svg-sub" fontSize={12}>Saeima · Republic of Latvia</text>
        <text x={offsetX} y={headroom - 22} textAnchor="middle" fontSize={17} fontWeight={800} fill="#98a0b3">
          {total}<tspan fontSize={11} fill="#b6bcc9"> / 301</tspan>
        </text>
        {/* ideological axis at the arm ends */}
        <text x={offsetX - layout.radii[layout.radii.length - 1] - 40} y={headroom - 6} textAnchor="middle" className="axis-label">← Far Left</text>
        <text x={offsetX + layout.radii[layout.radii.length - 1] + 40} y={headroom - 6} textAnchor="middle" className="axis-label">Far Right →</text>
      </svg>
      <Legend scenario={scenario} entries={entries} hovered={hovered} setHovered={setHovered} />
    </ChamberCard>
  );
}

// ============================================================
// TYPE B — Westminster rectangular chamber (CoR / CoG)
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
  const info = useBlocInfo(scenario);
  const stroke = blocStroke(scenario);
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
  const isCog = mode === 'cog';
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
  const groups: Record<Sec, { allianceId: string; weight: number }[]> = { gov: [], supply: [], cross: [], opp: [] };
  for (const sec of Object.keys(groups) as Sec[]) {
    groups[sec] = seatList.filter((s) => secOf.get(s.allianceId) === sec)
      .sort((a, b) => (blocOrder.get(a.allianceId) ?? 99) - (blocOrder.get(b.allianceId) ?? 99));
  }
  // Display order inside a zone: by regional bloc, then seats (largest first).
  const zoneOrder = (list: { allianceId: string }[]) => {
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

  const oppN = groups.opp.length, govN = groups.gov.length, supN = groups.supply.length, crossN = groups.cross.length;
  const layout = buildChamber(oppN, govN, supN, crossN, isCog);
  const progress = useEnterProgress(N);

  const seats: { x: number; y: number; allianceId: string; label: string }[] = [];
  const flat: { x: number; y: number; partyId: string }[] = [];
  const place = (zoneSlots: Slot[], zoneList: { allianceId: string }[], zone: Sec) => {
    if (zoneList.length === 0) return;
    const ordered = zoneOrder(zoneList);
    const runs = assignRuns(zoneSlots, ordered);
    let i = 0;
    for (const p of ordered) {
      for (const slot of runs.get(p.id) ?? []) {
        seats.push({
          x: slot.x, y: slot.y, allianceId: p.id,
          label: `${info.nameOf(p.id)}${zone === 'supply' ? ' (S&C)' : ''}${isCog ? ' · 2 votes' : ''}`,
        });
        flat.push({ x: slot.x, y: slot.y, partyId: p.id });
        i++;
      }
    }
    void i;
  };
  place(layout.opposition.slots, groups.opp, 'opp');
  place(layout.government.slots, groups.gov, 'gov');
  place(layout.supply.slots, groups.supply, 'supply');
  place(layout.cross.slots, groups.cross, 'cross');
  assertContiguity(isCog ? 'CoG' : 'CoR', flat, layout.seatD);

  const totalWeight = isCog ? seatList.reduce((s, x) => s + x.weight, 0) : seatList.length;
  const secEntries = (sec: Sec) => {
    const ids = [...new Set(groups[sec].map((s) => s.allianceId))];
    return ids.map((id) => ({ id, seats: groups[sec].filter((s) => s.allianceId === id).length }));
  };
  const d = layout.seatD;
  const labelAbove = (x: number, y: number, sec: Sec) => (
    <text x={x} y={y} textAnchor="middle" className="divider-label" fill={SEC_LABEL[sec].color}>
      {`${SEC_LABEL[sec].label} · ${groups[sec].length}`}
    </text>
  );

  return (
    <ChamberCard
      title={isCog ? 'Council of Governors' : 'Council of Regions'}
      subtitle={isCog ? `${N} governors · each carries 2 votes in the joint session` : `${N} of 150 seats`}
      right={isCog ? `${totalWeight} joint votes` : `${N} / 150 seats`}
      swatch={isCog ? 'linear-gradient(180deg,#9e2b3c,#d4704f)' : 'linear-gradient(180deg,#1a7f4e,#57c08a)'}
    >
      <svg viewBox={`0 0 ${layout.W} ${layout.H}`} className="diagram" role="img" aria-label={`${isCog ? 'Council of Governors' : 'Council of Regions'} seat diagram`}>
        <Seats seats={seats} seatR={d / 2 - 1} strokeOf={stroke} fillOf={info.colorOf} cogBadge={isCog} hovered={hovered} progress={progress} />
        {/* zone labels */}
        {oppN > 0 && labelAbove(layout.bankX + layout.bankW / 2, layout.oppY - 6, 'opp')}
        {govN > 0 && labelAbove(layout.bankX + layout.bankW / 2, layout.govY - 6, 'gov')}
        {supN > 0 && (
          <text x={layout.supplyX + 40} y={layout.govY - 6} textAnchor="middle" className="divider-label" fill={SEC_LABEL.supply.color}>
            {`SUPPLY & CONFIDENCE · ${supN}`}
          </text>
        )}
        {crossN > 0 && (
          <text x={layout.crossX + (layout.cross.cols * d) / 2} y={layout.crossY - 6} textAnchor="middle" className="divider-label" fill={SEC_LABEL.cross.color}>
            {`CROSS-BENCH · ${crossN}`}
          </text>
        )}
        {/* floor center label */}
        <text x={layout.bankX + layout.bankW / 2} y={layout.floorY + (layout.govY - layout.floorY) / 2 - 2}
          textAnchor="middle" fontSize={12} className="svg-sub">
          {isCog ? 'Council of Governors' : 'Council of Regions'}
        </text>
        <text x={layout.bankX + layout.bankW / 2} y={layout.floorY + (layout.govY - layout.floorY) / 2 + 16}
          textAnchor="middle" fontSize={15} fontWeight={800} fill="#98a0b3">
          {isCog ? `${totalWeight} joint votes` : `${N} / 150`}
        </text>
      </svg>
      <div className="legend-cols">
        {(['gov', 'supply', 'cross', 'opp'] as Sec[]).map((sec) => (
          groups[sec].length > 0 && (
            <div key={sec} className="legend-col">
              <div className="legend-title">
                <span className="sec-dot" style={{ background: SEC_LABEL[sec].color }} />
                {SEC_LABEL[sec].label} — {groups[sec].length}
              </div>
              <Legend scenario={scenario} entries={secEntries(sec)} hovered={hovered} setHovered={setHovered} />
            </div>
          )
        ))}
      </div>
    </ChamberCard>
  );
}
