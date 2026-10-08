import { useEffect, useMemo, useState } from 'react';
import { useStore, activeIssues } from './store';
import type { DistrictName, Party, Alliance, Position, EUPosition, SaeimaStatus } from './types';
import {
  DISTRICT_ORDER, POSITIONS, EU_POSITIONS, EURO_GROUPS, IDEOLOGIES, DEFAULT_WEIGHTS, defaultDistricts,
} from './data/presets';
import { SaeimaArc, WestminsterDiagram } from './components/Diagrams';
import { euAffiliationWeights, computeAlliances } from './engine/simulate';
import { BUILTIN_TEMPLATES } from './data/builtinTemplates';
import { runCalibration } from './engine/calibration';

type Tab = 'scenarios' | 'parties' | 'alliances' | 'blocs' | 'districts' | 'overrides' | 'weights' | 'results';

export default function App() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>('scenarios');
  useEffect(() => { store.load(); }, []);
  const scenario = store.active();
  const issues = useMemo(() => activeIssues(scenario), [scenario]);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warn');

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">🇱🇻</div>
          <div>
            <h1>Latvia PolSim</h1>
            <span className="subtitle">Council of Regions &amp; Council of Governors — Election Simulator</span>
          </div>
        </div>
        <nav className="tabs">
          {(['scenarios', 'parties', 'alliances', 'blocs', 'districts', 'overrides', 'weights', 'results'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </header>
      {(errors.length > 0 || warnings.length > 0) && (
        <div className="issues">
          {errors.map((e, i) => <div key={'e' + i} className="issue error">⛔ {e.message}</div>)}
          {warnings.map((w, i) => <div key={'w' + i} className="issue warn">⚠️ {w.message}</div>)}
        </div>
      )}
      <main>
        {!scenario && tab !== 'scenarios'
          ? <div className="empty-note">Create or select a scenario first.</div>
          : <>
            {tab === 'scenarios' && <ScenariosTab />}
            {scenario && tab === 'parties' && <PartiesTab />}
            {scenario && tab === 'alliances' && <AlliancesTab />}
            {scenario && tab === 'blocs' && <BlocsTab />}
            {tab === 'districts' && <DistrictsTab />}
            {scenario && tab === 'overrides' && <OverridesTab />}
            {scenario && tab === 'weights' && <WeightsTab />}
            {scenario && tab === 'results' && <ResultsTab />}
          </>}
      </main>
    </div>
  );
}

// ---------- Scenarios ----------
function ScenariosTab() {
  const store = useStore();
  const [name, setName] = useState('New Scenario');
  const [importMsg, setImportMsg] = useState('');
  const scenarios = useStore((s) => s.scenarios);
  const templates = useStore((s) => s.templates);
  const activeId = useStore((s) => s.activeId);
  return (
    <div className="panel">
      <div className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Scenario name" />
        <button onClick={() => { store.newScenario(name || 'Untitled'); }}>+ New Scenario</button>
        <button onClick={() => store.duplicateActive()} disabled={!activeId}>Copy Active</button>
        <button onClick={() => store.saveAsTemplate()} disabled={!activeId}>Save as Template</button>
        <label className="file-btn">
          Import JSON <input type="file" accept=".json" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            const ok = store.importScenario(await f.text());
            setImportMsg(ok ? 'Imported.' : 'Invalid file.');
          }} />
        </label>
      </div>
      {importMsg && <div className="msg">{importMsg}</div>}
      <h3>Scenarios</h3>
      <ul className="entity-list">
        {scenarios.map((s) => (
          <li key={s.id} className={s.id === activeId ? 'active' : ''}>
            <button onClick={() => store.setActive(s.id)}><strong>{s.name}</strong></button>
            <span className="meta">{s.parties.length} parties · {s.alliances.length} alliances{s.results ? ' · has results' : ''}</span>
            <button className="danger" onClick={() => store.deleteScenario(s.id)}>Delete</button>
            <button onClick={() => {
              const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = s.name.replace(/\s+/g, '_') + '.json';
              a.click();
            }}>Export</button>
          </li>
        ))}
      </ul>
      <h3>Built-in Templates</h3>
      <ul className="entity-list">
        {BUILTIN_TEMPLATES.map((t) => (
          <li key={t.label}>
            <span><strong>{t.label}</strong></span>
            <button className="primary" onClick={() => store.loadBuiltinTemplate(t.label)}>Load as new scenario</button>
          </li>
        ))}
      </ul>
      <hr className="section-divider" />
      <h3>Your Templates</h3>
      <ul className="entity-list">
        {templates.length === 0 && <li className="meta">No templates saved yet.</li>}
        {templates.map((t) => (
          <li key={t.id}>
            <span><strong>{t.name}</strong></span>
            <button onClick={() => store.loadTemplate(t.id)}>Load</button>
            <button className="danger" onClick={() => store.deleteTemplate(t.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Parties ----------
function PartiesTab() {
  const store = useStore();
  const scenario = store.active()!;
  const [form, setForm] = useState<Partial<Party>>({
    name: '', ideology: IDEOLOGIES[0], secondaryIdeologies: [], positions: ['Center'],
    dominantPosition: 'Center', euPosition: 'Pro-EU', euroGroup: 'NI', saeimaSeats: 0,
    homeDistricts: [], homeConcentration: 1, runningDistricts: [], allianceId: '', color: '#8899aa',
  });
  const [editId, setEditId] = useState<string | null>(null);
  const set = (patch: Partial<Party>) => setForm((f) => ({ ...f, ...patch }));
  const toggleIn = <T,>(arr: T[], v: T): T[] => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  const valid = form.name && form.allianceId && scenario.alliances.some((a) => a.id === form.allianceId);
  const startEdit = (p: Party) => {
    setEditId(p.id);
    setForm({ ...p });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const submit = () => {
    if (editId) {
      store.updateParty(editId, form as any);
      setEditId(null);
    } else {
      store.addParty(form as any);
    }
    setForm({ name: '', ideology: IDEOLOGIES[0], secondaryIdeologies: [], positions: ['Center'],
      dominantPosition: 'Center', euPosition: 'Pro-EU', euroGroup: 'NI', saeimaSeats: 0,
      homeDistricts: [], homeConcentration: 1, runningDistricts: [], allianceId: form.allianceId, color: '#8899aa' });
  };
  return (
    <div className="panel">
      <h3>{editId ? '✏️ Edit Party' : '➕ Add Party'}</h3>
      <div className="form-grid">
        <label>Name <input value={form.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label>Dominant ideology <select value={form.ideology} onChange={(e) => set({ ideology: e.target.value })}>
          {IDEOLOGIES.map((i) => <option key={i}>{i}</option>)}
        </select></label>
        <label>Secondary ideologies (max 3)
          <div className="chips">
            {IDEOLOGIES.filter((i) => i !== form.ideology).map((i) => (
              <button type="button" key={i} className={form.secondaryIdeologies?.includes(i) ? 'chip on' : 'chip'}
                onClick={() => set({ secondaryIdeologies: toggleIn(form.secondaryIdeologies!, i).slice(0, 3) })}>{i}</button>
            ))}
          </div>
        </label>
        <label>Positions (pick 1–2, one dominant)
          <div className="chips">
            {POSITIONS.map((p) => (
              <button type="button" key={p} className={form.positions?.includes(p) ? 'chip on' : 'chip'}
                onClick={() => {
                  const pos = toggleIn(form.positions!, p as Position);
                  set({
                    positions: pos,
                    dominantPosition: (pos.includes(form.dominantPosition as Position) ? form.dominantPosition : pos[pos.length - 1]) as Position,
                  });
                }}>{p}</button>
            ))}
          </div>
        </label>
        <label>Dominant position <select value={form.dominantPosition} onChange={(e) => set({ dominantPosition: e.target.value as Position })}>
          {(form.positions ?? []).map((p) => <option key={p}>{p}</option>)}
        </select></label>
        <label>EU position <select value={form.euPosition} onChange={(e) => set({ euPosition: e.target.value as EUPosition })}>
          {EU_POSITIONS.map((p) => <option key={p}>{p}</option>)}
        </select></label>
        <label>Euro affiliation <select value={form.euroGroup} onChange={(e) => set({ euroGroup: e.target.value as any })}>
          {EURO_GROUPS.map((g) => <option key={g}>{g}</option>)}
        </select></label>
        <label>Saeima seats <input type="number" min={0} max={301} value={form.saeimaSeats}
          onChange={(e) => set({ saeimaSeats: +e.target.value })} /></label>
        <label>Parent alliance <select value={form.allianceId} onChange={(e) => set({ allianceId: e.target.value })}>
          <option value="">— choose —</option>
          {scenario.alliances.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>
        <label>Color <input type="color" value={form.color} onChange={(e) => set({ color: e.target.value })} /></label>
        <label>🏠 Home districts (bonus here, small penalty elsewhere; none = runs evenly everywhere)
          <div className="chips">
            {DISTRICT_ORDER.map((d) => (
              <button type="button" key={d} className={form.homeDistricts?.includes(d) ? 'chip on' : 'chip'}
                onClick={() => set({ homeDistricts: toggleIn(form.homeDistricts!, d as DistrictName) })}>{d}</button>
            ))}
          </div>
        </label>
        <label>🎯 Home concentration: {form.homeConcentration ?? 1}×
          <input type="range" min="0.5" max="2" step="0.1" value={form.homeConcentration ?? 1}
            onChange={(e) => set({ homeConcentration: +e.target.value })} />
          <span className="hint">1 = normal regional base; above 1 = regionalist list (dominates its home districts); below 1 = spread out</span>
        </label>
        <label>🏃 Running districts (empty = runs wherever its alliance runs)
          <div className="chips">
            <button type="button" className={form.runningDistricts?.length ? 'chip' : 'chip on'}
              onClick={() => set({ runningDistricts: [] })}>Everywhere (follow alliance)</button>
            {DISTRICT_ORDER.map((d) => (
              <button type="button" key={d} className={form.runningDistricts?.includes(d) ? 'chip on' : 'chip'}
                onClick={() => set({ runningDistricts: toggleIn(form.runningDistricts!, d as DistrictName) })}>{d}</button>
            ))}
          </div>
        </label>
      </div>
      <div className="row">
        <button className="primary" disabled={!valid} onClick={submit}>{editId ? 'Save Changes' : 'Add Party'}</button>
        {editId && <button onClick={() => { setEditId(null); setForm({ name: '' }); }}>Cancel</button>}
      </div>
      {!valid && <span className="hint">Name and a parent alliance are required. Create an alliance first if none exist.</span>}

      <h3>Parties ({scenario.parties.length})</h3>
      <table className="table">
        <thead><tr><th></th><th>Name</th><th>Ideology</th><th>Position</th><th>EU</th><th>Euro</th><th>Saeima</th><th>Home</th><th>Alliance</th><th></th></tr></thead>
        <tbody>
          {scenario.parties.map((p) => (
            <tr key={p.id} className={editId === p.id ? 'overridden-row' : ''}>
              <td><span className="color-dot" style={{ background: p.color }} /></td>
              <td>{p.name}</td>
              <td>{p.ideology}{p.secondaryIdeologies.length ? ` + ${p.secondaryIdeologies.join(', ')}` : ''}</td>
              <td>{p.positions.join(' / ')} <em>({p.dominantPosition})</em></td>
              <td>{p.euPosition}</td>
              <td>{p.euroGroup}</td>
              <td><input type="number" value={p.saeimaSeats} onChange={(e) => store.updateParty(p.id, { saeimaSeats: +e.target.value })} /></td>
              <td className="small-text">{p.homeDistricts.length ? p.homeDistricts.length + ' dist.' : '—'}</td>
              <td><select value={p.allianceId} onChange={(e) => store.updateParty(p.id, { allianceId: e.target.value })}>
                {scenario.alliances.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></td>
              <td className="row-actions">
                <button onClick={() => startEdit(p)}>✏️</button>
                <button className="danger" onClick={() => store.removeParty(p.id)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
// ---------- Alliances ----------
function AlliancesTab() {
  const store = useStore();
  const scenario = store.active()!;
  const computed = useMemo(() => computeAlliances(scenario), [scenario]);
  const [form, setForm] = useState<Partial<Alliance>>({ name: '', color: '#3b82f6' });
  const districtsUnion = (aid: string) => {
    const a = scenario.alliances.find((x) => x.id === aid);
    if (!a) return [];
    const homes = new Set<string>();
    for (const pid of a.memberPartyIds) {
      const p = scenario.parties.find((x) => x.id === pid);
      if (p) for (const d of p.homeDistricts) homes.add(d);
    }
    return [...homes];
  };
  return (
    <div className="panel">
      <h3>Add Alliance</h3>
      <div className="row">
        <input placeholder="Alliance name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        <button disabled={!form.name} onClick={() => {
          store.addAlliance({
            name: form.name!, color: form.color!, memberPartyIds: [], autoIdeology: true, autoPosition: true,
            autoEuPosition: true, runningDistricts: [], saeimaStatus: 'Opposition', regionalAllianceId: null,
          } as any);
          setForm({ name: '', color: '#3b82f6' });
        }}>Add</button>
      </div>
      <h3>Alliances ({scenario.alliances.length})</h3>
      {scenario.alliances.map((a) => {
        const c = computed.find((x) => x.id === a.id);
        const euAff = euAffiliationWeights(scenario, a.id);
        return (
          <div key={a.id} className="card">
            <div className="row">
              <input type="color" value={a.color} onChange={(e) => store.updateAlliance(a.id, { color: e.target.value })} />
              <strong>{a.name}</strong>
              <button className="danger" onClick={() => store.removeAlliance(a.id)}>Delete</button>
            </div>
            <div className="form-grid">
              <label>Saeima status <select value={a.saeimaStatus} onChange={(e) => store.updateAlliance(a.id, { saeimaStatus: e.target.value as SaeimaStatus })}>
                {(['Government', 'Opposition', 'Cross-bench', 'Supply and Confidence'] as SaeimaStatus[]).map((s) => <option key={s}>{s}</option>)}
              </select></label>
              <label>Regional alliance <select value={a.regionalAllianceId ?? ''} onChange={(e) => store.updateAlliance(a.id, { regionalAllianceId: e.target.value || null })}>
                <option value="">Runs alone</option>
                {scenario.regionalAlliances.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></label>
              <label>Member parties <div className="chips">
                {scenario.parties.map((p) => (
                  <button key={p.id} className={a.memberPartyIds.includes(p.id) ? 'chip on' : 'chip'}
                    onClick={() => {
                      const ids = a.memberPartyIds.includes(p.id)
                        ? a.memberPartyIds.filter((x) => x !== p.id)
                        : [...a.memberPartyIds, p.id];
                      if (ids.includes(p.id) && scenario.alliances.some((o) => o.id !== a.id && o.memberPartyIds.includes(p.id))) {
                        alert(`"${p.name}" already belongs to another alliance.`);
                        return;
                      }
                      store.updateAlliance(a.id, { memberPartyIds: ids });
                      if (ids.includes(p.id)) store.updateParty(p.id, { allianceId: a.id });
                    }}>{p.name}</button>
                ))}
              </div></label>
              <label>Running districts <div className="chips">
                {DISTRICT_ORDER.map((d) => (
                  <button key={d} className={a.runningDistricts.includes(d) ? 'chip on' : 'chip'}
                    onClick={() => store.updateAlliance(a.id, {
                      runningDistricts: a.runningDistricts.includes(d)
                        ? a.runningDistricts.filter((x) => x !== d)
                        : [...a.runningDistricts, d as DistrictName],
                    })}>{d}</button>
                ))}
              </div>
              <button onClick={() => store.updateAlliance(a.id, { runningDistricts: districtsUnion(a.id) as any })}>
                Default: union of member home districts
              </button></label>
            </div>
            <div className="derived">
              {c && <>
                <span>Ideology (auto): <strong>{c.ideology}</strong>{c.secondaryIdeologies.length ? ` + ${c.secondaryIdeologies.join(', ')}` : ''}</span>
                <span>Position (auto): <strong>{c.positions.join(' / ')}</strong> (dominant {c.dominantPosition})</span>
                <span>EU (auto): <strong>{c.euPosition}</strong></span>
                <span>Euro affiliations: {Object.entries(euAff).map(([g, w]) => `${g} ${w.toFixed(2)}`).join(', ') || '—'}</span>
                <span>Implied national vote share: <strong>{(c.nationalShare * 100).toFixed(2)}%</strong></span>
              </>}
              <div className="manual-block">
                <label className="inline">
                  <input type="checkbox" checked={!a.autoIdeology} onChange={(e) => store.updateAlliance(a.id, { autoIdeology: !e.target.checked })} /> Manual ideology
                </label>
                {!a.autoIdeology && (
                  <div className="chips">
                    {IDEOLOGIES.map((i) => (
                      <button type="button" key={i}
                        className={(a.overrideIdeology === i || (a.overrideSecondaryIdeologies ?? []).includes(i)) ? 'chip on' : 'chip'}
                        onClick={() => {
                          const sec = a.overrideSecondaryIdeologies ?? [];
                          if (a.overrideIdeology === i) {
                            store.updateAlliance(a.id, { overrideIdeology: undefined });
                          } else if (sec.includes(i)) {
                            store.updateAlliance(a.id, { overrideSecondaryIdeologies: sec.filter((x) => x !== i) });
                          } else if (!a.overrideIdeology) {
                            store.updateAlliance(a.id, { overrideIdeology: i });
                          } else {
                            store.updateAlliance(a.id, { overrideSecondaryIdeologies: [...sec, i].slice(0, 3) });
                          }
                        }}>{i}{a.overrideIdeology === i ? ' ★' : ''}</button>
                    ))}
                  </div>
                )}
                <label className="inline">
                  <input type="checkbox" checked={!a.autoPosition} onChange={(e) => store.updateAlliance(a.id, { autoPosition: !e.target.checked, autoEuPosition: !e.target.checked })} /> Manual position &amp; EU
                </label>
                {!a.autoPosition && (
                  <div className="chips">
                    {POSITIONS.map((p) => (
                      <button type="button" key={p}
                        className={(a.overridePositions ?? []).includes(p) ? 'chip on' : 'chip'}
                        onClick={() => {
                          const pos = (a.overridePositions ?? []).includes(p)
                            ? (a.overridePositions ?? []).filter((x) => x !== p)
                            : [...(a.overridePositions ?? []), p];
                          const dom = (a.overrideDominantPosition && pos.includes(a.overrideDominantPosition as Position))
                            ? a.overrideDominantPosition
                            : pos[pos.length - 1] ?? 'Center';
                          store.updateAlliance(a.id, { overridePositions: pos as Position[], overrideDominantPosition: dom as Position });
                        }}>{p}{a.overrideDominantPosition === p ? ' ★' : ''}</button>
                    ))}
                    <select value={a.overrideDominantPosition} onChange={(e) => store.updateAlliance(a.id, { overrideDominantPosition: e.target.value as Position })}>
                      {(a.overridePositions ?? []).map((p) => <option key={p}>{p}</option>)}
                    </select>
                    <select value={a.overrideEuPosition} onChange={(e) => store.updateAlliance(a.id, { overrideEuPosition: e.target.value as EUPosition })}>
                      {EU_POSITIONS.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Blocs ----------
function BlocsTab() {
  const store = useStore();
  const scenario = store.active()!;
  const [name, setName] = useState('');
  const [color, setColor] = useState('#f59e0b');
  return (
    <div className="panel">
      <h3>Regional Alliances (Blocs)</h3>
      <div className="row">
        <input placeholder="Bloc name" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <button disabled={!name} onClick={() => {
          store.addRegionalAlliance({ name, color, memberAllianceIds: [] });
          setName('');
        }}>Add Bloc</button>
      </div>
      {scenario.regionalAlliances.map((b) => (
        <div key={b.id} className="card">
          <div className="row">
            <input type="color" value={b.color} onChange={(e) => store.updateRegionalAlliance(b.id, { color: e.target.value })} />
            <strong>{b.name}</strong>
            <button className="danger" onClick={() => store.removeRegionalAlliance(b.id)}>Delete</button>
          </div>
          <label>Member alliances <div className="chips">
            {scenario.alliances.map((a) => {
              const inOther = scenario.regionalAlliances.some((o) => o.id !== b.id && o.memberAllianceIds.includes(a.id));
              return (
                <button key={a.id} disabled={inOther} title={inOther ? 'Already in another bloc' : ''}
                  className={b.memberAllianceIds.includes(a.id) ? 'chip on' : 'chip'}
                  onClick={() => store.updateRegionalAlliance(b.id, {
                    memberAllianceIds: b.memberAllianceIds.includes(a.id)
                      ? b.memberAllianceIds.filter((x) => x !== a.id)
                      : [...b.memberAllianceIds, a.id],
                  })}>{a.name}</button>
              );
            })}
          </div></label>
        </div>
      ))}
    </div>
  );
}

// ---------- Districts ----------
const TRAIT_LABELS: Record<string, string> = {
  population: 'Population (M)', urbanization: 'Urbanization', income: 'Income', education: 'Education',
  elderly: 'Elderly share', religiosity: 'Religiosity', agrarian: 'Agrarian economy', heavyIndustry: 'Heavy industry',
  services: 'Services/tech', coastal: 'Coastal-maritime', transit: 'Transit-corridor', minority: 'Minority-language share',
  latgalianIdentity: 'Latgalian identity', euEnthusiasm: 'EU enthusiasm',
};

function DistrictsTab() {
  const store = useStore();
  const scenario = store.active();
  const [edited, setEdited] = useState(() => defaultDistricts());
  const setTrait = (name: string, key: string, v: number) =>
    setEdited((ds) => ds.map((d) => d.name === name ? { ...d, traits: { ...d.traits, [key]: v } } : d));
  return (
    <div className="panel">
      <h3>District Profiles (presets, editable)</h3>
      {edited.map((d) => (
        <details key={d.name} className="district-details">
          <summary>
            <strong>{d.name}</strong> — {d.corSeats} CoR seats{d.electsGovernor ? ', elects governor' : ', NO governor'}
            {scenario && <>
              {' · '}Incumbent governor:
              <select value={scenario.incumbentGovernors[d.name] ?? ''} onClick={(e) => e.stopPropagation()}
                onChange={(e) => store.updateActive((s) => { s.incumbentGovernors[d.name] = e.target.value || undefined; })}>
                <option value="">— none —</option>
                {scenario.alliances.filter((a) => a.runningDistricts.includes(d.name)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </>}
          </summary>
          <div className="trait-grid">
            {Object.entries(TRAIT_LABELS).map(([k, label]) => (
              <label key={k}>{label}
                <input type="number" step="0.1" value={(d.traits as any)[k]}
                  onChange={(e) => setTrait(d.name, k, +e.target.value)} />
              </label>
            ))}
            <label>Political lean (−3 … +3)
              <input type="number" step="0.1" value={d.traits.lean} onChange={(e) => setTrait(d.name, 'lean', +e.target.value)} />
            </label>
          </div>
        </details>
      ))}
      <p className="hint">District traits are preset values; edits here apply to in-session runs (persisted via scenario export).
      The political lean used in each run is dynamic: the preset lean is blended toward the national
      implied lean (derived from the parties' Saeima seats) with strength "Dynamic lean: national-results pull"
      in the Weights panel (0 = fully static preset lean, 1 = fully national).</p>
    </div>
  );
}

// ---------- Overrides ----------
function OverridesTab() {
  const store = useStore();
  const scenario = store.active()!;
  const [district, setDistrict] = useState<DistrictName>(DISTRICT_ORDER[0]);
  const ovr = scenario.overrides.find((o) => o.district === district);
  const running = scenario.alliances.filter((a) => a.runningDistricts.includes(district));
  return (
    <div className="panel">
      <h3>Manual Vote-Share Overrides</h3>
      <div className="row">
        <select value={district} onChange={(e) => setDistrict(e.target.value as DistrictName)}>
          {DISTRICT_ORDER.map((d) => <option key={d}>{d}</option>)}
        </select>
        {ovr && <button className="danger" onClick={() => store.clearOverride(district)}>Clear override</button>}
      </div>
      <p className="hint">Enter locked shares (percent). The simulator distributes the remaining share among unlocked alliances. Locked alliances are marked in outputs.</p>
      <table className="table">
        <thead><tr><th>Alliance</th><th>Locked share %</th></tr></thead>
        <tbody>
          {running.map((a) => {
            const val = ovr?.shares[a.id] != null ? (ovr.shares[a.id] * 100).toFixed(1) : '';
            return (
              <tr key={a.id}>
                <td><span className="color-dot" style={{ background: a.color }} /> {a.name}</td>
                <td className={val !== '' ? 'overridden' : ''}>
                  <input type="number" step="0.1" min={0} max={100} value={val}
                    onChange={(e) => {
                      const shares = { ...(ovr?.shares ?? {}) };
                      if (e.target.value === '') delete shares[a.id];
                      else shares[a.id] = Math.min(100, +e.target.value) / 100;
                      store.setOverride(district, shares);
                    }} />
                </td>
              </tr>
            );
          })}
          {running.length === 0 && <tr><td colSpan={2}>No alliances run in this district.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Weights ----------
function WeightsTab() {
  const store = useStore();
  const scenario = store.active()!;
  const w = scenario.weights;
  const [seed, setSeed] = useState(scenario.seed);
  const fields: [keyof typeof w, string][] = [
    ['ideologyMin', 'Ideology fit — min multiplier'],
    ['ideologyMax', 'Ideology fit — max multiplier'],
    ['positionMin', 'Position fit — min multiplier'],
    ['positionMax', 'Position fit — max multiplier'],
    ['euMin', 'EU effect — min multiplier'],
    ['euMax', 'EU effect — max multiplier'],
    ['homeBonus', 'Home-region bonus'],
    ['incumbentBonus', 'Governor incumbency bonus'],
    ['noiseSigma', 'Campaign noise σ (log-normal)'],
    ['crossEndorsementProb', 'Bloc cross-endorsement probability'],
    ['dominantIdeologyWeight', 'Dominant ideology weight'],
    ['secondaryIdeologyWeight', 'Secondary ideology weight'],
    ['secondaryPositionWeight', 'Secondary position weight'],
    ['seatCurveAlpha', 'Seats→votes curve tilt (alpha)'],
    ['euProHigh', 'Pro-EU: high-enthusiasm boost'],
    ['euProLow', 'Pro-EU: low-enthusiasm penalty'],
    ['euHardAntiHigh', 'Hard anti-EU: high-enthusiasm penalty'],
    ['euHardAntiLow', 'Hard anti-EU: low-enthusiasm boost'],
    ['euSoftFactor', 'Soft anti-EU strength (0–1)'],
    ['ballotsPerDistrict', 'Simulated ballots per district'],
    ['govRunoffNoise', 'Governor runoff noise σ'],
    ['leanNationalPull', 'Dynamic lean: national-results pull (0–1)'],
  ];
  return (
    <div className="panel">
      <h3>Calculation Weights</h3>
      <div className="row">
        <label>Seed <input type="number" value={seed} onChange={(e) => { setSeed(+e.target.value); store.updateActive((s) => { s.seed = +e.target.value; }); }} /></label>
        <button onClick={() => store.setWeights({ ...DEFAULT_WEIGHTS })}>Reset to Defaults</button>
      </div>
      <div className="form-grid">
        {fields.map(([k, label]) => (
          <label key={k}>{label}
            <input type="number" step="0.01" value={w[k] as number}
              onChange={(e) => store.setWeights({ ...w, [k]: +e.target.value })} />
          </label>
        ))}
      </div>
      <div className="doc-box">
        <h4>Seats → implied vote share (documented)</h4>
        <p>v = s × (0.85 + 0.30·e^(−3s) + 0.5·alpha·(1−s)), where s = Saeima seats / 301.</p>
        <p>Small parties get a factor above 1 (vote share slightly above seat share); large parties below 1. The alpha term is a user-tunable tilt.</p>
      </div>
    </div>
  );
}

// ---------- Results ----------
function ResultsTab() {
  const store = useStore();
  const scenario = store.active()!;
  const res = scenario.results;
  const [bts, setBts] = useState(false);
  const districts = defaultDistricts();
  const allianceById = new Map(scenario.alliances.map((a) => [a.id, a.name]));
  const colorById = new Map(scenario.alliances.map((a) => [a.id, a.color]));
  const blocOf = new Map<string, string>();
  for (const b of scenario.regionalAlliances) for (const a of b.memberAllianceIds) blocOf.set(a, b.name);

  const exportCsv = () => {
    const rows: string[] = ['type,district,alliance,bloc,generated_share,final_votes,seats'];
    for (const d of districts) {
      const dr = res!.districtResults[d.name];
      for (const [aid, log] of Object.entries(dr.shares) as [string, any][]) {
        rows.push(`cor,${d.name},${allianceById.get(aid) ?? aid},${blocOf.get(aid) ?? ''},${(log.finalShare * 100).toFixed(2)},${log.votes},${dr.elected.filter((e) => e.allianceId === aid).length}`);
      }
      if (dr.governor?.winner) rows.push(`governor,${d.name},${allianceById.get(dr.governor.winner) ?? dr.governor.winner},${blocOf.get(dr.governor.winner) ?? ''},${(dr.governor.stage1Shares[dr.governor.winner] * 100).toFixed(2)},,1`);
    }
    for (const [aid, n] of Object.entries(res!.councilorTotals)) {
      rows.push(`summary,national,${allianceById.get(aid) ?? aid},${blocOf.get(aid) ?? ''},,,${n}`);
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'results.csv';
    a.click();
  };

  if (!res) {
    return (
      <div className="panel">
        <h3>Results</h3>
        <p>No simulation yet.</p>
        <button className="primary" onClick={() => store.simulate()} disabled={scenario.alliances.length === 0}>▶ Run Simulation</button>
      </div>
    );
  }
  const totalSeats = Object.values(res.councilorTotals).reduce((s, x) => s + x, 0);
  const totalGovs = Object.keys(res.governors).length;
  const totalWeight = Object.values(res.jointSessionWeights).reduce((s, x) => s + x, 0);
  return (
    <div className="panel">
      <div className="row">
        <button className="primary" onClick={() => store.simulate()}>▶ Re-run Simulation</button>
        <button onClick={exportCsv}>⬇ Export CSV</button>
        <label className="inline"><input type="checkbox" checked={bts} onChange={(e) => setBts(e.target.checked)} /> Behind-the-scenes view</label>
        <span className="meta">Seed: {res.seed} · Councilors: {totalSeats}/150 · Governors: {totalGovs}/18 · Joint-session votes: {totalWeight}</span>
      </div>
      <h3>Saeima — 301 seats</h3>
      <SaeimaArc scenario={scenario} />

      <h3>Council of Regions — 150 seats (outline = bloc color)</h3>
      <WestminsterDiagram scenario={scenario} results={res} mode="cor" />

      <h3>Council of Governors — 18 governors (2× joint-session votes each)</h3>
      <WestminsterDiagram scenario={scenario} results={res} mode="cog" />

      <h3>District Results</h3>
      <table className="table">
        <thead><tr>
          <th>District</th><th>Governor</th><th>Governor stage</th>
          <th>Vote share (top alliances)</th><th>Councilors won</th>
        </tr></thead>
        <tbody>
          {districts.map((d) => {
            const dr = res.districtResults[d.name as DistrictName];
            const g = dr.governor;
            const seatsBy: Record<string, number> = {};
            for (const e of dr.elected) seatsBy[e.allianceId] = (seatsBy[e.allianceId] ?? 0) + 1;
            const topShares = Object.entries(dr.shares)
              .sort((a: any, b: any) => b[1].finalShare - a[1].finalShare).slice(0, 7);
            const winnerSeats = Object.entries(seatsBy).sort((a: any, b: any) => b[1] - a[1])[0];
            return (
              <tr key={d.name} className={dr.overridden ? 'overridden-row' : ''}>
                <td><strong>{d.name}</strong>
                  <div className="subtle">{d.corSeats} seats{d.electsGovernor ? '' : ' · no governor'}</div>
                  {dr.overridden && <span className="badge">override</span>}</td>
                <td>{!g ? <em>—</em> : <>
                  <span className="color-dot" style={{ background: colorById.get(g.winner!) }} />
                  <strong>{allianceById.get(g.winner!)}</strong>
                  <div className="subtle">{blocOf.get(g.winner!) ?? 'no bloc'}</div>
                </>}</td>
                <td>{!g ? <em>no governor</em> : g.wonInStage1
                  ? <span className="ok-text">Stage 1 win ({(g.stage1Shares[g.winner!] * 100).toFixed(1)}%)</span>
                  : <span>Runoff: {allianceById.get(g.runoff!.a)} {(g.runoff!.shares[g.runoff!.a] * 100).toFixed(1)}% – {(g.runoff!.shares[g.runoff!.b] * 100).toFixed(1)}% {allianceById.get(g.runoff!.b)}</span>}</td>
                <td>
                  <div className="share-bar">
                    {Object.entries(dr.shares).sort((a: any, b: any) => b[1].finalShare - a[1].finalShare).map(([aid, log]: any) => (
                      <div key={aid} className="share-seg" title={`${allianceById.get(aid)}: ${(log.finalShare * 100).toFixed(1)}%`}
                        style={{ width: `${log.finalShare * 100}%`, background: colorById.get(aid) ?? '#999' }} />
                    ))}
                  </div>
                  <div className="share-labels">
                    {topShares.map(([aid, log]: any) => (
                      <span key={aid} className="seat-chip">
                        <span className="color-dot" style={{ background: colorById.get(aid) }} />
                        {allianceById.get(aid)} {(log.finalShare * 100).toFixed(1)}%
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  {winnerSeats && <div><strong style={{ color: colorById.get(winnerSeats[0]) }}>
                    {allianceById.get(winnerSeats[0])} {winnerSeats[1]}/{d.corSeats}
                  </strong></div>}
                  <div className="seat-labels">
                    {Object.entries(seatsBy).sort((a: any, b: any) => b[1] - a[1]).map(([aid, n]) => (
                      <span key={aid} className="seat-chip">
                        <span className="color-dot" style={{ background: colorById.get(aid) }} />{allianceById.get(aid)} <strong>{n}</strong>
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {bts && <BehindTheScenes res={res} allianceById={allianceById} colorById={colorById} />}
      {bts && <CalibrationPanel />}
    </div>
  );
}

function CalibrationPanel() {
  const [report, setReport] = useState<any>(null);
  return (
    <div className="bts">
      <h3>Calibration Report (six historical elections)</h3>
      <button className="primary" onClick={() => setReport(runCalibration())}>Run calibration</button>
      {report && (
        <div>
          <p>Mean governor accuracy: <strong>{report.meanGovernorAccuracy.toFixed(2)}/18</strong> ·
             Mean share correlation: <strong>{report.meanShareCorrelation.toFixed(3)}</strong> (target ≥ 0.85)</p>
          {report.elections.map((e: any) => (
            <div key={e.label} className="cal-election">
              <h4>{e.label}</h4>
              <p>Governing: {e.governing.join(', ')}</p>
              <p>Governor accuracy: <strong>{e.governorAccuracy}/{e.governorTotal}</strong> ·
                 Share correlation: {e.shareCorrelation.toFixed(3)} ·
                 Strongholds held/flipped: {e.strongholdsHeld}/{e.strongholdsFlipped}</p>
              <p>Most concentrated: {e.concentration.map((c: any) => `${c.alliance} (${c.peakDistrict}, ×${c.ratio.toFixed(1)})`).join(' · ')}</p>
              {e.flags.map((f: string) => <p key={f} className="meta">⚠ {f}</p>)}
            </div>
          ))}
          <h4>Anti-homogenization check</h4>
          {report.antiHomogenization.map((a: any) => (
            <p key={a.district} className="meta">{a.district}: correlation {a.correlation.toFixed(3)}{a.tooUniform ? ' — TOO UNIFORM (identity too weak)' : ''}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function BehindTheScenes({ res, allianceById, colorById }: any) {
  const [district, setDistrict] = useState<DistrictName>(DISTRICT_ORDER[0]);
  const dr = (res.districtResults as any)[district];
  if (!dr) return null;
  return (
    <div className="bts">
      <h3>Behind the Scenes</h3>
      <select value={district} onChange={(e) => setDistrict(e.target.value as DistrictName)}>
        {DISTRICT_ORDER.map((d) => <option key={d}>{d}</option>)}
      </select>
      <p>Droop quota: <strong>{dr.quota}</strong> · Ballots: {dr.turnoutBallots.toLocaleString()} · Seed: {res.seed}</p>
      <h4>Generated shares (with modifiers)</h4>
      <table className="table small">
        <thead><tr><th>Alliance</th><th>Base</th><th>Ideology</th><th>Position</th><th>EU</th><th>Home</th><th>Incumb.</th><th>Final %</th></tr></thead>
        <tbody>
          {Object.entries(dr.shares).map(([aid, log]: any) => (
            <tr key={aid}>
              <td><span className="color-dot" style={{ background: colorById.get(aid) }} />{allianceById.get(aid)}</td>
              <td>{log.baseShare.toFixed(4)}</td>
              <td>×{log.ideologyFit.toFixed(3) || '—'}</td>
              <td>×{log.positionFit.toFixed(3) || '—'}</td>
              <td>×{log.euEffect.toFixed(3) || '—'}</td>
              <td>×{log.homeBonus.toFixed(2) || '—'}</td>
              <td>×{log.incumbencyBonus.toFixed(2) || '—'}</td>
              <td><strong>{(log.finalShare * 100).toFixed(2)}%</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Meek STV rounds</h4>
      <ol className="rounds">
        {dr.rounds.map((r: any, i: number) => (
          <li key={i}><strong>Round {r.round}</strong> (quota {r.quota}): {r.note} — tallies: {' '}
            {Object.entries(r.tallies).map(([c, v]: any) => `${c}: ${v.toFixed(1)}`).join(', ')}
          </li>
        ))}
      </ol>
      <p>Elimination order: {dr.eliminatedOrder.map((c: string) => allianceById.get(c) ?? c).join(' → ') || '—'}</p>
      <h4>Weight settings</h4>
      <pre className="json">{JSON.stringify(res.weights, null, 2)}</pre>
    </div>
  );
}
