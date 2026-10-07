import { create } from 'zustand';
import type { Scenario, Party, Alliance, RegionalAlliance, Weights, DistrictName } from './types';
import { DEFAULT_WEIGHTS } from './data/presets';
import { runSimulation, validateScenario } from './engine/simulate';
import { defaultDistricts } from './data/presets';

const LS_KEY = 'latvia-polsim-scenarios-v1';

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function emptyScenario(name: string): Scenario {
  return {
    id: uid(), name, createdAt: Date.now(), seed: 12345,
    parties: [], alliances: [], regionalAlliances: [],
    weights: { ...DEFAULT_WEIGHTS }, overrides: [], incumbentGovernors: {},
    saeimaTotalSeats: 301, results: null,
  };
}

interface Store {
  scenarios: Scenario[];
  activeId: string | null;
  templates: Scenario[];
  load(): void;
  persist(): void;
  active(): Scenario | null;
  newScenario(name: string): void;
  setActive(id: string): void;
  duplicateActive(): void;
  deleteScenario(id: string): void;
  updateActive(fn: (s: Scenario) => void): void;
  addParty(p: Omit<Party, 'id'>): void;
  updateParty(id: string, patch: Partial<Party>): void;
  removeParty(id: string): void;
  addAlliance(a: Omit<Alliance, 'id'>): void;
  updateAlliance(id: string, patch: Partial<Alliance>): void;
  removeAlliance(id: string): void;
  addRegionalAlliance(b: Omit<RegionalAlliance, 'id'>): void;
  updateRegionalAlliance(id: string, patch: Partial<RegionalAlliance>): void;
  removeRegionalAlliance(id: string): void;
  setWeights(w: Weights): void;
  setOverride(district: DistrictName, shares: Record<string, number>): void;
  clearOverride(district: DistrictName): void;
  simulate(): void;
  saveAsTemplate(): void;
  loadTemplate(id: string): void;
  deleteTemplate(id: string): void;
  importScenario(json: string): boolean;
}

export const useStore = create<Store>((set, get) => ({
  scenarios: [],
  activeId: null,
  templates: [],
  load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const fixWeights = (s: any) => { s.weights = { ...DEFAULT_WEIGHTS, ...s.weights }; return s; };
        set({
          scenarios: (data.scenarios ?? []).map(fixWeights),
          activeId: data.activeId ?? null,
          templates: (data.templates ?? []).map(fixWeights),
        });
      }
    } catch { /* corrupted storage, start fresh */ }
  },
  persist() {
    const { scenarios, activeId, templates } = get();
    localStorage.setItem(LS_KEY, JSON.stringify({ scenarios, activeId, templates }));
  },
  active() {
    return get().scenarios.find((s) => s.id === get().activeId) ?? null;
  },
  newScenario(name: string) {
    const s = emptyScenario(name);
    set((st) => ({ scenarios: [...st.scenarios, s], activeId: s.id }));
    get().persist();
  },
  setActive(id: string) { set({ activeId: id }); get().persist(); },
  duplicateActive() {
    const a = get().active();
    if (!a) return;
    const copy: Scenario = JSON.parse(JSON.stringify({ ...a, id: uid(), name: a.name + ' (copy)', createdAt: Date.now() }));
    set((st) => ({ scenarios: [...st.scenarios, copy], activeId: copy.id }));
    get().persist();
  },
  deleteScenario(id: string) {
    set((st) => {
      const scenarios = st.scenarios.filter((s) => s.id !== id);
      const activeId = st.activeId === id ? (scenarios[0]?.id ?? null) : st.activeId;
      return { scenarios, activeId };
    });
    get().persist();
  },
  updateActive(fn) {
    set((st) => ({
      scenarios: st.scenarios.map((s) => {
        if (s.id !== st.activeId) return s;
        const copy: Scenario = JSON.parse(JSON.stringify(s));
        fn(copy);
        return copy;
      }),
    }));
    get().persist();
  },
  addParty(p) { get().updateActive((s) => s.parties.push({ ...p, id: uid() })); },
  updateParty(id, patch) {
    get().updateActive((s) => {
      const p = s.parties.find((x) => x.id === id);
      if (p) Object.assign(p, patch);
      if (patch.allianceId) {
        for (const a of s.alliances) a.memberPartyIds = a.memberPartyIds.filter((pid) => pid !== id);
        const a = s.alliances.find((x) => x.id === patch.allianceId);
        if (a && !a.memberPartyIds.includes(id)) a.memberPartyIds.push(id);
      }
    });
  },
  removeParty(id) {
    get().updateActive((s) => {
      s.parties = s.parties.filter((p) => p.id !== id);
      for (const a of s.alliances) a.memberPartyIds = a.memberPartyIds.filter((pid) => pid !== id);
    });
  },
  addAlliance(a) { get().updateActive((s) => s.alliances.push({ ...a, id: uid() })); },
  updateAlliance(id, patch) { get().updateActive((s) => { const a = s.alliances.find((x) => x.id === id); if (a) Object.assign(a, patch); }); },
  removeAlliance(id) {
    get().updateActive((s) => {
      s.alliances = s.alliances.filter((a) => a.id !== id);
      for (const b of s.regionalAlliances) b.memberAllianceIds = b.memberAllianceIds.filter((aid) => aid !== id);
      for (const p of s.parties) if (p.allianceId === id) p.allianceId = '';
    });
  },
  addRegionalAlliance(b) { get().updateActive((s) => s.regionalAlliances.push({ ...b, id: uid() })); },
  updateRegionalAlliance(id, patch) { get().updateActive((s) => { const b = s.regionalAlliances.find((x) => x.id === id); if (b) Object.assign(b, patch); }); },
  removeRegionalAlliance(id) {
    get().updateActive((s) => {
      s.regionalAlliances = s.regionalAlliances.filter((b) => b.id !== id);
      for (const a of s.alliances) if (a.regionalAllianceId === id) a.regionalAllianceId = null;
    });
  },
  setWeights(w) { get().updateActive((s) => { s.weights = w; }); },
  setOverride(district, shares) {
    get().updateActive((s) => {
      s.overrides = s.overrides.filter((o) => o.district !== district);
      if (Object.keys(shares).length > 0) s.overrides.push({ district, shares });
    });
  },
  clearOverride(district) { get().updateActive((s) => { s.overrides = s.overrides.filter((o) => o.district !== district); }); },
  simulate() {
    const s = get().active();
    if (!s) return;
    const res = runSimulation(s, defaultDistricts());
    get().updateActive((sc) => { sc.results = res; });
  },
  saveAsTemplate() {
    const s = get().active();
    if (!s) return;
    const t = JSON.parse(JSON.stringify({ ...s, id: uid(), name: s.name + ' (template)' }));
    set((st) => ({ templates: [...st.templates, t] }));
    get().persist();
  },
  loadTemplate(id) {
    const t = get().templates.find((x) => x.id === id);
    if (!t) return;
    const copy = JSON.parse(JSON.stringify({ ...t, id: uid(), name: t.name.replace(' (template)', ''), createdAt: Date.now() }));
    set((st) => ({ scenarios: [...st.scenarios, copy], activeId: copy.id }));
    get().persist();
  },
  deleteTemplate(id) { set((st) => ({ templates: st.templates.filter((t) => t.id !== id) })); get().persist(); },
  importScenario(json: string): boolean {
    try {
      const data = JSON.parse(json);
      if (!data || !Array.isArray(data.parties) || !Array.isArray(data.alliances)) return false;
      const s: Scenario = { ...data, id: uid(), createdAt: Date.now(), weights: { ...DEFAULT_WEIGHTS, ...data.weights } };
      set((st) => ({ scenarios: [...st.scenarios, s], activeId: s.id }));
      get().persist();
      return true;
    } catch { return false; }
  },
}));

export function activeIssues(s: Scenario | null) {
  if (!s) return [];
  return validateScenario(s, defaultDistricts());
}
