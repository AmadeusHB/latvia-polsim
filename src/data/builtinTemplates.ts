import type { Scenario, Party, Alliance, RegionalAlliance, DistrictName, Position, EUPosition, SaeimaStatus } from '../types';
import { ELECTIONS, buildHistoricalScenario } from './historicalElections';
import { DEFAULT_WEIGHTS, DISTRICT_ORDER } from './presets';

// Built-in scenario templates shipped with the app. The 25th Saeima
// ("The Left Won") is reconstructed from the user's lore: parties, alliances,
// blocs, statuses, and home regions.
const ALL_DISTRICTS = DISTRICT_ORDER as DistrictName[];

interface PartyT {
  name: string; seats: number; positions: Position[]; dominant: Position;
  eu: EUPosition; ideology: string; secondary: string[];
  home: DistrictName[]; conc?: number;
}
interface AllianceT {
  key: string; name: string; color: string; status: SaeimaStatus;
  parties: PartyT[];
}
interface BlocT { key: string; name: string; color: string; members: string[] }

const LEFT_25TH: { alliances: AllianceT[]; blocs: BlocT[]; seed: number } = {
  seed: 25,
  alliances: [
    { key: 'repc', name: 'Republican Coalition', color: '#0e8845', status: 'Government', parties: [
      { name: 'Progress', seats: 41, positions: ['Left Wing', 'Center Left'], dominant: 'Left Wing', eu: 'Pro-EU', ideology: 'Progressivism', secondary: ['Green Politics'], home: ['Riga', 'Jelgava', 'Ventspils', 'Jūrmala'] },
      { name: 'Humane Riga', seats: 16, positions: ['Center Left'], dominant: 'Center Left', eu: 'Pro-EU', ideology: 'Urbanism/YIMBYism', secondary: ['Economic Progressivism'], home: ['Riga'] },
      { name: 'Civic Alliance', seats: 7, positions: ['Center Left'], dominant: 'Center Left', eu: 'Pro-EU', ideology: 'Social Liberalism', secondary: [], home: ['Pierīga'] },
    ] },
    { key: 'socdem', name: 'The Social Democrats', color: '#fe0000', status: 'Government', parties: [
      { name: 'Social Democrats', seats: 31, positions: ['Center Left'], dominant: 'Center Left', eu: 'Soft Anti-EU', ideology: 'Social Democracy', secondary: ['Welfarism'], home: ['Liepāja', 'Jelgava', 'Greater Liepāja', 'Ventspils'] },
    ] },
    { key: 'freedc', name: 'Freedom Caucus', color: '#7030a0', status: 'Opposition', parties: [
      { name: 'Golden Dawn', seats: 15, positions: ['Far Right'], dominant: 'Far Right', eu: 'Hard Anti-EU', ideology: 'Right-Wing Populism', secondary: ['Anti-Environmentalism'], home: ['Riga'] },
      { name: 'Law and Order', seats: 11, positions: ['Far Right'], dominant: 'Far Right', eu: 'Hard Anti-EU', ideology: 'Right Statism', secondary: ['Anti-Immigration'], home: ['Riga'] },
    ] },
    { key: 'leftall', name: 'Left Alliance', color: '#c22f2f', status: 'Government', parties: [
      { name: 'Momentum', seats: 21, positions: ['Left Wing'], dominant: 'Left Wing', eu: 'Soft Anti-EU', ideology: 'Left-Wing Populism', secondary: ['Anti-Austerity Politics'], home: ['Liepāja', 'Greater Liepāja'], conc: 1.5 },
      { name: 'Labour', seats: 5, positions: ['Left Wing'], dominant: 'Left Wing', eu: 'Soft Anti-EU', ideology: 'Labourism', secondary: [], home: ['Liepāja'] },
    ] },
    { key: 'socinit', name: 'Social Initiative', color: '#6c7b8b', status: 'Cross-bench', parties: [
      { name: 'Democratic Initiative', seats: 13, positions: ['Center Right', 'Center'], dominant: 'Center Right', eu: 'Pro-EU', ideology: 'Paternalistic Conservatism', secondary: ['Civic Nationalism'], home: ['Vidzeme', 'Zemgale', 'Valmiera', 'Cēsis', 'Jēkabpils', 'Kurzeme', 'Greater Liepāja', 'Greater Jelgava'], conc: 1.3 },
      { name: 'Christian Social Union', seats: 9, positions: ['Center'], dominant: 'Center', eu: 'Pro-EU', ideology: 'Christian Democracy', secondary: ['Distributism'], home: ['Latgale', 'Rēzekne'] },
    ] },
    { key: 'tfl', name: 'Together for Latvia!', color: '#8a2be2', status: 'Government', parties: [
      { name: 'Together for Latgale!', seats: 17, positions: ['Left Wing'], dominant: 'Left Wing', eu: 'Soft Anti-EU', ideology: 'Latgalian Regionalism', secondary: ['Minority Interests'], home: ['Latgale', 'Rēzekne', 'Daugavpils', 'Greater Daugavpils'], conc: 1.4 },
      { name: 'Equal', seats: 4, positions: ['Left Wing'], dominant: 'Left Wing', eu: 'Soft Anti-EU', ideology: 'Minority Interests', secondary: [], home: ['Latgale'] },
    ] },
    { key: 'popren', name: 'Popular Renewal', color: '#2e9bd6', status: 'Cross-bench', parties: [
      { name: 'Popular Renewal', seats: 16, positions: ['Center Right'], dominant: 'Center Right', eu: 'Pro-EU', ideology: 'Classical Liberalism', secondary: [], home: ['Pierīga', 'Kurzeme'] },
      { name: 'Liberty!', seats: 3, positions: ['Center Right'], dominant: 'Center Right', eu: 'Pro-EU', ideology: 'Liberalism', secondary: [], home: ['Riga'] },
    ] },
    { key: 'newcent', name: 'New Center', color: '#e6c521', status: 'Cross-bench', parties: [
      { name: 'New Center', seats: 17, positions: ['Center'], dominant: 'Center', eu: 'Pro-EU', ideology: 'Centrism', secondary: ['Populism'], home: ['Riga'] },
    ] },
    { key: 'natcons', name: 'National Conservatives', color: '#1f4fd6', status: 'Opposition', parties: [
      { name: 'The National Conservative Party of Latvia', seats: 17, positions: ['Right Wing'], dominant: 'Right Wing', eu: 'Soft Anti-EU', ideology: 'National Conservatism', secondary: ['National Liberalism'], home: ['Vidzeme', 'Zemgale', 'Valmiera', 'Cēsis', 'Jēkabpils', 'Jelgava', 'Greater Liepāja'] },
    ] },
    { key: 'rightside', name: 'The Right Side', color: '#3d3d8f', status: 'Opposition', parties: [
      { name: 'Right Side', seats: 13, positions: ['Right Wing', 'Far Right'], dominant: 'Right Wing', eu: 'Hard Anti-EU', ideology: 'Neo-Liberalism', secondary: [], home: ['Riga'] },
    ] },
    { key: 'ourhome', name: 'Our Home!', color: '#9de055', status: 'Government', parties: [
      { name: 'Our Home!', seats: 13, positions: ['Big Tent'], dominant: 'Big Tent', eu: 'Pro-EU', ideology: 'Urbanism/YIMBYism', secondary: ['Economic Progressivism'], home: ['Riga'] },
    ] },
    { key: 'citm', name: 'Citizens Movement', color: '#479ea7', status: 'Cross-bench', parties: [
      { name: 'Citizens Alliance of Pierīga', seats: 5, positions: ['Center Right'], dominant: 'Center Right', eu: 'Pro-EU', ideology: 'Liberalism', secondary: ['Regionalism'], home: ['Pierīga'], conc: 1.7 },
      { name: 'Growth', seats: 3, positions: ['Center Right'], dominant: 'Center Right', eu: 'Pro-EU', ideology: 'Conservative Liberalism', secondary: [], home: ['Kurzeme'], conc: 1.4 },
    ] },
    { key: 'alc', name: 'All Latvian Congress', color: '#357f0e', status: 'Opposition', parties: [
      { name: 'All Latvian and Latgalian Congress', seats: 5, positions: ['Right Wing', 'Center Right'], dominant: 'Right Wing', eu: 'Soft Anti-EU', ideology: 'Conservativism', secondary: ['Agrarianism'], home: ['Latgale', 'Rēzekne'], conc: 1.5 },
      { name: 'United Farmers Party', seats: 2, positions: ['Right Wing'], dominant: 'Right Wing', eu: 'Soft Anti-EU', ideology: 'Conservative Agrarianism', secondary: ['Agrarianism'], home: ['Zemgale'], conc: 1.5 },
    ] },
    { key: 'redbloc', name: 'Red Bloc', color: '#b01e1e', status: 'Cross-bench', parties: [
      { name: 'Red Bloc', seats: 5, positions: ['Far Left'], dominant: 'Far Left', eu: 'Hard Anti-EU', ideology: 'Socialism', secondary: ['Marxism'], home: ['Daugavpils', 'Liepāja'] },
    ] },
    { key: 'libf', name: 'Liberal Forum', color: '#ff4400', status: 'Cross-bench', parties: [
      { name: 'Liberal Forum', seats: 5, positions: ['Center', 'Center Left'], dominant: 'Center', eu: 'Pro-EU', ideology: 'Social Liberalism', secondary: [], home: ['Riga'] },
    ] },
    { key: 'unity', name: 'Unity', color: '#e0317c', status: 'Cross-bench', parties: [
      { name: 'Unity', seats: 4, positions: ['Center Right', 'Center'], dominant: 'Center Right', eu: 'Pro-EU', ideology: 'Third Way', secondary: ['Civic Plurinationalism'], home: ['Riga'] },
    ] },
    { key: 'peoplescur', name: 'Peoples Current', color: '#206165', status: 'Opposition', parties: [
      { name: 'Alternative', seats: 3, positions: ['Syncretic'], dominant: 'Syncretic', eu: 'Hard Anti-EU', ideology: 'Russian Interests', secondary: ['Conservativism'], home: ['Daugavpils'] },
    ] },
  ],
  blocs: [
    { key: 'ourrep', name: 'Our Republic!', color: '#068c44', members: ['repc', 'leftall', 'redbloc', 'ourhome', 'tfl'] },
    { key: 'newmod', name: 'New Moderates', color: '#ffa100', members: ['socinit', 'newcent', 'libf', 'unity'] },
    { key: 'peoples', name: 'Peoples Coalition', color: '#479ea7', members: ['popren', 'citm', 'alc'] },
    { key: 'unitedright', name: 'United Right', color: '#7030a0', members: ['freedc', 'rightside'] },
  ],
};

function uid(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function buildTemplate(def: { alliances: AllianceT[]; blocs: BlocT[]; seed: number }): Scenario {
  const parties: Party[] = [];
  const alliances: Alliance[] = [];
  for (const at of def.alliances) {
    const pids: string[] = [];
    const aid = 'a-' + at.key;
    at.parties.forEach((pt) => {
      const pid = uid('p-');
      parties.push({
        id: pid, name: pt.name, ideology: pt.ideology, secondaryIdeologies: pt.secondary,
        positions: pt.positions, dominantPosition: pt.dominant, euPosition: pt.eu,
        euroGroup: 'NI', saeimaSeats: pt.seats, homeDistricts: pt.home,
        homeConcentration: pt.conc ?? 1, runningDistricts: [],
        allianceId: aid, color: at.color,
      });
      pids.push(pid);
    });
    alliances.push({
      id: aid, name: at.name, color: at.color, memberPartyIds: pids,
      autoIdeology: true, autoPosition: true, autoEuPosition: true,
      runningDistricts: [...ALL_DISTRICTS], saeimaStatus: at.status,
      regionalAllianceId: null,
    });
  }
  const regionalAlliances: RegionalAlliance[] = def.blocs.map((b) => ({
    id: 'b-' + b.key, name: b.name, color: b.color,
    memberAllianceIds: b.members.map((m) => 'a-' + m),
  }));
  const blocOf = new Map<string, string>();
  for (const b of regionalAlliances) for (const a of b.memberAllianceIds) blocOf.set(a, b.id);
  for (const a of alliances) a.regionalAllianceId = blocOf.get(a.id) ?? null;
  return {
    id: uid('s-'), name: '25th Saeima — The Left Won', createdAt: 0, seed: def.seed,
    parties, alliances, regionalAlliances,
    weights: { ...DEFAULT_WEIGHTS }, overrides: [], incumbentGovernors: {},
    saeimaTotalSeats: 301, results: null,
  };
}

export const BUILTIN_TEMPLATES: { label: string; build: () => Scenario }[] = [
  { label: '25th Saeima — The Left Won', build: () => buildTemplate(LEFT_25TH) },
  ...ELECTIONS.map((e) => ({ label: e.label, build: () => buildHistoricalScenario(e) })),
];
