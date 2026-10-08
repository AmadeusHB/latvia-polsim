import { describe, it, expect } from 'vitest';
import { runSimulation } from '../simulate';
import { defaultDistricts, DEFAULT_WEIGHTS } from '../../data/presets';
import type { Scenario, Alliance, Party, DistrictName, Position, EUPosition } from '../../types';

// ============================================================
// The three reference elections from the user's lore.
// Party structure: [name, saeimaSeats, positions[], dominantPos, eu, ideology, secondary[], homeDistricts]
// Alliance = named list of its member parties.
// ============================================================

type PartySpec = [string, number, Position[], Position, EUPosition, string, string[], DistrictName[], number?];
type AllianceSpec = { key: string; name: string; color: string; parties: PartySpec[]; status: 'Government' | 'Opposition' | 'Cross-bench' | 'Supply and Confidence' };

const GOV: DistrictName[] = ['Riga', 'Pierīga', 'Vidzeme', 'Zemgale', 'Greater Jelgava', 'Latgale', 'Greater Daugavpils', 'Kurzeme', 'Greater Liepāja', 'Daugavpils', 'Liepāja', 'Jelgava', 'Jūrmala', 'Ventspils', 'Rēzekne', 'Valmiera', 'Jēkabpils', 'Cēsis', 'Living Outside Latvia'];

// ---------------- 20th Saeima: RIGHT WON ----------------
export const RIGHT: AllianceSpec[] = [
  { key: 'natcons', name: 'National Conservatives', color: '#1f4fd6', status: 'Government', parties: [
    ['The National Conservative Party of Latvia', 57, ['Right Wing'], 'Right Wing', 'Soft Anti-EU', 'National Conservatism', ['National Liberalism'], ['Vidzeme', 'Zemgale', 'Valmiera', 'Cēsis', 'Jēkabpils', 'Jelgava', 'Greater Liepāja']]] },
  { key: 'popren', name: 'Popular Renewal', color: '#2e9bd6', status: 'Government', parties: [
    ['Popular Renewal', 46, ['Center Right'], 'Center Right', 'Pro-EU', 'Liberal Conservatism', ['Regionalism'], ['Pierīga', 'Kurzeme', 'Jūrmala']],
    ['Growth', 7, ['Center Right'], 'Center Right', 'Pro-EU', 'Conservative Liberalism', [], ['Kurzeme']]] },
  { key: 'leftall', name: 'Left Alliance', color: '#c22f2f', status: 'Opposition', parties: [
    ['Momentum', 27, ['Left Wing', 'Center Left'], 'Left Wing', 'Soft Anti-EU', 'Left-Wing Populism', ['Anti-Austerity Politics'], ['Daugavpils', 'Greater Daugavpils', 'Liepāja'], 1.4],
    ['Civic Alliance', 4, ['Left Wing'], 'Left Wing', 'Soft Anti-EU', 'Social Liberalism', [], ['Daugavpils'], 1.4]] },
  { key: 'prolp', name: 'Progressive Labour Party', color: '#e05612', status: 'Opposition', parties: [
    ['Progressives', 17, ['Center Left'], 'Center Left', 'Pro-EU', 'Progressivism', ['Social Democracy'], ['Riga']],
    ['Social Democrats', 12, ['Center Left'], 'Center Left', 'Pro-EU', 'Social Democracy', [], ['Riga']]] },
  { key: 'rightside', name: 'The Right Side', color: '#3d3d8f', status: 'Government', parties: [
    ['Right Side', 23, ['Right Wing'], 'Right Wing', 'Hard Anti-EU', 'Right-Wing Libertarianism', ['Economic Nationalism'], ['Riga']],
    ['Libertarian Party', 4, ['Right Wing'], 'Right Wing', 'Hard Anti-EU', 'Libertarianism', [], ['Riga']]] },
  { key: 'newcent', name: 'New Center', color: '#e6c521', status: 'Cross-bench', parties: [
    ['New Center', 15, ['Center'], 'Center', 'Pro-EU', 'Centrism', ['Populism'], ['Riga']],
    ['Change', 4, ['Center'], 'Center', 'Pro-EU', 'Centrism', [], ['Riga']]] },
  { key: 'tfl', name: 'Together for Latvia!', color: '#8a2be2', status: 'Opposition', parties: [
    ['Together for Latgale!', 11, ['Left Wing'], 'Left Wing', 'Soft Anti-EU', 'Latgalian Regionalism', ['Minority Interests'], ['Latgale', 'Rēzekne', 'Daugavpils', 'Greater Daugavpils'], 1.4],
    ['Equal', 2, ['Left Wing'], 'Left Wing', 'Soft Anti-EU', 'Minority Interests', [], ['Latgale']]] },
  { key: 'lao', name: 'Law and Order', color: '#4a4a4a', status: 'Government', parties: [
    ['Law and Order', 12, ['Right Wing', 'Far Right'], 'Right Wing', 'Soft Anti-EU', 'Right Statism', ['Anti-Immigration'], ['Riga']]] },
  { key: 'hsr', name: 'Honour to Serve Riga', color: '#16a085', status: 'Opposition', parties: [
    ['Humane Riga', 7, ['Big Tent'], 'Big Tent', 'Pro-EU', 'Urbanism/YIMBYism', ['Economic Progressivism'], ['Riga']],
    ['Citizens Alliance of Pierīga', 2, ['Big Tent'], 'Big Tent', 'Pro-EU', 'Localism', [], ['Pierīga']],
    ['Our Home!', 2, ['Big Tent'], 'Big Tent', 'Pro-EU', 'Urbanism/YIMBYism', [], ['Riga']]] },
  { key: 'redbloc', name: 'Red Bloc', color: '#b01e1e', status: 'Opposition', parties: [
    ['Red Bloc', 8, ['Left Wing', 'Far Left'], 'Left Wing', 'Hard Anti-EU', 'Socialism', ['Labourism'], ['Daugavpils', 'Liepāja']],
    ['Labour', 3, ['Far Left'], 'Far Left', 'Hard Anti-EU', 'Labourism', [], ['Liepāja']]] },
  { key: 'socunion', name: 'Social Union', color: '#7d6608', status: 'Opposition', parties: [
    ['Christian Social Union', 7, ['Center', 'Center Right'], 'Center', 'Pro-EU', 'Christian Democracy', ['Distributism'], ['Latgale', 'Rēzekne']],
    ['State and People', 2, ['Center Right'], 'Center Right', 'Pro-EU', 'Paternalistic Conservatism', [], ['Vidzeme']]] },
  { key: 'fwd', name: 'Forwards!', color: '#f39c12', status: 'Cross-bench', parties: [
    ['Movement of Citizens and Independents', 9, ['Big Tent'], 'Big Tent', 'Pro-EU', 'Localism', ['Anti-Corruption'], ['Valmiera', 'Jēkabpils']]] },
  { key: 'goldawn', name: 'Golden Dawn', color: '#c9a227', status: 'Cross-bench', parties: [
    ['Golden Dawn', 8, ['Far Right'], 'Far Right', 'Hard Anti-EU', 'Ethnic Nationalism', ['Right-Wing Populism'], ['Riga']]] },
  { key: 'latcon', name: 'Latgalian Congress', color: '#2f7d32', status: 'Government', parties: [
    ['Latgalian Congress', 5, ['Right Wing', 'Center Right'], 'Right Wing', 'Soft Anti-EU', 'Latgalian Regionalism', ['Rural Interests'], ['Latgale', 'Rēzekne', 'Daugavpils'], 1.6],
    ['Better Latgale!', 1, ['Right Wing'], 'Right Wing', 'Soft Anti-EU', 'Rural Interests', [], ['Latgale']]] },
  { key: 'ugf', name: 'Union of Greens and Farmers', color: '#7cba5c', status: 'Cross-bench', parties: [
    ['Ecology', 2, ['Center Left', 'Center'], 'Center', 'Pro-EU', 'Green Liberalism', [], ['Zemgale', 'Jēkabpils']],
    ['Agrarian Center', 1, ['Center'], 'Center', 'Pro-EU', 'Left-Agrarianism', [], ['Zemgale']]] },
  { key: 'innov', name: 'Innovations', color: '#5d1451', status: 'Cross-bench', parties: [
    ['Innovations', 3, ['Far Right', 'Right Wing'], 'Far Right', 'Hard Anti-EU', 'Right-Wing Populism', ['Anti-Environmentalism'], ['Riga']]] },
];

// Reference governors + district winners (from the lore tables)
export const RIGHT_GOV: Record<string, string> = {
  Riga: 'prolp', Pierīga: 'popren', Vidzeme: 'natcons', Latgale: 'latcon',
  'Greater Daugavpils': 'leftall', Zemgale: 'natcons', 'Greater Jelgava': 'popren',
  Kurzeme: 'popren', 'Greater Liepāja': 'natcons', Daugavpils: 'leftall',
  Liepāja: 'leftall', Jelgava: 'natcons', Jūrmala: 'popren', Ventspils: 'popren',
  Rēzekne: 'tfl', Valmiera: 'natcons', Jēkabpils: 'natcons', Cēsis: 'natcons',
};

export function buildScenario(specs: AllianceSpec[], blocsIn: { key: string; name: string; color: string; members: string[] }[], seed: number): Scenario {
  const parties: Party[] = [];
  const alliances: Alliance[] = [];
  for (const a of specs) {
    const pids: string[] = [];
    a.parties.forEach((ps, i) => {
      const [name, seats, positions, dom, eu, ideo, sec, home, conc] = ps;
      const pid = `p-${a.key}-${i}`;
      parties.push({
        id: pid, name, ideology: ideo, secondaryIdeologies: sec,
        positions, dominantPosition: dom, euPosition: eu, euroGroup: 'NI',
        saeimaSeats: seats, homeDistricts: home, homeConcentration: conc ?? 1, runningDistricts: [],
        allianceId: 'a-' + a.key, color: a.color,
      });
      pids.push(pid);
    });
    alliances.push({
      id: 'a-' + a.key, name: a.name, color: a.color, memberPartyIds: pids,
      autoIdeology: true, autoPosition: true, autoEuPosition: true,
      runningDistricts: GOV, saeimaStatus: a.status, regionalAllianceId: null,
    });
  }
  const regionalAlliances = blocsIn.map((b) => ({
    id: 'b-' + b.key, name: b.name, color: b.color,
    memberAllianceIds: b.members.map((m) => 'a-' + m),
  }));
  const raById = new Map(regionalAlliances.map((b) => [b.id, b]));
  for (const a of alliances) {
    for (const b of regionalAlliances) {
      if (b.memberAllianceIds.includes(a.id)) a.regionalAllianceId = b.id;
    }
  }
  void raById;
  return {
    id: 'ref', name: 'reference', createdAt: 0, seed,
    parties, alliances, regionalAlliances,
    weights: { ...DEFAULT_WEIGHTS }, overrides: [], incumbentGovernors: {},
    saeimaTotalSeats: 301, results: null,
  };
}

export const RIGHT_BLOCS = [
  { key: 'ourrep', name: 'Our Republic!', color: '#a1193c', members: ['leftall', 'prolp', 'tfl', 'hsr', 'redbloc'] },
  { key: 'newmod', name: 'New Moderates', color: '#ffdb2e', members: ['newcent', 'socunion', 'fwd', 'ugf'] },
  { key: 'peoples', name: 'Peoples Coalition', color: '#00215f', members: ['natcons', 'popren', 'rightside', 'latcon'] },
  { key: 'unitedright', name: 'United Right', color: '#7030a0', members: ['goldawn', 'innov', 'lao'] },
];

// ============================================================
// Comparison harness
// ============================================================

function compareGovernors(res: ReturnType<typeof runSimulation>, expected: Record<string, string>) {
  const rows: { district: string; expected: string; got: string; ok: boolean }[] = [];
  for (const [district, expKey] of Object.entries(expected)) {
    const got = res.governors[district as DistrictName] ?? '';
    const gotKey = got.replace('a-', '');
    rows.push({ district, expected: expKey, got: gotKey, ok: gotKey === expKey });
  }
  return rows;
}

function topAllianceShares(res: ReturnType<typeof runSimulation>, district: string, n = 5) {
  const dr = res.districtResults[district as DistrictName];
  return Object.entries(dr.shares)
    .sort((a: any, b: any) => b[1].finalShare - a[1].finalShare)
    .slice(0, n)
    .map(([aid, log]: any) => ({ key: aid.replace('a-', ''), share: log.finalShare }));
}

describe('Calibration vs reference: 20th Saeima (RIGHT WON)', () => {
  const sc = buildScenario(RIGHT, RIGHT_BLOCS, 20);
  const res = runSimulation(sc, defaultDistricts());

  it('totals are exact', () => {
    const total = Object.values(res.councilorTotals).reduce((s, x) => s + x, 0);
    expect(total).toBe(150);
    expect(Object.keys(res.governors).length).toBe(18);
  });

  it('many alliances win CoR seats (no sweep)', () => {
    expect(Object.keys(res.councilorTotals).length).toBeGreaterThanOrEqual(12);
    const top = Math.max(...Object.values(res.councilorTotals));
    expect(top).toBeLessThanOrEqual(40);
  });

  it('governors: reasonable agreement with reference', () => {
    const rows = compareGovernors(res, RIGHT_GOV);
    const hits = rows.filter((r) => r.ok).length;
    // Report for visibility
    const missed = rows.filter((r) => !r.ok).map((r) => `${r.district}: want ${r.expected}, got ${r.got}`);
    if (missed.length) console.log('GOV MISMATCHES:\n' + missed.join('\n'));
    console.log('GOV HITS: ' + hits + '/18');
    expect(hits).toBeGreaterThanOrEqual(6);
  });

  it('regional patterns: expected district leaders lead', () => {
    // Riga: PLP-led in reference
    const rigaTop = topAllianceShares(res, 'Riga', 1)[0];
    expect(rigaTop.key).toBe('prolp');
    // Latgale: regionalist lists strong (tfl + latcon combined significant)
    const latgale = topAllianceShares(res, 'Latgale', 8);
    const tflShare = latgale.find((x) => x.key === 'tfl')?.share ?? 0;
    const latconShare = latgale.find((x) => x.key === 'latcon')?.share ?? 0;
    expect(tflShare + latconShare).toBeGreaterThan(0.18);
    // Vidzeme: natcons strong (5/10 seats in reference)
    const vidzeme = topAllianceShares(res, 'Vidzeme', 3);
    expect(vidzeme[0].key).toBe('natcons');
  });

  it('district delegations roughly match reference shape', () => {
    // Reference Riga (25 seats): PLP 4, HSR 6, LA 2, RB 1 — left/urban lists strong
    const rigaSeats: Record<string, number> = {};
    for (const e of res.districtResults['Riga'].elected) {
      rigaSeats[e.allianceId.replace('a-', '')] = (rigaSeats[e.allianceId.replace('a-', '')] ?? 0) + 1;
    }
    // In reference, no single list takes more than 6/25 (24%) in Riga
    const maxSeats = Math.max(...Object.values(rigaSeats));
    expect(maxSeats).toBeLessThanOrEqual(9);
  });
});

// ---------------- 24th Saeima: CENTER WON ----------------
export const CENTER: AllianceSpec[] = [
  { key: 'socinit', name: 'Social Initiative', color: '#6c7b8b', status: 'Government', parties: [
    ['Democratic Initiative', 40, ['Center Right', 'Center'], 'Center Right', 'Pro-EU', 'Paternalistic Conservatism', ['Civic Nationalism'], ['Vidzeme', 'Valmiera', 'Zemgale', 'Kurzeme', 'Jēkabpils', 'Cēsis', 'Jelgava', 'Greater Jelgava', 'Greater Liepāja', 'Pierīga'], 1.3],
    ['Christian Social Union', 19, ['Center', 'Center Right'], 'Center', 'Pro-EU', 'Christian Democracy', ['Distributism'], ['Latgale', 'Rēzekne']]] },
  { key: 'newcent', name: 'New Center', color: '#e6c521', status: 'Government', parties: [
    ['New Center', 43, ['Center'], 'Center', 'Pro-EU', 'Centrism', ['Populism'], ['Riga']]] },
  { key: 'socdem', name: 'The Social Democrats', color: '#fe0000', status: 'Government', parties: [
    ['Social Democrats', 37, ['Center Left'], 'Center Left', 'Soft Anti-EU', 'Social Democracy', ['Welfarism'], ['Liepāja', 'Jelgava']]] },
  { key: 'progress', name: 'Progress', color: '#178248', status: 'Cross-bench', parties: [
    ['Progressives', 13, ['Center Left', 'Left Wing'], 'Center Left', 'Pro-EU', 'Progressivism', ['Green Politics'], ['Riga']],
    ['Humane Riga', 11, ['Center Left'], 'Center Left', 'Pro-EU', 'Urbanism/YIMBYism', ['Green Politics'], ['Riga']],
    ['Ecology', 1, ['Center Left'], 'Center Left', 'Pro-EU', 'Green Politics', [], ['Jūrmala']]] },
  { key: 'natcons', name: 'National Conservatives', color: '#1f4fd6', status: 'Opposition', parties: [
    ['The National Conservative Party of Latvia', 21, ['Right Wing'], 'Right Wing', 'Soft Anti-EU', 'National Conservatism', ['National Liberalism'], ['Vidzeme', 'Zemgale']]] },
  { key: 'freedc', name: 'Freedom Caucus', color: '#7030a0', status: 'Opposition', parties: [
    ['Golden Dawn', 9, ['Far Right'], 'Far Right', 'Hard Anti-EU', 'Right-Wing Populism', ['Anti-Environmentalism'], ['Riga']],
    ['Law and Order', 7, ['Far Right', 'Right Wing'], 'Far Right', 'Hard Anti-EU', 'Right Statism', ['Anti-Immigration'], ['Riga']]] },
  { key: 'popren', name: 'Popular Renewal', color: '#2e9bd6', status: 'Cross-bench', parties: [
    ['Popular Renewal', 13, ['Center Right'], 'Center Right', 'Pro-EU', 'Classical Liberalism', ['Liberal Conservatism'], ['Pierīga', 'Kurzeme']],
    ['Liberty!', 2, ['Center Right'], 'Center Right', 'Pro-EU', 'Liberalism', [], ['Riga']]] },
  { key: 'leftall', name: 'Left Alliance', color: '#c22f2f', status: 'Opposition', parties: [
    ['Momentum', 11, ['Left Wing'], 'Left Wing', 'Soft Anti-EU', 'Left-Wing Populism', ['Anti-Austerity Politics'], ['Daugavpils'], 1.4],
    ['Civic Alliance', 3, ['Left Wing'], 'Left Wing', 'Soft Anti-EU', 'Social Liberalism', [], ['Daugavpils'], 1.4],
    ['Labour', 1, ['Left Wing'], 'Left Wing', 'Soft Anti-EU', 'Labourism', [], ['Liepāja'], 1.8]] },
  { key: 'redbloc', name: 'Red Bloc', color: '#b01e1e', status: 'Opposition', parties: [
    ['Red Bloc', 12, ['Far Left'], 'Far Left', 'Hard Anti-EU', 'Socialism', ['Marxism'], ['Daugavpils', 'Liepāja']]] },
  { key: 'ourhome', name: 'Our Home!', color: '#9de055', status: 'Government', parties: [
    ['Our Home!', 11, ['Big Tent'], 'Big Tent', 'Pro-EU', 'Urbanism/YIMBYism', ['Economic Progressivism'], ['Riga']]] },
  { key: 'tfl', name: 'Together for Latvia!', color: '#8a2be2', status: 'Opposition', parties: [
    ['Together for Latgale!', 10, ['Left Wing'], 'Left Wing', 'Soft Anti-EU', 'Latgalian Regionalism', ['Minority Interests'], ['Latgale', 'Rēzekne', 'Daugavpils', 'Greater Daugavpils'], 1.6],
    ['Equal', 1, ['Left Wing'], 'Left Wing', 'Soft Anti-EU', 'Minority Interests', [], ['Latgale']]] },
  { key: 'rightside', name: 'The Right Side', color: '#3d3d8f', status: 'Opposition', parties: [
    ['Right Side', 9, ['Right Wing', 'Far Right'], 'Right Wing', 'Soft Anti-EU', 'Neo-Liberalism', ['Right-Wing Libertarianism'], ['Riga']]] },
  { key: 'citm', name: 'Citizens Movement', color: '#479ea7', status: 'Cross-bench', parties: [
    ['Citizens Alliance of Pierīga', 4, ['Center Right'], 'Center Right', 'Pro-EU', 'Liberalism', ['Regionalism'], ['Pierīga']],
    ['Growth', 2, ['Center Right'], 'Center Right', 'Pro-EU', 'Conservative Liberalism', ['Developmentalism' as any].filter(Boolean) as any, ['Kurzeme']]] },
  { key: 'alc', name: 'All Latvian Congress', color: '#357f0e', status: 'Cross-bench', parties: [
    ['Latgalian Congress', 4, ['Right Wing', 'Center Right'], 'Right Wing', 'Soft Anti-EU', 'Christian Democracy', ['Rural Interests'], ['Latgale', 'Rēzekne']],
    ['Catholic Democrats', 1, ['Center Right'], 'Center Right', 'Soft Anti-EU', 'Christian Traditionalism', [], ['Latgale']]] },
  { key: 'peoplescur', name: 'Peoples Current', color: '#206165', status: 'Opposition', parties: [
    ['Alternative', 3, ['Syncretic'], 'Syncretic', 'Hard Anti-EU', 'Russian Interests', ['Conservativism'], ['Daugavpils']],
    ['Independent Left', 2, ['Syncretic'], 'Syncretic', 'Hard Anti-EU', 'Left-Wing Conservativism', [], ['Daugavpils']]] },
  { key: 'fwd', name: 'Forwards!', color: '#f39c12', status: 'Supply and Confidence', parties: [
    ['Independents and Mayors', 5, ['Big Tent'], 'Big Tent', 'Pro-EU', 'Localism', ['Anti-Corruption'], ['Valmiera', 'Jēkabpils']]] },
  { key: 'ufp', name: 'United Farmers Party', color: '#3b7819', status: 'Cross-bench', parties: [
    ['United Farmers Party', 3, ['Right Wing'], 'Right Wing', 'Soft Anti-EU', 'Conservative Agrarianism' as any, ['Agrarianism'], ['Zemgale', 'Jēkabpils']]] },
  { key: 'unity', name: 'Unity', color: '#e0317c', status: 'Cross-bench', parties: [
    ['Unity', 3, ['Center Right', 'Center'], 'Center Right', 'Pro-EU', 'Third Way', ['Civic Plurinationalism'], ['Riga']]] },
];

export const CENTER_BLOCS = [
  { key: 'ourrep', name: 'Our Republic!', color: '#068c44', members: ['progress', 'leftall', 'redbloc', 'ourhome', 'tfl'] },
  { key: 'newmod', name: 'New Moderates', color: '#ffa100', members: ['socinit', 'newcent', 'fwd', 'unity'] },
  { key: 'peoples', name: 'Peoples Coalition', color: '#479ea7', members: ['popren', 'citm', 'alc', 'ufp'] },
  { key: 'unitedright', name: 'United Right', color: '#7030a0', members: ['freedc', 'rightside'] },
];

export const CENTER_GOV: Record<string, string> = {
  Riga: 'progress', Pierīga: 'socinit', Vidzeme: 'socinit', Latgale: 'socinit',
  'Greater Daugavpils': 'tfl', Zemgale: 'socinit', Jelgava: 'socinit',
  Kurzeme: 'socinit', 'Greater Liepāja': 'socinit', Daugavpils: 'leftall',
  Liepāja: 'leftall', 'Greater Jelgava': 'socinit', Jūrmala: 'socinit',
  Ventspils: 'socinit', Rēzekne: 'tfl', Valmiera: 'socinit', Jēkabpils: 'socinit', Cēsis: 'socinit',
};

// ---------------- 25th Saeima: LEFT WON ----------------
export const LEFT: AllianceSpec[] = [
  { key: 'repc', name: 'Republican Coalition', color: '#0e8845', status: 'Government', parties: [
    ['Progress', 41, ['Left Wing', 'Center Left'], 'Left Wing', 'Pro-EU', 'Progressivism', ['Green Politics'], ['Riga', 'Jelgava', 'Ventspils', 'Jūrmala']],
    ['Humane Riga', 15, ['Center Left'], 'Center Left', 'Pro-EU', 'Urbanism/YIMBYism', ['Economic Progressivism'], ['Riga']],
    ['Civic Alliance', 7, ['Center Left'], 'Center Left', 'Pro-EU', 'Social Liberalism', [], ['Pierīga']]] },
  { key: 'socdem', name: 'The Social Democrats', color: '#fe0000', status: 'Government', parties: [
    ['Social Democrats', 31, ['Center Left'], 'Center Left', 'Soft Anti-EU', 'Social Democracy', ['Welfarism'], ['Liepāja', 'Jelgava', 'Greater Liepāja', 'Ventspils']]] },
  { key: 'freedc', name: 'Freedom Caucus', color: '#7030a0', status: 'Opposition', parties: [
    ['Golden Dawn', 15, ['Far Right'], 'Far Right', 'Hard Anti-EU', 'Right-Wing Populism', ['Anti-Environmentalism'], ['Riga']],
    ['Law and Order', 11, ['Far Right'], 'Far Right', 'Hard Anti-EU', 'Right Statism', ['Anti-Immigration'], ['Riga']]] },
  { key: 'leftall', name: 'Left Alliance', color: '#c22f2f', status: 'Government', parties: [
    ['Momentum', 21, ['Left Wing'], 'Left Wing', 'Soft Anti-EU', 'Left-Wing Populism', ['Anti-Austerity Politics'], ['Liepāja', 'Greater Liepāja'], 1.5],
    ['Labour', 5, ['Left Wing'], 'Left Wing', 'Soft Anti-EU', 'Labourism', [], ['Liepāja']]] },
  { key: 'socinit', name: 'Social Initiative', color: '#6c7b8b', status: 'Cross-bench', parties: [
    ['Democratic Initiative', 13, ['Center Right', 'Center'], 'Center Right', 'Pro-EU', 'Paternalistic Conservatism', ['Civic Nationalism'], ['Vidzeme', 'Zemgale', 'Valmiera', 'Cēsis', 'Jēkabpils', 'Kurzeme', 'Greater Liepāja', 'Greater Jelgava']],
    ['Christian Social Union', 9, ['Center'], 'Center', 'Pro-EU', 'Christian Democracy', ['Distributism'], ['Latgale', 'Rēzekne']]] },
  { key: 'tfl', name: 'Together for Latvia!', color: '#8a2be2', status: 'Government', parties: [
    ['Together for Latgale!', 17, ['Left Wing'], 'Left Wing', 'Soft Anti-EU', 'Latgalian Regionalism', ['Minority Interests'], ['Latgale', 'Rēzekne', 'Daugavpils', 'Greater Daugavpils'], 1.4],
    ['Equal', 4, ['Left Wing'], 'Left Wing', 'Soft Anti-EU', 'Minority Interests', [], ['Latgale']]] },
  { key: 'popren', name: 'Popular Renewal', color: '#2e9bd6', status: 'Cross-bench', parties: [
    ['Popular Renewal', 16, ['Center Right'], 'Center Right', 'Pro-EU', 'Classical Liberalism', [], ['Pierīga', 'Kurzeme']],
    ['Liberty!', 3, ['Center Right'], 'Center Right', 'Pro-EU', 'Liberalism', [], ['Riga']]] },
  { key: 'newcent', name: 'New Center', color: '#e6c521', status: 'Cross-bench', parties: [
    ['New Center', 17, ['Center'], 'Center', 'Pro-EU', 'Centrism', ['Populism'], ['Riga']]] },
  { key: 'natcons', name: 'National Conservatives', color: '#1f4fd6', status: 'Opposition', parties: [
    ['The National Conservative Party of Latvia', 17, ['Right Wing'], 'Right Wing', 'Soft Anti-EU', 'National Conservatism', ['National Liberalism'], ['Vidzeme', 'Zemgale']]] },
  { key: 'rightside', name: 'The Right Side', color: '#3d3d8f', status: 'Opposition', parties: [
    ['Right Side', 13, ['Right Wing', 'Far Right'], 'Right Wing', 'Hard Anti-EU', 'Neo-Liberalism', [], ['Riga']]] },
  { key: 'ourhome', name: 'Our Home!', color: '#9de055', status: 'Government', parties: [
    ['Our Home!', 13, ['Big Tent'], 'Big Tent', 'Pro-EU', 'Urbanism/YIMBYism', ['Economic Progressivism'], ['Riga']]] },
  { key: 'citm', name: 'Citizens Movement', color: '#479ea7', status: 'Cross-bench', parties: [
    ['Citizens Alliance of Pierīga', 5, ['Center Right'], 'Center Right', 'Pro-EU', 'Liberalism', ['Regionalism'], ['Pierīga']],
    ['Growth', 3, ['Center Right'], 'Center Right', 'Pro-EU', 'Conservative Liberalism', [], ['Kurzeme']]] },
  { key: 'alc', name: 'All Latvian Congress', color: '#357f0e', status: 'Opposition', parties: [
    ['All Latvian and Latgalian Congress', 5, ['Right Wing', 'Center Right'], 'Right Wing', 'Soft Anti-EU', 'Conservativism', ['Agrarianism'], ['Latgale', 'Rēzekne']],
    ['United Farmers Party', 2, ['Right Wing'], 'Right Wing', 'Soft Anti-EU', 'Conservative Agrarianism' as any, [], ['Zemgale']]] },
  { key: 'redbloc', name: 'Red Bloc', color: '#b01e1e', status: 'Cross-bench', parties: [
    ['Red Bloc', 5, ['Far Left'], 'Far Left', 'Hard Anti-EU', 'Socialism', ['Marxism'], ['Daugavpils', 'Liepāja']]] },
  { key: 'libf', name: 'Liberal Forum', color: '#ff4400', status: 'Cross-bench', parties: [
    ['Liberal Forum', 5, ['Center', 'Center Left'], 'Center', 'Pro-EU', 'Social Liberalism', [], ['Riga']]] },
  { key: 'unity', name: 'Unity', color: '#e0317c', status: 'Cross-bench', parties: [
    ['Unity', 4, ['Center Right', 'Center'], 'Center Right', 'Pro-EU', 'Third Way', ['Civic Plurinationalism'], ['Riga']]] },
  { key: 'peoplescur', name: 'Peoples Current', color: '#206165', status: 'Opposition', parties: [
    ['Alternative', 3, ['Syncretic'], 'Syncretic', 'Hard Anti-EU', 'Russian Interests', ['Conservativism'], ['Daugavpils']]] },
];

export const LEFT_BLOCS = [
  { key: 'ourrep', name: 'Our Republic!', color: '#068c44', members: ['repc', 'leftall', 'redbloc', 'ourhome', 'tfl'] },
  { key: 'newmod', name: 'New Moderates', color: '#ffa100', members: ['socinit', 'newcent', 'libf', 'unity'] },
  { key: 'peoples', name: 'Peoples Coalition', color: '#479ea7', members: ['popren', 'citm', 'alc'] },
  { key: 'unitedright', name: 'United Right', color: '#7030a0', members: ['freedc', 'rightside'] },
];

export const LEFT_GOV: Record<string, string> = {
  Riga: 'repc', Pierīga: 'citm', Vidzeme: 'socinit', Latgale: 'tfl',
  'Greater Daugavpils': 'tfl', Zemgale: 'socinit', 'Greater Jelgava': 'socinit',
  Kurzeme: 'socinit', 'Greater Liepāja': 'socinit', Daugavpils: 'tfl',
  Liepāja: 'leftall', Jelgava: 'repc', Jūrmala: 'repc', Ventspils: 'repc',
  Rēzekne: 'tfl', Valmiera: 'socinit', Jēkabpils: 'socinit', Cēsis: 'socinit',
};

// ============================================================
// Three-election comparison
// ============================================================
const ELECTIONS = [
  { name: 'RIGHT (20th)', specs: RIGHT, blocs: RIGHT_BLOCS, gov: RIGHT_GOV, seed: 20 },
  { name: 'CENTER (24th)', specs: CENTER, blocs: CENTER_BLOCS, gov: CENTER_GOV, seed: 24 },
  { name: 'LEFT (25th)', specs: LEFT, blocs: LEFT_BLOCS, gov: LEFT_GOV, seed: 25 },
] as const;

describe.each(ELECTIONS)('Reference: %s', (ele) => {
  const sc = buildScenario(ele.specs as any, ele.blocs as any, ele.seed);
  const res = runSimulation(sc, defaultDistricts());

  it('totals exact + no sweep', () => {
    const total = Object.values(res.councilorTotals).reduce((s, x) => s + x, 0);
    expect(total).toBe(150);
    expect(Object.keys(res.governors).length).toBe(18);
    expect(Object.keys(res.councilorTotals).length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...Object.values(res.councilorTotals))).toBeLessThanOrEqual(40);
  });

  it('governors match reference reasonably', () => {
    const rows = compareGovernors(res, ele.gov);
    const hits = rows.filter((r) => r.ok).length;
    const missed = rows.filter((r) => !r.ok).map((r) => `${r.district}: want ${r.expected} got ${r.got}`);
    console.log(`[${ele.name}] GOV HITS: ${hits}/18; misses: ${missed.join('; ') || 'none'}`);
    expect(hits).toBeGreaterThanOrEqual(7);
  });
});
