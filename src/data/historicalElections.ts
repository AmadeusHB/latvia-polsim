// ============================================================
// Historical calibration dataset — six Saeima elections (20th-25th)
// with per-district CoR results and governors as ground truth.
// District lines are stored verbatim (including the irregularities
// flagged in the source notes); parsing happens at load time.
// ============================================================
import type { Scenario, Alliance, Party, DistrictName, Position, EUPosition, SaeimaStatus, RegionalAlliance } from '../types';
import { DEFAULT_WEIGHTS } from './presets';

export type AllianceKey =
  'NC' | 'PopR' | 'LA' | 'ProLP' | 'RS' | 'NCen' | 'TfL' | 'LO' | 'HtSR' | 'RB' | 'SocU' |
  'F!' | 'GD' | 'LatC' | 'UoGaF' | 'Inn' | 'DemI' | 'SocI' | 'FC' | 'ALC' | 'Sov' | 'Alt' |
  'IndL' | 'CitM' | 'SocD' | 'Prog' | 'OH!' | 'PC' | 'UFP' | 'Uni' | 'RepC' | 'Lib!' | 'LibF';

// Continuity families (P6/R8): identity attaches to family + home region,
// never to names — renamed/merged alliances inherit regional strength.
export interface AllianceMeta {
  name: string;
  color: string;
  family: string;
  ideology: string;
  secondary: string[];
  positions: Position[];
  dominant: Position;
  eu: EUPosition;
  home: DistrictName[];
}

const ALL: Record<AllianceKey, AllianceMeta> = {
  NC: { name: 'National Conservatives', color: '#1f4fd6', family: 'natcon', ideology: 'National Conservatism', secondary: ['National Liberalism'], positions: ['Right Wing'], dominant: 'Right Wing', eu: 'Soft Anti-EU', home: ['Vidzeme', 'Zemgale', 'Valmiera', 'Cēsis', 'Jēkabpils', 'Jelgava', 'Greater Liepāja'] },
  PopR: { name: 'Popular Renewal', color: '#2e9bd6', family: 'liberal-right', ideology: 'Liberal Conservatism', secondary: ['Regionalism'], positions: ['Center Right'], dominant: 'Center Right', eu: 'Pro-EU', home: ['Pierīga', 'Kurzeme', 'Jūrmala'] },
  LA: { name: 'Left Alliance', color: '#c22f2f', family: 'industrial-left', ideology: 'Left-Wing Populism', secondary: ['Anti-Austerity Politics', 'Social Democracy'], positions: ['Left Wing'], dominant: 'Left Wing', eu: 'Soft Anti-EU', home: ['Daugavpils', 'Greater Daugavpils', 'Liepāja', 'Jelgava'] },
  ProLP: { name: 'Progressive Labour Party', color: '#e05612', family: 'urban-left', ideology: 'Progressivism', secondary: ['Social Democracy'], positions: ['Center Left'], dominant: 'Center Left', eu: 'Pro-EU', home: ['Riga'] },
  RS: { name: 'The Right Side', color: '#3d3d8f', family: 'national-right', ideology: 'Right-Wing Libertarianism', secondary: ['Economic Nationalism'], positions: ['Right Wing'], dominant: 'Right Wing', eu: 'Hard Anti-EU', home: ['Riga'] },
  NCen: { name: 'New Center', color: '#e6c521', family: 'center', ideology: 'Centrism', secondary: ['Populism'], positions: ['Center'], dominant: 'Center', eu: 'Pro-EU', home: ['Riga'] },
  TfL: { name: 'Together for Latvia!', color: '#8a2be2', family: 'latgale-left', ideology: 'Latgalian Regionalism', secondary: ['Minority Interests'], positions: ['Left Wing'], dominant: 'Left Wing', eu: 'Soft Anti-EU', home: ['Latgale', 'Rēzekne', 'Daugavpils', 'Greater Daugavpils'] },
  LO: { name: 'Law and Order', color: '#4a4a4a', family: 'law-right', ideology: 'Right Statism', secondary: ['Anti-Immigration'], positions: ['Right Wing'], dominant: 'Right Wing', eu: 'Soft Anti-EU', home: ['Riga'] },
  HtSR: { name: 'Honour to Serve Riga', color: '#16a085', family: 'urban-left', ideology: 'Urbanism/YIMBYism', secondary: ['Economic Progressivism'], positions: ['Big Tent'], dominant: 'Big Tent', eu: 'Pro-EU', home: ['Riga'] },
  RB: { name: 'Red Bloc', color: '#b01e1e', family: 'far-left', ideology: 'Socialism', secondary: ['Labourism'], positions: ['Left Wing', 'Far Left'], dominant: 'Left Wing', eu: 'Hard Anti-EU', home: ['Daugavpils', 'Liepāja'] },
  SocU: { name: 'Social Union', color: '#7d6608', family: 'christian-center', ideology: 'Christian Democracy', secondary: ['Distributism'], positions: ['Center', 'Center Right'], dominant: 'Center', eu: 'Pro-EU', home: ['Latgale', 'Rēzekne'] },
  'F!': { name: 'Forwards!', color: '#f39c12', family: 'localist-center', ideology: 'Localism', secondary: ['Anti-Corruption'], positions: ['Big Tent'], dominant: 'Big Tent', eu: 'Pro-EU', home: ['Valmiera', 'Jēkabpils'] },
  GD: { name: 'Golden Dawn', color: '#c9a227', family: 'far-right-popul', ideology: 'Ethnic Nationalism', secondary: ['Right-Wing Populism'], positions: ['Far Right'], dominant: 'Far Right', eu: 'Hard Anti-EU', home: ['Riga'] },
  LatC: { name: 'Latgalian Congress', color: '#2f7d32', family: 'latgale-right', ideology: 'Latgalian Regionalism', secondary: ['Rural Interests'], positions: ['Right Wing', 'Center Right'], dominant: 'Right Wing', eu: 'Soft Anti-EU', home: ['Latgale', 'Rēzekne', 'Daugavpils'] },
  UoGaF: { name: 'Union of Greens and Farmers', color: '#7cba5c', family: 'agrarian-center', ideology: 'Green Liberalism', secondary: ['Left-Agrarianism'], positions: ['Center'], dominant: 'Center', eu: 'Pro-EU', home: ['Zemgale', 'Jēkabpils'] },
  Inn: { name: 'Innovations', color: '#5d1451', family: 'far-right-popul', ideology: 'Right-Wing Populism', secondary: ['Anti-Environmentalism'], positions: ['Far Right', 'Right Wing'], dominant: 'Far Right', eu: 'Hard Anti-EU', home: ['Riga'] },
  DemI: { name: 'Democratic Initiative', color: '#8395a7', family: 'paternal-center', ideology: 'Paternalistic Conservatism', secondary: ['Civic Nationalism'], positions: ['Center Right', 'Center'], dominant: 'Center Right', eu: 'Pro-EU', home: ['Vidzeme', 'Valmiera', 'Zemgale', 'Kurzeme', 'Cēsis', 'Jēkabpils', 'Jelgava', 'Greater Liepāja'] },
  SocI: { name: 'Social Initiative', color: '#ffa100', family: 'paternal-center', ideology: 'Paternalistic Conservatism', secondary: ['Christian Democracy'], positions: ['Center'], dominant: 'Center', eu: 'Pro-EU', home: ['Vidzeme', 'Zemgale', 'Kurzeme', 'Cēsis', 'Valmiera'] },
  FC: { name: 'Freedom Caucus', color: '#7030a0', family: 'national-right', ideology: 'Right-Wing Populism', secondary: ['Right Statism'], positions: ['Far Right', 'Right Wing'], dominant: 'Far Right', eu: 'Hard Anti-EU', home: ['Riga'] },
  ALC: { name: 'All Latvian Congress', color: '#469fa5', family: 'latgale-right', ideology: 'Latgalian Regionalism', secondary: ['Rural Interests'], positions: ['Right Wing', 'Center Right'], dominant: 'Right Wing', eu: 'Soft Anti-EU', home: ['Latgale', 'Rēzekne', 'Daugavpils'] },
  Sov: { name: 'Sovereign', color: '#556b2f', family: 'sovereign-right', ideology: 'Right Statism', secondary: ['Economic Nationalism'], positions: ['Right Wing'], dominant: 'Right Wing', eu: 'Hard Anti-EU', home: ['Riga'] },
  Alt: { name: 'Alternative', color: '#7f8c8d', family: 'russian-interests', ideology: 'Russian Interests', secondary: ['Conservativism'], positions: ['Syncretic'], dominant: 'Syncretic', eu: 'Hard Anti-EU', home: ['Daugavpils'] },
  IndL: { name: 'Independent Left', color: '#8e44ad', family: 'far-left', ideology: 'Marxism', secondary: ['Socialism'], positions: ['Far Left'], dominant: 'Far Left', eu: 'Hard Anti-EU', home: ['Riga'] },
  CitM: { name: 'Citizens Movement', color: '#58d68d', family: 'citizen-center', ideology: 'Centrism', secondary: ['Localism'], positions: ['Center'], dominant: 'Center', eu: 'Pro-EU', home: ['Pierīga'] },
  SocD: { name: 'The Social Democrats', color: '#fe0000', family: 'social-dem', ideology: 'Social Democracy', secondary: ['Welfarism'], positions: ['Center Left'], dominant: 'Center Left', eu: 'Soft Anti-EU', home: ['Liepāja', 'Jelgava', 'Greater Liepāja'] },
  Prog: { name: 'Progress', color: '#1abc9c', family: 'urban-left', ideology: 'Progressivism', secondary: ['Green Politics'], positions: ['Center Left'], dominant: 'Center Left', eu: 'Pro-EU', home: ['Riga'] },
  'OH!': { name: 'Our Home!', color: '#9de055', family: 'urban-tent', ideology: 'Urbanism/YIMBYism', secondary: ['Economic Progressivism'], positions: ['Big Tent'], dominant: 'Big Tent', eu: 'Pro-EU', home: ['Riga'] },
  PC: { name: 'Peoples Current', color: '#af7ac5', family: 'right-statist', ideology: 'Right Statism', secondary: ['Conservativism'], positions: ['Right Wing'], dominant: 'Right Wing', eu: 'Soft Anti-EU', home: ['Riga', 'Daugavpils'] },
  UFP: { name: 'United Farmers Party', color: '#27ae60', family: 'agrarian-right', ideology: 'Conservative Agrarianism', secondary: ['Agrarianism'], positions: ['Right Wing'], dominant: 'Right Wing', eu: 'Soft Anti-EU', home: ['Zemgale'] },
  Uni: { name: 'Unity', color: '#5dade2', family: 'third-way', ideology: 'Third Way', secondary: ['Civic Plurinationalism'], positions: ['Center Right', 'Center'], dominant: 'Center Right', eu: 'Pro-EU', home: ['Riga'] },
  RepC: { name: 'Republican Coalition', color: '#0e8845', family: 'urban-left', ideology: 'Progressivism', secondary: ['Urbanism/YIMBYism', 'Minority Interests'], positions: ['Center Left'], dominant: 'Center Left', eu: 'Pro-EU', home: ['Riga'] },
  'Lib!': { name: 'Liberty!', color: '#f5b041', family: 'liberal', ideology: 'Liberalism', secondary: [], positions: ['Center Right'], dominant: 'Center Right', eu: 'Pro-EU', home: ['Riga'] },
  LibF: { name: 'Liberal Forum', color: '#3498db', family: 'liberal', ideology: 'Social Liberalism', secondary: [], positions: ['Center', 'Center Left'], dominant: 'Center', eu: 'Pro-EU', home: ['Riga'] },
};

export interface ElectionData {
  id: string;
  label: string;
  saeima: string;              // verbatim seat line
  blocs: { key: string; name: string; color: string; members: AllianceKey[] }[];
  districts: string[];          // verbatim district lines
  prevGovernors?: string[];    // verbatim "DIST: Key" lines from the previous election
}

export const ELECTIONS: ElectionData[] = [
  {
    id: 'saeima-20',
    label: '20th Saeima — Right-Wing Government',
    saeima: 'NC57G PopR53G LA31O ProLP29O RS27G NCen19C TfL13O LO12G HtSR11O RB11O SocU9O F!9C GD8C LatC6G UoGaF3C Inn3C',
    blocs: [
      { key: 'ourrep20', name: 'Our Republic!', color: '#a1193c', members: ['LA', 'ProLP', 'TfL', 'HtSR', 'RB'] },
      { key: 'newmod20', name: 'New Moderates', color: '#ffdb2e', members: ['NCen', 'SocU', 'F!', 'UoGaF'] },
      { key: 'peoples20', name: 'Peoples Coalition', color: '#00215f', members: ['NC', 'PopR', 'RS', 'LatC'] },
      { key: 'unitedright20', name: 'United Right', color: '#ffdb2e', members: ['GD', 'Inn', 'LO'] },
    ],
    districts: [
      'RIG: RB1 LA2 ProLP4 HtSR6 NCen3 PopR2 NC2 RS3 GD1 LO1 | Gov: ProLP',
      'PIE: NCen1 PopR2 NC2 RS1 LO1 | Gov: PopR',
      'VID: NCen1 PopR3 NC5 RS1 | Gov: NC',
      'LAT: TfL2 LA2 NCen1 SocU1 PopR1 LatC2 NC1 RS1 | Gov: LatC',
      'GDA: RB1 TfL1 LA1 SocU1 PopR1 NC1 | Gov: LA',
      'ZEM: ProLP1 PopR3 NC3 RS1 | Gov: NC',
      'GJE: ProLP1 PopR1 NC1 RS1 | Gov: PopR',
      'KUR: ProLP1 PopR2 NC3 RS1 | Gov: PopR',
      'GLI: ProLP1 PopR2 NC2 | Gov: NC',
      'DAU: RB1 TfL1 LA4 ProLP1 NCen1 PopR1 NC1 RS1 LO1 | Gov: LA',
      'LIE: RB1 LA3 ProLP1 NCen1 PopR1 NC1 RS1 LO1 | Gov: LA',
      'JEL: RB1 LA1 ProLP1 NCen1 PopR1 NC1 RS1 LO1 | Gov: NC',
      'JUR: ProLP1 HtSR1 NCen1 PopR2 NC1 RS1 | Gov: PopR',
      'VEN: ProLP1 NCen1 PopR1 NC1 RS1 | Gov: PopR',
      'REZ: TfL1 LA1 SocU1 LatC1 NC1 | Gov: TfL',
      'VAL: ProLP1 F!1 PopR1 NC2 | Gov: NC',
      'JEK: F!1 PopR1 NC1 RS1 | Gov: NC',
      'CES: PopR2 NC2 | Gov: NC',
      'OUT: LA1 ProLP1 NCen1 PopR1 NC2 RS1 | no governor',
    ],
  },
  {
    id: 'saeima-21',
    label: '21st Saeima — Left-Wing Government',
    saeima: 'LA73G NC30O PopR27O ProLP27G TfL21G NCen18C DemI17C HtSR15G RS14O RB13S SocU11C F!7S GD7O Lib!5C UoGaF5C LO4O Inn4O LatC3C',
    blocs: [
      { key: 'ourrep21', name: 'Our Republic!', color: '#a1193c', members: ['LA', 'ProLP', 'TfL', 'HtSR', 'RB'] },
      { key: 'newmod21', name: 'New Moderates', color: '#ffdb2e', members: ['NCen', 'DemI', 'SocU', 'F!', 'UoGaF'] },
      { key: 'alc21', name: 'All Latvian Congress', color: '#469fa5', members: ['PopR', 'LatC'] },
      { key: 'unitedright21', name: 'United Right', color: '#ffff00', members: ['RS', 'GD', 'Inn', 'LO'] },
    ],
    districts: [
      'RIG: RB1 TfL2 LA5 ProLP3 HtSR6 NCen2 Lib!1 DemI2 PopR1 RS1 GD1 | Gov: LA',
      'PIE: HtSR1 NCen1 DemI1 PopR1 NC1 RS1 GD1 | Gov: DemI',
      'VID: LA1 NCen1 SocU1 DemI1 PopR2 NC3 RS1 | Gov: NC',
      'LAT: TfL4 LA3 ProLP1 NCen1 SocU1 NC1 | Gov: TfL',
      'GDA: RB1 TfL2 LA2 SocU1 | Gov: LA',
      'ZEM: LA1 ProLP1 SocU1 DemI1 PopR1 NC2 RS1 | Gov: NC',
      'GJE: LA1 ProLP1 PopR1 NC1 | Gov: LA',
      'KUR: LA1 ProLP1 NCen1 DemI1 PopR1 NC1 RS1 | Gov: PopR',
      'GLI: LA1 ProLP1 DemI1 PopR1 NC1 | Gov: LA',
      'DAU: RB1 TfL2 LA6 ProLP1 NCen1 SocU1 | Gov: LA',
      'LIE: RB1 LA6 ProLP1 NCen1 DemI1 | Gov: LA',
      'JEL: RB1 LA3 ProLP1 NCen1 DemI1 NC1 | Gov: LA',
      'JUR: LA1 ProLP1 HtSR1 NCen1 DemI1 PopR1 RS1 | Gov: LA',
      'VEN: LA1 ProLP1 NCen1 DemI1 PopR1 | Gov: LA',
      'REZ: TfL2 LA2 SocU1 | Gov: TfL',
      'VAL: LA1 NCen1 F!1 PopR1 unknown1 | Gov: F!',   // 21st Valmiera: 4 of 5 seats listed (source flag)
      'JEK: LA1 ProLP1 SocU1 NC1 | Gov: LA',
      'CES: LA1 DemI1 PopR1 NC1 | Gov: NC',
      'OUT: LA2 ProLP1 DemI1 PopR1 NC1 RS1 | no governor',
    ],
    prevGovernors: [
      'RIG: ProLP', 'PIE: PopR', 'VID: NC', 'LAT: LatC', 'GDA: LA', 'ZEM: NC', 'GJE: PopR',
      'KUR: PopR', 'GLI: NC', 'DAU: LA', 'LIE: LA', 'JEL: NC', 'JUR: PopR', 'VEN: PopR',
      'REZ: TfL', 'VAL: NC', 'JEK: NC', 'CES: NC',
    ],
  },
  {
    id: 'saeima-22',
    label: '22nd Saeima — Left-Wing Government',
    saeima: 'LA63G NC35O ProLP28G SocI25C TfL25G NCen23C HtSR21G FC19O RB16S RS11O PopR9C F!8C ALC7O Lib!4C UoGaF4C Sov3O',
    blocs: [
      { key: 'ourrep22', name: 'Our Republic!', color: '#a1193c', members: ['LA', 'ProLP', 'TfL', 'HtSR', 'RB'] },
      { key: 'newmod22', name: 'New Moderates', color: '#ffa100', members: ['SocI', 'NCen', 'F!', 'UoGaF'] },
      { key: 'peoples22', name: 'Peoples Coalition', color: '#469fa5', members: ['PopR', 'LatC'] },
      { key: 'unitedright22', name: 'United Right', color: '#7030a0', members: ['FC', 'RS'] },
    ],
    districts: [
      'RIG: RB1 LA4 ProLP3 HtSR8 NCen4 SocI2 NC1 RS1 FC1 | Gov: HtSR',
      'PIE: ProLP1 HtSR1 NCen1 SocI1 PopR1 NC1 RS1 FC1 | Gov: SocI',  // 22nd Pierīga: 8 entries for 7 seats (source flag)
      'VID: LA1 ProLP1 NCen1 F!1 SocI1 PopR1 NC3 FC1 | Gov: NC',
      'LAT: RB1 TfL4 LA2 Sov1 NCen1 NC2 | Gov: TfL',
      'GDA: RB1 TfL2 LA2 ALC1 | Gov: LA',
      'ZEM: LA1 ProLP1 NCen1 SocI1 PopR1 NC2 FC1 | Gov: NC',
      'GJE: LA1 ProLP1 SocI1 NC1 | Gov: LA',
      'KUR: LA1 ProLP1 NCen1 SocI1 NC2 FC1 | Gov: NC',
      'GLI: LA1 ProLP1 SocI1 NC1 FC1 | Gov: LA',
      'DAU: RB1 TfL3 LA5 ProLP1 NCen1 NC1 | Gov: LA',
      'LIE: RB2 LA5 ProLP1 NCen1 NC1 | Gov: LA',
      'JEL: RB1 LA3 ProLP1 NCen1 SocI1 FC1 | Gov: LA',
      'JUR: LA1 ProLP1 HtSR1 NCen1 F!1 SocI1 RS1 | Gov: LA',
      'VEN: LA1 ProLP1 NCen1 SocI1 NC1 | Gov: LA',
      'REZ: TfL3 LA1 ALC1 | Gov: TfL',
      'VAL: ProLP1 NCen1 F!1 SocI1 NC1 | Gov: F!',
      'JEK: TfL1 LA1 SocI1 NC1 | Gov: LA',
      'CES: ProLP1 SocI1 NC2 | Gov: NC',
      'OUT: TfL1 LA2 ProLP1 NCen1 SocI1 NC1 RS1 | no governor',  // 22nd Outside: 8 entries for 7 seats (source flag)
    ],
    prevGovernors: [
      'RIG: LA', 'PIE: DemI', 'VID: NC', 'LAT: TfL', 'GDA: LA', 'ZEM: NC', 'GJE: LA',
      'KUR: PopR', 'GLI: LA', 'DAU: LA', 'LIE: LA', 'JEL: LA', 'JUR: LA', 'VEN: LA',
      'REZ: TfL', 'VAL: F!', 'JEK: LA', 'CES: NC',
    ],
  },
  {
    id: 'saeima-23',
    label: '23rd Saeima — Left-Wing Government',
    saeima: 'LA71G SocI30C NC27O ProLP25G FC22O RB20G NCen19C HtSR19G TfL17G PopR16C RS13O CitM7C ALC5O Alt4O IndL3O F!3C',
    blocs: [
      { key: 'ourrep23', name: 'Our Republic!', color: '#a1193c', members: ['LA', 'ProLP', 'TfL', 'HtSR', 'RB'] },
      { key: 'newmod23', name: 'New Moderates', color: '#ffa100', members: ['SocI', 'NCen', 'F!'] },
      { key: 'peoples23', name: 'Peoples Coalition', color: '#469fa5', members: ['PopR', 'CitM', 'LatC'] },
      { key: 'unitedright23', name: 'United Right', color: '#7030a0', members: ['FC', 'RS'] },
      { key: 'independence23', name: 'Independence', color: '#206165', members: ['Alt', 'IndL'] },
    ],
    districts: [
      'RIG: RB1 LA5 ProLP3 HtSR8 NCen2 SocI2 RS1 FC3 | Gov: HtSR',
      'PIE: LA1 NCen1 SocI1 CitM1 NC1 RS1 FC1 | Gov: SocI',
      'VID: LA1 ProLP1 NCen1 SocI2 PopR1 NC3 FC1 | Gov: NC',
      'LAT: RB1 TfL3 LA3 ProLP1 NCen1 SocI1 ALC1 | Gov: TfL',
      'GDA: RB1 TfL1 LA3 ALC1 | Gov: LA',
      'ZEM: LA1 ProLP1 NCen1 SocI1 PopR1 NC2 FC1 | Gov: NC',
      'GJE: LA1 ProLP1 SocI1 NC1 | Gov: LA',
      'KUR: LA1 ProLP1 NCen1 SocI1 PopR1 NC1 FC1 | Gov: NC',
      'GLI: LA1 ProLP1 SocI1 NC1 FC1 | Gov: LA',
      'DAU: RB2 Alt1 TfL2 LA5 ProLP1 NCen1 | Gov: LA',
      'LIE: RB2 LA5 ProLP1 NCen1 FC1 | Gov: LA',
      'JEL: RB1 LA4 ProLP1 SocI1 FC1 | Gov: LA',
      'JUR: LA1 ProLP1 HtSR1 NCen1 SocI1 CitM1 RS1 | Gov: LA',
      'VEN: LA1 ProLP1 NCen1 SocI1 FC1 | Gov: LA',
      'REZ: TfL2 LA2 ALC1 | Gov: TfL',
      'VAL: LA1 ProLP1 NCen1 SocI1 NC1 | Gov: SocI',
      'JEK: LA1 ProLP1 SocI1 NC1 | Gov: LA',
      'CES: LA1 SocI1 PopR1 NC1 | Gov: NC',
      'OUT: LA2 ProLP1 SocI1 PopR1 NC1 RS1 | no governor',
    ],
    prevGovernors: [
      'RIG: HtSR', 'PIE: SocI', 'VID: NC', 'LAT: TfL', 'GDA: LA', 'ZEM: NC', 'GJE: LA',
      'KUR: NC', 'GLI: LA', 'DAU: LA', 'LIE: LA', 'JEL: LA', 'JUR: LA', 'VEN: LA',
      'REZ: TfL', 'VAL: F!', 'JEK: LA', 'CES: NC',
    ],
  },
  {
    id: 'saeima-24',
    label: '24th Saeima — Center-Right Government',
    saeima: 'SocI59G NCen43G SocD37G Prog25C NC21O FC16O PopR15C LA15O RB12O OH!11G TfL11O RS9O CitM6C ALC5C PC5O F!5S UFP3C Uni3C',
    blocs: [
      { key: 'ourrep24', name: 'Our Republic!', color: '#068c44', members: ['Prog', 'LA', 'RB', 'OH!', 'TfL'] },
      { key: 'newmod24', name: 'New Moderates', color: '#ffa100', members: ['SocI', 'NCen', 'F!', 'Uni'] },
      { key: 'peoples24', name: 'Peoples Coalition', color: '#479ea7', members: ['PopR', 'CitM', 'ALC', 'UFP'] },
      { key: 'unitedright24', name: 'United Right', color: '#7030a0', members: ['FC', 'RS'] },
    ],
    districts: [
      'RIG: RB1 LA1 Prog7 SocD2 OH!5 NCen4 SocI3 RS1 FC1 | Gov: Prog',
      'PIE: Prog1 NCen1 SocI2 CitM1 NC1 FC1 | Gov: SocI',
      'VID: NCen1 F!1 SocI3 PopR2 NC2 FC1 | Gov: SocI',
      'LAT: RB1 TfL2 LA1 SocD2 NCen2 SocI2 ALC1 | Gov: SocI',
      'GDA: RB1 TfL1 LA1 SocD1 NCen1 SocI1 | Gov: TfL',
      'ZEM: SocD1 NCen1 SocI3 PopR1 NC1 FC1 | Gov: SocI',
      'GJE: SocD1 NCen1 SocI1 PopR1 | Gov: SocI',
      'KUR: SocD1 NCen1 SocI2 PopR1 NC1 FC1 | Gov: SocI',
      'GLI: SocD1 NCen1 SocI1 PopR1 NC1 | Gov: SocI',
      'DAU: RB1 PC1 TfL1 LA2 Prog1 SocD2 NCen2 SocI2 | Gov: LA',
      'LIE: RB1 LA2 SocD2 NCen2 SocI2 FC1 | Gov: LA',
      'JEL: RB1 LA1 SocD2 NCen1 SocI2 FC1 | Gov: SocI',
      'JUR: Prog1 SocD1 OH!1 NCen2 SocI2 | Gov: SocI',
      'VEN: Prog1 SocD1 NCen1 SocI2 | Gov: SocI',
      'REZ: TfL1 SocD1 NCen1 SocI1 ALC1 | Gov: TfL',
      'VAL: NCen1 F!1 SocI1 PopR1 NC1 | Gov: SocI',
      'JEK: SocD1 NCen1 SocI1 NC1 | Gov: SocI',
      'CES: NCen1 SocI1 PopR1 NC1 | Gov: SocI',
      'OUT: SocD1 SocI2 NCen1 PopR1 NC1 RS1 | no governor',
    ],
    prevGovernors: [
      'RIG: HtSR', 'PIE: SocI', 'VID: NC', 'LAT: TfL', 'GDA: LA', 'ZEM: NC', 'GJE: LA',
      'KUR: NC', 'GLI: LA', 'DAU: LA', 'LIE: LA', 'JEL: LA', 'JUR: LA', 'VEN: LA',
      'REZ: TfL', 'VAL: SocI', 'JEK: LA', 'CES: NC',
    ],
  },
  {
    id: 'saeima-25',
    label: '25th Saeima — Left-Wing Government',
    saeima: 'RepC63G SocD31G FC27O LA26G SocI22C TfL21G PopR19C NCen17C NC17O RS13O OH!13G CitM8C ALC7O RB5C LibF5C Uni4C PC3O',
    blocs: [
      { key: 'ourrep25', name: 'Our Republic!', color: '#068c44', members: ['RepC', 'LA', 'RB', 'OH!', 'TfL'] },
      { key: 'newmod25', name: 'New Moderates', color: '#ffa100', members: ['SocI', 'NCen', 'LibF', 'Uni'] },
      { key: 'peoples25', name: 'Peoples Coalition', color: '#479ea7', members: ['PopR', 'CitM', 'ALC'] },
      { key: 'unitedright25', name: 'United Right', color: '#7030a0', members: ['FC', 'RS'] },
    ],
    districts: [
      'RIG: LA1 RepC12 SocD1 LibF1 OH!6 NCen1 SocI1 RS1 FC1 | Gov: RepC',
      'PIE: RepC1 NCen1 SocI1 CitM1 PopR1 RS1 FC1 | Gov: CitM',
      'VID: RepC1 SocD1 NCen1 SocI1 PopR2 NC2 RS1 FC1 | Gov: SocI',
      'LAT: TfL4 LA1 RepC1 SocD1 NCen1 SocI1 ALC2 | Gov: TfL',
      'GDA: TfL2 LA1 SocD1 ALC1 | Gov: TfL',   // 25th Greater Daugavpils: 5 of 6 seats listed (source flag)
      'ZEM: RepC1 SocD1 NCen1 SocI1 PopR1 NC1 RS1 FC1 | Gov: SocI',
      'GJE: RepC1 SocD1 SocI1 FC1 | Gov: SocI',
      'KUR: RepC1 SocD1 NCen1 SocI1 PopR1 NC1 FC1 | Gov: SocI',
      'GLI: RepC1 SocI1 PopR1 NC1 FC1 | Gov: SocI',
      'DAU: RB2 TfL2 LA3 RepC1 SocD2 RS1 FC1 | Gov: TfL',
      'LIE: RB1 LA2 RepC2 SocD2 NCen1 SocI1 FC1 | Gov: LA',
      'JEL: LA1 RepC2 SocD2 NCen1 SocI1 FC1 | Gov: RepC',
      'JUR: RepC3 OH!1 NCen1 RS1 FC1 | Gov: RepC',
      'VEN: RepC2 NCen1 SocI1 FC1 | Gov: RepC',
      'REZ: TfL2 RepC1 SocD1 ALC1 | Gov: TfL',
      'VAL: RepC1 SocD1 NCen1 SocI1 FC1 | Gov: SocI',
      'JEK: RepC1 SocD1 SocI1 FC1 | Gov: SocI',
      'CES: RepC1 SocI1 PopR1 NC1 | Gov: SocI',
      'OUT: RepC1 SocD1 SocI1 NCen1 PopR1 NC1 RS1 | no governor',
    ],
    prevGovernors: [
      'RIG: Prog', 'PIE: SocI', 'VID: SocI', 'LAT: SocI', 'GDA: TfL', 'ZEM: SocI', 'GJE: SocI',
      'KUR: SocI', 'GLI: SocI', 'DAU: LA', 'LIE: LA', 'JEL: SocI', 'JUR: SocI', 'VEN: SocI',
      'REZ: TfL', 'VAL: SocI', 'JEK: SocI', 'CES: SocI',
    ],
  },
];

// ---------------- Parsing ----------------

export interface ParsedDistrict {
  district: DistrictName;
  seats: Partial<Record<AllianceKey | 'unknown', number>>;
  governor: AllianceKey | null;
  totalSeats: number;
  flagged: boolean;
}

const DISTRICT_ABBR: Record<string, DistrictName> = {
  RIG: 'Riga', PIE: 'Pierīga', VID: 'Vidzeme', ZEM: 'Zemgale', GJE: 'Greater Jelgava',
  LAT: 'Latgale', GDA: 'Greater Daugavpils', KUR: 'Kurzeme', GLI: 'Greater Liepāja',
  DAU: 'Daugavpils', LIE: 'Liepāja', JEL: 'Jelgava', JUR: 'Jūrmala', VEN: 'Ventspils',
  REZ: 'Rēzekne', VAL: 'Valmiera', JEK: 'Jēkabpils', CES: 'Cēsis', OUT: 'Living Outside Latvia',
};

export function parseDistrictLine(line: string): ParsedDistrict {
  const [left, govPart] = line.split('|');
  const [abbr, seatPart] = left.split(':');
  const seats: Partial<Record<AllianceKey | 'unknown', number>> = {};
  let totalSeats = 0;
  for (const tok of seatPart.trim().split(/\s+/)) {
    const m = tok.match(/^([A-Za-z!]+)(\d+)$/);
    if (!m) continue;
    const key = m[1] as AllianceKey;
    const n = +m[2];
    seats[key] = (seats[key] ?? 0) + n;
    totalSeats += n;
  }
  const govMatch = govPart?.match(/Gov:\s*(\S+)/);
  const governor = govMatch && govMatch[1] !== 'no' ? (govMatch[1] as AllianceKey) : null;
  return { district: DISTRICT_ABBR[abbr], seats, governor, totalSeats, flagged: false };
}

export function parseSaeimaLine(line: string): { key: AllianceKey; seats: number; status: SaeimaStatus }[] {
  const out: { key: AllianceKey; seats: number; status: SaeimaStatus }[] = [];
  for (const tok of line.trim().split(/\s+/)) {
    const m = tok.match(/^([A-Za-z!]+)(\d+)([GOCS])$/);
    if (!m) continue;
    const status: SaeimaStatus =
      m[3] === 'G' ? 'Government' : m[3] === 'O' ? 'Opposition' :
      m[3] === 'C' ? 'Cross-bench' : 'Supply and Confidence';
    out.push({ key: m[1] as AllianceKey, seats: +m[2], status });
  }
  return out;
}

// ---------------- Scenario builder ----------------

const ALL_DISTRICTS = [
  'Riga', 'Pierīga', 'Vidzeme', 'Zemgale', 'Greater Jelgava', 'Latgale',
  'Greater Daugavpils', 'Kurzeme', 'Greater Liepāja', 'Daugavpils', 'Liepāja',
  'Jelgava', 'Jūrmala', 'Ventspils', 'Rēzekne', 'Valmiera', 'Jēkabpils', 'Cēsis',
  'Living Outside Latvia',
] as DistrictName[];

export function buildHistoricalScenario(e: ElectionData): Scenario {
  const saeima = parseSaeimaLine(e.saeima);
  const parties: Party[] = [];
  const alliances: Alliance[] = [];
  for (const { key, seats, status } of saeima) {
    const meta = ALL[key];
    const pid = `hp-${e.id}-${key}`;
    parties.push({
      id: pid, name: meta.name, ideology: meta.ideology, secondaryIdeologies: meta.secondary,
      positions: meta.positions, dominantPosition: meta.dominant, euPosition: meta.eu,
      euroGroup: 'NI', saeimaSeats: seats, homeDistricts: meta.home, homeConcentration: 1,
      runningDistricts: [], allianceId: 'ha-' + key, color: meta.color,
    });
    alliances.push({
      id: 'ha-' + key, name: meta.name, color: meta.color, memberPartyIds: [pid],
      autoIdeology: true, autoPosition: true, autoEuPosition: true,
      runningDistricts: ALL_DISTRICTS, saeimaStatus: status, regionalAllianceId: null,
    });
  }
  const regionalAlliances: RegionalAlliance[] = e.blocs.map((b) => ({
    id: 'hb-' + b.key, name: b.name, color: b.color,
    memberAllianceIds: b.members.filter((m) => saeima.some((s) => s.key === m)).map((m) => 'ha-' + m),
  }));
  for (const a of alliances) {
    for (const b of regionalAlliances) if (b.memberAllianceIds.includes(a.id)) a.regionalAllianceId = b.id;
  }
  // Incumbent governors from the previous election, resolved by key or family
  const incumbentGovernors: Partial<Record<DistrictName, string | null>> = {};
  if (e.prevGovernors) {
    for (const line of e.prevGovernors) {
      const [abbr, keyRaw] = line.split(':');
      const key = keyRaw.trim() as AllianceKey;
      const district = DISTRICT_ABBR[abbr.trim()];
      const exists = saeima.some((s) => s.key === key);
      if (exists) { incumbentGovernors[district] = 'ha-' + key; continue; }
      const prevFamily = ALL[key]?.family;
      const heir = saeima.find((s) => ALL[s.key].family === prevFamily);
      if (heir) incumbentGovernors[district] = 'ha-' + heir.key;
    }
  }
  return {
    id: e.id, name: e.label, createdAt: 0, seed: 20 + ELECTIONS.indexOf(e),
    parties, alliances, regionalAlliances,
    weights: { ...DEFAULT_WEIGHTS }, overrides: [], incumbentGovernors,
    saeimaTotalSeats: 301, results: null,
  };
}

// Ground truth for the validation harness
export interface GroundTruth {
  election: ElectionData;
  scenario: Scenario;
  districts: ParsedDistrict[];
  governors: Partial<Record<DistrictName, AllianceKey>>;
  councilorTotals: Partial<Record<AllianceKey, number>>;
  coorTotal: number;
  governorCount: number;
  flags: string[];
}

export function buildGroundTruth(e: ElectionData): GroundTruth {
  const districts = e.districts.map(parseDistrictLine);
  const governors: Partial<Record<DistrictName, AllianceKey>> = {};
  const councilorTotals: Partial<Record<AllianceKey, number>> = {};
  let coorTotal = 0;
  const flags: string[] = [];
  const expectedSeats: Record<string, number> = {
    Riga: 25, Pierīga: 7, Vidzeme: 10, Zemgale: 8, 'Greater Jelgava': 4,
    Latgale: 11, 'Greater Daugavpils': 6, Kurzeme: 7, 'Greater Liepāja': 5,
    Daugavpils: 12, Liepāja: 10, Jelgava: 8, Jūrmala: 7, Ventspils: 5,
    Rēzekne: 5, Valmiera: 5, Jēkabpils: 4, Cēsis: 4, 'Living Outside Latvia': 7,
  };
  for (const d of districts) {
    if ((d.seats as Record<string, number>).unknown)
      flags.push(`${e.label} ${d.district}: ${d.totalSeats - 1} of ${expectedSeats[d.district]} seats listed; 1 seat unattributed in source (stored as "unknown 1 seat")`);
    if (d.totalSeats !== expectedSeats[d.district])
      flags.push(`${e.label} ${d.district}: ${d.totalSeats} of ${expectedSeats[d.district]} seats listed (stored verbatim)`);
    coorTotal += d.totalSeats;
    if (d.governor) governors[d.district] = d.governor;
    for (const [k, n] of Object.entries(d.seats)) {
      councilorTotals[k as AllianceKey] = (councilorTotals[k as AllianceKey] ?? 0) + (n ?? 0);
    }
  }
  return {
    election: e,
    scenario: buildHistoricalScenario(e),
    districts,
    governors,
    councilorTotals,
    coorTotal,
    governorCount: Object.keys(governors).length,
    flags,
  };
}

export const GROUND_TRUTHS: GroundTruth[] = ELECTIONS.map(buildGroundTruth);

export function allianceMeta(key: AllianceKey): AllianceMeta {
  return ALL[key];
}
