import type { District, DistrictName, Weights, Position, EUPosition } from '../types';

export const POSITIONS: Position[] = [
  'Far Left', 'Left Wing', 'Center Left', 'Center',
  'Center Right', 'Right Wing', 'Far Right', 'Big Tent', 'Syncretic',
];

export const POSITION_NUMERIC: Record<string, number> = {
  'Far Left': -3, 'Left Wing': -2, 'Center Left': -1, 'Center': 0,
  'Center Right': 1, 'Right Wing': 2, 'Far Right': 3,
};

export const EU_POSITIONS: EUPosition[] = ['Hard Anti-EU', 'Soft Anti-EU', 'Pro-EU'];

export const EURO_GROUPS = ['EPP', 'S&D', 'PfE', 'ECR', 'Renew', 'Greens', 'EFA', 'LEFT', 'ESN', 'NI'] as const;

export const IDEOLOGIES: string[] = [
  // Ordered far-left -> far-right, with spectrum-external ideologies at the bottom.
  'Marxism',
  'Socialism',
  'Democratic Socialism',
  'Labourism',
  'Left-Wing Populism',
  'Left-Wing Nationalism',
  'Anti-Austerity Politics',
  'Left-Agrarianism',
  'Social Democracy',
  'Progressivism',
  'Green Politics',
  'Welfarism',
  'Economic Progressivism',
  'Social Liberalism',
  'Green Liberalism',
  'Liberalism',
  'Third Way',
  'Centrism',
  'Pirate Politics/Digital Rights',
  'Civic Libertarianism',
  'Progressive Conservatism',
  'Distributism',
  'Christian Democracy',
  'Paternalistic Conservatism',
  'Conservativism',
  'Left-Wing Conservativism',
  'Classical Liberalism',
  'Liberal Conservatism',
  'Conservative Liberalism',
  'Urbanism/YIMBYism',
  'Anti-Corruption',
  'Agrarianism',
  'Conservative Agrarianism',
  'Rural Interests',
  'Civic Nationalism',
  'Regionalism',
  'Localism',
  'National Liberalism',
  'National Conservatism',
  'Social Conservatism',
  'Christian Traditionalism',
  'Economic Nationalism',
  'Libertarianism',
  'Right-Wing Libertarianism',
  'Neo-Liberalism',
  'Right Statism',
  'Right-Wing Populism',
  'Anti-Immigration',
  'Ethnic Nationalism',
  'Anti-Environmentalism',
  // --- outside the left-right spectrum ---
  'Populism',
  'Pensioners Interests',
  'Lību Interests',
  'Russian Interests',
  'Youth Interests',
  'Immigrant Interests',
  'Minority Interests',
  'Civic Plurinationalism',
  'Latgalian Regionalism',
  'Latgalian Separatism',
  'EU Federalism',
];

export const SAEMA_TOTAL = 301;
export const COR_TOTAL = 150;
export const GOVERNOR_COUNT = 18;

export const DISTRICT_SEATS: Record<DistrictName, number> = {
  'Riga': 25, 'Pierīga': 7, 'Vidzeme': 10, 'Zemgale': 8, 'Greater Jelgava': 4,
  'Latgale': 11, 'Greater Daugavpils': 6, 'Kurzeme': 7, 'Greater Liepāja': 5,
  'Daugavpils': 12, 'Liepāja': 10, 'Jelgava': 8, 'Jūrmala': 7, 'Ventspils': 5,
  'Rēzekne': 5, 'Valmiera': 5, 'Jēkabpils': 4, 'Cēsis': 4, 'Living Outside Latvia': 7,
};

export const DISTRICT_ORDER: DistrictName[] = [
  'Riga', 'Pierīga', 'Vidzeme', 'Zemgale', 'Greater Jelgava', 'Latgale',
  'Greater Daugavpils', 'Kurzeme', 'Greater Liepāja', 'Daugavpils', 'Liepāja',
  'Jelgava', 'Jūrmala', 'Ventspils', 'Rēzekne', 'Valmiera', 'Jēkabpils', 'Cēsis',
  'Living Outside Latvia',
];

export function defaultDistrictTraits(d: DistrictName): any {
  const population: Record<DistrictName, number> = {
    Riga: 6.2, Pierīga: 1.9, Vidzeme: 2.6, Zemgale: 2.1, 'Greater Jelgava': 1.0,
    Latgale: 3.0, 'Greater Daugavpils': 1.5, Kurzeme: 1.8, 'Greater Liepāja': 1.3,
    Daugavpils: 3.3, Liepāja: 2.6, Jelgava: 2.1, Jūrmala: 2.0, Ventspils: 1.2,
    Rēzekne: 1.3, Valmiera: 1.3, Jēkabpils: 1.0, Cēsis: 1.1, 'Living Outside Latvia': 2.7,
  };
  const base = {
    Riga: { urbanization: 10, income: 8.5, education: 9, elderly: 4, religiosity: 3, agrarian: 0, heavyIndustry: 2, services: 10, coastal: 2, transit: 8, minority: 6, latgalianIdentity: 0, euEnthusiasm: 8.5, lean: -0.3 },
    Pierīga: { urbanization: 7, income: 7.5, education: 7.5, elderly: 4, religiosity: 3, agrarian: 1, heavyIndustry: 2, services: 8, coastal: 2, transit: 8, minority: 4, latgalianIdentity: 0, euEnthusiasm: 8, lean: -0.3 },
    Vidzeme: { urbanization: 3, income: 5, education: 5.5, elderly: 7, religiosity: 6, agrarian: 6, heavyIndustry: 2, services: 4, coastal: 1, transit: 5, minority: 2, latgalianIdentity: 0, euEnthusiasm: 6, lean: 0.2 },
    Zemgale: { urbanization: 3, income: 5, education: 5, elderly: 7, religiosity: 6, agrarian: 8, heavyIndustry: 2, services: 3.5, coastal: 0, transit: 6, minority: 3, latgalianIdentity: 0, euEnthusiasm: 5.5, lean: 0.3 },
    'Greater Jelgava': { urbanization: 5, income: 5.5, education: 5.5, elderly: 6, religiosity: 5, agrarian: 7, heavyIndustry: 3, services: 5, coastal: 0, transit: 6, minority: 3, latgalianIdentity: 0, euEnthusiasm: 6, lean: 0.2 },
    Latgale: { urbanization: 2, income: 3.5, education: 4.5, elderly: 8, religiosity: 9, agrarian: 7, heavyIndustry: 4, services: 2, coastal: 0, transit: 5, minority: 8, latgalianIdentity: 9, euEnthusiasm: 4, lean: 0.8 },
    'Greater Daugavpils': { urbanization: 4, income: 4, education: 4.5, elderly: 7, religiosity: 8, agrarian: 5, heavyIndustry: 6, services: 3, coastal: 0, transit: 5, minority: 9, latgalianIdentity: 7, euEnthusiasm: 4, lean: 0.8 },
    Kurzeme: { urbanization: 4, income: 6, education: 6, elderly: 6, religiosity: 4.5, agrarian: 4, heavyIndustry: 5, services: 5, coastal: 9, transit: 5, minority: 3, latgalianIdentity: 0, euEnthusiasm: 6.5, lean: 0.1 },
    'Greater Liepāja': { urbanization: 5, income: 5.5, education: 5.5, elderly: 7, religiosity: 5, agrarian: 3, heavyIndustry: 6, services: 4.5, coastal: 8, transit: 3, minority: 5, latgalianIdentity: 0, euEnthusiasm: 6, lean: 0.2 },
    Daugavpils: { urbanization: 5, income: 4, education: 4.5, elderly: 7, religiosity: 8, agrarian: 4, heavyIndustry: 5, services: 3, coastal: 0, transit: 6, minority: 10, latgalianIdentity: 8, euEnthusiasm: 4, lean: 0.8 },
    Liepāja: { urbanization: 6, income: 6, education: 6, elderly: 6.5, religiosity: 4.5, agrarian: 2, heavyIndustry: 6, services: 5.5, coastal: 9, transit: 3, minority: 6, latgalianIdentity: 0, euEnthusiasm: 7, lean: 0.1 },
    Jelgava: { urbanization: 6, income: 6, education: 6, elderly: 5.5, religiosity: 4.5, agrarian: 5, heavyIndustry: 3, services: 6, coastal: 0, transit: 6, minority: 3, latgalianIdentity: 0, euEnthusiasm: 6.5, lean: 0.1 },
    Jūrmala: { urbanization: 8, income: 7.5, education: 7, elderly: 7, religiosity: 3, agrarian: 0.5, heavyIndustry: 0.5, services: 7.5, coastal: 7, transit: 4, minority: 5, latgalianIdentity: 0, euEnthusiasm: 8, lean: -0.4 },
    Ventspils: { urbanization: 6, income: 6.5, education: 5.5, elderly: 6, religiosity: 4.5, agrarian: 2, heavyIndustry: 4, services: 5, coastal: 9, transit: 7, minority: 4, latgalianIdentity: 0, euEnthusiasm: 6.5, lean: 0.1 },
    Rēzekne: { urbanization: 4, income: 4, education: 4.5, elderly: 7.5, religiosity: 8.5, agrarian: 5, heavyIndustry: 4, services: 3, coastal: 0, transit: 5, minority: 9, latgalianIdentity: 9, euEnthusiasm: 4, lean: 0.8 },
    Valmiera: { urbanization: 5, income: 6, education: 6, elderly: 6, religiosity: 5, agrarian: 5, heavyIndustry: 4, services: 5.5, coastal: 1, transit: 5, minority: 2, latgalianIdentity: 0, euEnthusiasm: 6.5, lean: 0.4 },
    Jēkabpils: { urbanization: 4, income: 5, education: 5, elderly: 7, religiosity: 6, agrarian: 6, heavyIndustry: 3, services: 3.5, coastal: 0, transit: 5, minority: 3, latgalianIdentity: 0, euEnthusiasm: 5.5, lean: 0.5 },
    Cēsis: { urbanization: 5, income: 6, education: 6.5, elderly: 6, religiosity: 5, agrarian: 4, heavyIndustry: 2, services: 5, coastal: 1, transit: 4, minority: 2, latgalianIdentity: 0, euEnthusiasm: 7.5, lean: 0.3 },
    'Living Outside Latvia': { urbanization: 8, income: 7.5, education: 8.5, elderly: 3, religiosity: 3, agrarian: 1, heavyIndustry: 1, services: 8, coastal: 1, transit: 2, minority: 5, latgalianIdentity: 0, euEnthusiasm: 9.5, lean: -0.6 },
  } as Record<DistrictName, any>;
  return { population: population[d], ...base[d] };
}

export function defaultDistricts(): District[] {
  return DISTRICT_ORDER.map((name) => ({
    name,
    corSeats: DISTRICT_SEATS[name],
    electsGovernor: name !== 'Living Outside Latvia',
    traits: defaultDistrictTraits(name),
  }));
}

// Trait vector used for ideology affinity. Order matters for vector math.
export const TRAIT_KEYS = [
  'urbanization', 'income', 'education', 'elderly', 'religiosity', 'agrarian',
  'heavyIndustry', 'services', 'coastal', 'transit', 'minority', 'latgalianIdentity',
  'euEnthusiasm',
] as const;

export type TraitKey = (typeof TRAIT_KEYS)[number];

// Preset affinity vectors per ideology, 0..10 scale.
export const IDEOLOGY_AFFINITIES: Record<string, Partial<Record<TraitKey, number>>> = {
  'Progressive Conservatism': { services: 6, education: 5, elderly: 4 },
  'National Conservatism': { religiosity: 7, elderly: 6, minority: -3 },
  'Christian Democracy': { religiosity: 6, elderly: 4, agrarian: 4 },
  'Social Conservatism': { religiosity: 6, elderly: 5, heavyIndustry: 3 },
  'Paternalistic Conservatism': { elderly: 5, heavyIndustry: 4, religiosity: 5 },
  'Distributism': { agrarian: 7, religiosity: 5, elderly: 4 },
  'Liberal Conservatism': { services: 5, income: 6, education: 4 },
  'National Liberalism': { minority: -2, transit: 5, heavyIndustry: 4 },
  'Conservative Liberalism': { income: 6, services: 5 },
  'Classical Liberalism': { income: 6, services: 6, urbanization: 4 },
  'Social Liberalism': { urbanization: 6, services: 6, education: 6, minority: 4 },
  'Liberalism': { urbanization: 5, services: 5, education: 5 },
  'Centrism': {},
  'Third Way': { services: 5, urbanization: 4 },
  'Social Democracy': { heavyIndustry: 5, services: 4, elderly: 3 },
  'Labourism': { heavyIndustry: 6, elderly: 4, income: -3 },
  'Socialism': { heavyIndustry: 6, income: -5, minority: 4 },
  'Democratic Socialism': { services: 4, education: 5, income: -3, minority: 4 },
  'Left-Wing Populism': { income: -4, elderly: 4, heavyIndustry: 5 },
  'Left-Wing Nationalism': { heavyIndustry: 4, income: -3 },
  'Left-Wing Conservativism': { elderly: 5, religiosity: 4, heavyIndustry: 3 },
  'Anti-Austerity Politics': { income: -5, heavyIndustry: 5 },
  'Green Politics': { education: 7, services: 5, urbanization: 5, heavyIndustry: -4, agrarian: 3 },
  'Green Liberalism': { education: 7, services: 6, urbanization: 6 },
  'Progressivism': { urbanization: 6, education: 7, services: 6, minority: 5 },
  'Agrarianism': { agrarian: 9, elderly: 5, religiosity: 4 },
  'Left-Agrarianism': { agrarian: 8, income: -3, elderly: 4 },
  'Conservative Agrarianism': { agrarian: 8, religiosity: 5, elderly: 6 },
  'Economic Nationalism': { heavyIndustry: 5, transit: 5, elderly: 4 },
  'Economic Progressivism': { income: -4, services: 4, education: 5 },
  'Welfarism': { elderly: 5, income: -3 },
  'Regionalism': { latgalianIdentity: 3, minority: 3, agrarian: 3 },
  'Localism': { agrarian: 4, elderly: 3 },
  'Latgalian Regionalism': { latgalianIdentity: 12, minority: 8, religiosity: 6, agrarian: 4, urbanization: -4, income: -4, services: -4, elderly: 4 },
  'Lību Interests': { services: 5, urbanization: 4 },
  'Russian Interests': { minority: 12, heavyIndustry: 4 },
  'Youth Interests': { education: 6, urbanization: 6, services: 6, elderly: -5 },
  'Immigrant Interests': { urbanization: 7, minority: 7, services: 5 },
  'Minority Interests': { minority: 12, urbanization: 4, religiosity: 3 },
  'Civic Plurinationalism': { minority: 6, urbanization: 5, services: 4 },
  'Urbanism/YIMBYism': { urbanization: 9, services: 7, education: 5, elderly: -4 },
  'Anti-Corruption': { urbanization: 6, services: 5, education: 5 },
  'Right-Wing Populism': { elderly: 5, income: -2, minority: -5, agrarian: 3 },
  'Right Statism': { heavyIndustry: 4, transit: 4, elderly: 4 },
  'Anti-Immigration': { minority: -6, elderly: 6, religiosity: 5 },
  'Ethnic Nationalism': { minority: -7, religiosity: 5, elderly: 5 },
  'Civic Nationalism': { transit: 4, services: 3 },
  'Right-Wing Libertarianism': { income: 7, services: 6 },
  'Libertarianism': { income: 6, services: 5, urbanization: 5 },
  'Pirate Politics/Digital Rights': { urbanization: 8, services: 7, education: 6 },
  'Civic Libertarianism': { urbanization: 5, services: 5 },
  'Anti-Environmentalism': { heavyIndustry: 6, agrarian: 4 },
  'Populism': { income: -3, elderly: 4, education: -2, services: -2 },
  'Pensioners Interests': { elderly: 9, religiosity: 5, income: -2 },
  'Rural Interests': { agrarian: 12, urbanization: -5, elderly: 4, transit: -2 },
  'Christian Traditionalism': { religiosity: 9, elderly: 5, education: -3, urbanization: -3 },
  'Latgalian Separatism': { latgalianIdentity: 10, minority: 8, religiosity: 5, agrarian: 5, services: -5, income: -4, urbanization: -5 },
  'Neo-Liberalism': { income: 9, services: 8, urbanization: 6, elderly: -3, heavyIndustry: -3 },
  'EU Federalism': { euEnthusiasm: 10, education: 7, services: 6, urbanization: 5 },
  'Marxism': { heavyIndustry: 7, income: -6, minority: 4, services: -2 },
  'Conservativism': { elderly: 5, religiosity: 5 },
};

export const DEFAULT_WEIGHTS: Weights = {
  ideologyMin: 0.5,
  ideologyMax: 1.7,
  positionMin: 0.55,
  positionMax: 1.3,
  euMin: 0.85,
  euMax: 1.15,
  homeBonus: 4.5,
  incumbentBonus: 1.05,
  noiseSigma: 0.03,
  crossEndorsementProb: 0.70,
  dominantIdeologyWeight: 2.0,
  secondaryIdeologyWeight: 0.5,
  secondaryPositionWeight: 0.4,
  seatCurveAlpha: 0.06,
  euProHigh: 1.15,
  euProLow: 0.85,
  euHardAntiHigh: 0.85,
  euHardAntiLow: 1.15,
  euSoftFactor: 0.5,
  ballotsPerDistrict: 100000,
  govRunoffNoise: 0.03,
  leanNationalPull: 0.5,
  homePenalty: 1.0,
  positionCurve: 2.2,
};

export const SEAT_TOTAL_CHECK = DISTRICT_ORDER.reduce((s, d) => s + DISTRICT_SEATS[d], 0);
