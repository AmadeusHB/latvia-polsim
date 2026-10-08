import { describe, it, expect } from 'vitest';
import { runSimulation } from '../simulate';
import { defaultDistricts, DEFAULT_WEIGHTS } from '../../data/presets';
import type { Scenario, Alliance, Party, DistrictName } from '../../types';

// Reference election: "20th Saeima — RIGHT WON" from the user's lore.
// Each alliance: [name, color, seats, position(s), dominantPos, eu, ideology, secondary, homeDistricts]
const ALL: Record<string, [string, string, number, string[], string, string, string, string[], string[]]> = {
  natcons: ['National Conservatives', '#1f4fd6', 57, ['Right Wing'], 'Right Wing', 'Soft Anti-EU', 'National Conservatism', ['National Liberalism'], ['Vidzeme', 'Zemgale']],
  popren: ['Popular Renewal', '#2e9bd6', 53, ['Center Right'], 'Center Right', 'Pro-EU', 'Liberal Conservatism', ['Regionalism'], ['Pierīga', 'Kurzeme', 'Jūrmala']],
  leftall: ['Left Alliance', '#c22f2f', 31, ['Left Wing', 'Center Left'], 'Left Wing', 'Soft Anti-EU', 'Left-Wing Populism', ['Anti-Austerity Politics'], ['Daugavpils']],
  prolp: ['Progressive Labour Party', '#e05612', 29, ['Center Left'], 'Center Left', 'Pro-EU', 'Progressivism', ['Social Democracy'], ['Riga']],
  rightside: ['The Right Side', '#3d3d8f', 27, ['Right Wing'], 'Right Wing', 'Hard Anti-EU', 'Right-Wing Libertarianism', ['Economic Nationalism'], ['Riga']],
  newcent: ['New Center', '#e6c521', 19, ['Center'], 'Center', 'Pro-EU', 'Centrism', ['Populism'], ['Riga']],
  tfl: ['Together for Latvia!', '#8a2be2', 13, ['Left Wing'], 'Left Wing', 'Soft Anti-EU', 'Minority Interests', ['Regionalism'], ['Latgale', 'Rēzekne', 'Daugavpils']],
  lao: ['Law and Order', '#4a4a4a', 12, ['Right Wing', 'Far Right'], 'Right Wing', 'Soft Anti-EU', 'Right Statism', ['Anti-Immigration'], ['Riga']],
  hsr: ['Honour to Serve Riga', '#16a085', 11, ['Big Tent'], 'Big Tent', 'Pro-EU', 'Urbanism/YIMBYism', ['Economic Progressivism'], ['Riga', 'Pierīga']],
  redbloc: ['Red Bloc', '#b01e1e', 11, ['Left Wing', 'Far Left'], 'Left Wing', 'Hard Anti-EU', 'Socialism', ['Labourism'], ['Daugavpils', 'Liepāja']],
  socunion: ['Social Union', '#7d6608', 9, ['Center', 'Center Right'], 'Center', 'Pro-EU', 'Christian Democracy', ['Distributism'], ['Latgale']],
  fwd: ['Forwards!', '#f39c12', 9, ['Big Tent'], 'Big Tent', 'Pro-EU', 'Localism', ['Anti-Corruption'], ['Valmiera', 'Jēkabpils']],
  goldawn: ['Golden Dawn', '#c9a227', 8, ['Far Right'], 'Far Right', 'Hard Anti-EU', 'Ethnic Nationalism', ['Right-Wing Populism'], ['Riga']],
  latcon: ['Latgalian Congress', '#2f7d32', 6, ['Right Wing', 'Center Right'], 'Right Wing', 'Soft Anti-EU', 'Conservativism', ['Rural Interests'], ['Latgale', 'Rēzekne']],
  ugf: ['Union of Greens and Farmers', '#7cba5c', 3, ['Center Left', 'Center'], 'Center', 'Pro-EU', 'Green Liberalism', ['Left-Agrarianism'], ['Zemgale', 'Jēkabpils']],
  innov: ['Innovations', '#5d1451', 3, ['Far Right', 'Right Wing'], 'Far Right', 'Hard Anti-EU', 'Right-Wing Populism', ['Anti-Environmentalism'], ['Riga']],
};

export function mkScenario(): Scenario {
  const parties: Party[] = [];
  const alliances: Alliance[] = [];
  const all = defaultDistricts().map((d) => d.name);
  for (const [key, a] of Object.entries(ALL)) {
    const [name, color, seats, positions, dom, eu, ideo, sec, home] = a;
    const pid = 'p-' + key;
    parties.push({
      id: pid, name: name + ' Party', ideology: ideo, secondaryIdeologies: sec,
      positions: positions as any, dominantPosition: dom as any, euPosition: eu as any,
      euroGroup: 'NI', saeimaSeats: seats, homeDistricts: home as DistrictName[],
      runningDistricts: all as DistrictName[], allianceId: 'a-' + key, color,
    });
    alliances.push({
      id: 'a-' + key, name, color, memberPartyIds: [pid], autoIdeology: true,
      autoPosition: true, autoEuPosition: true, runningDistricts: all as DistrictName[],
      saeimaStatus: ['natcons', 'popren', 'rightside', 'latcon', 'lao'].includes(key) ? 'Government' : 'Opposition',
      regionalAllianceId: null,
    });
  }
  // Blocs from the reference lore
  const blocs = [
    { id: 'b-ourrep', name: 'Our Republic!', color: '#a1193c', memberAllianceIds: ['a-leftall', 'a-prolp', 'a-tfl', 'a-hsr', 'a-redbloc'] },
    { id: 'b-newmod', name: 'New Moderates', color: '#ffdb2e', memberAllianceIds: ['a-newcent', 'a-socunion', 'a-fwd', 'a-ugf'] },
    { id: 'b-peoples', name: 'Peoples Coalition', color: '#00215f', memberAllianceIds: ['a-natcons', 'a-popren', 'a-rightside', 'a-latcon'] },
    { id: 'b-unitedright', name: 'United Right', color: '#7030a0', memberAllianceIds: ['a-goldawn', 'a-innov', 'a-lao'] },
  ];
  for (const a of alliances) {
    for (const b of blocs) if (b.memberAllianceIds.includes(a.id)) a.regionalAllianceId = b.id;
  }
  return {
    id: 'cal', name: 'right-won', createdAt: 0, seed: 20,
    parties, alliances, regionalAlliances: blocs,
    weights: { ...DEFAULT_WEIGHTS }, overrides: [], incumbentGovernors: {},
    saeimaTotalSeats: 301, results: null,
  };
}

describe('Calibration: 20th Saeima (right won)', () => {
  it('CoR seats are broadly proportional to national strength', () => {
    const sc = mkScenario();
    const res = runSimulation(sc, defaultDistricts());
    const total = Object.values(res.councilorTotals).reduce((s, x) => s + x, 0);
    expect(total).toBe(150);
    // One of the two biggest national alliances (natcons 57, popren 53) leads the CoR
    const top = Object.entries(res.councilorTotals).sort((a, b) => b[1] - a[1]);
    expect(['a-natcons', 'a-popren']).toContain(top[0][0]);
    // ...but NOT a majority of the house (proportionality: 57/301 = 19% -> ~28 seats of 150)
    expect(top[0][1]).toBeLessThan(45);
    expect(top[0][1]).toBeGreaterThan(18);
    // At least 10 alliances should win CoR seats (the reference has 16 lists winning seats)
    expect(Object.keys(res.councilorTotals).length).toBeGreaterThanOrEqual(10);
    // No single alliance sweeps a majority of any district's delegation:
    for (const d of defaultDistricts()) {
      const dr = res.districtResults[d.name];
      const byA: Record<string, number> = {};
      for (const e of dr.elected) byA[e.allianceId] = (byA[e.allianceId] ?? 0) + 1;
      const maxSeats = Math.max(...Object.values(byA));
      expect(maxSeats).toBeLessThanOrEqual(Math.ceil(d.corSeats * 0.55));
    }
  });

  it('regional variation exists: natcons share differs strongly across districts', () => {
    const sc = mkScenario();
    const res = runSimulation(sc, defaultDistricts());
    const shareIn = (dist: string, aid: string) => res.districtResults[dist as DistrictName].shares[aid]?.finalShare ?? 0;
    // Nationalist conservatives should do better in Vidzeme (lean +0.2) than Riga (lean -0.3)
    expect(shareIn('Vidzeme', 'a-natcons')).toBeGreaterThan(shareIn('Riga', 'a-natcons'));
    // Together for Latvia (Latgalian/minority) should dominate in Latgale but not in Riga
    expect(shareIn('Latgale', 'a-tfl')).toBeGreaterThan(shareIn('Riga', 'a-tfl'));
    expect(shareIn('Latgale', 'a-tfl')).toBeGreaterThan(0.10);
    // Red Bloc (hard-left, home Daugavpils) stronger in Daugavpils than in Jūrmala
    expect(shareIn('Daugavpils', 'a-redbloc')).toBeGreaterThan(shareIn('Jūrmala', 'a-redbloc'));
  });

  it('governors: 18, diaspora excluded, winners plausible', () => {
    const sc = mkScenario();
    const res = runSimulation(sc, defaultDistricts());
    expect(Object.keys(res.governors).length).toBe(18);
    expect(res.governors['Living Outside Latvia']).toBeUndefined();
    // Government bloc alliances should win a good share of governorships
    const govWins = Object.values(res.governors).filter((g) =>
      ['a-natcons', 'a-popren', 'a-rightside', 'a-latcon', 'a-lao'].includes(g!)).length;
    expect(govWins).toBeGreaterThanOrEqual(8);
  });
});
