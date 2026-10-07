export type DistrictName =
  | 'Riga'
  | 'Pierīga'
  | 'Vidzeme'
  | 'Zemgale'
  | 'Greater Jelgava'
  | 'Latgale'
  | 'Greater Daugavpils'
  | 'Kurzeme'
  | 'Greater Liepāja'
  | 'Daugavpils'
  | 'Liepāja'
  | 'Jelgava'
  | 'Jūrmala'
  | 'Ventspils'
  | 'Rēzekne'
  | 'Valmiera'
  | 'Jēkabpils'
  | 'Cēsis'
  | 'Living Outside Latvia';

export type Position =
  | 'Far Left'
  | 'Left Wing'
  | 'Center Left'
  | 'Center'
  | 'Center Right'
  | 'Right Wing'
  | 'Far Right'
  | 'Big Tent'
  | 'Syncretic';

export type EUPosition = 'Hard Anti-EU' | 'Soft Anti-EU' | 'Pro-EU';

export type EuroGroup =
  | 'EPP' | 'S&D' | 'PfE' | 'ECR' | 'Renew' | 'Greens' | 'EFA' | 'LEFT' | 'ESN' | 'NI';

export type SaeimaStatus = 'Government' | 'Opposition' | 'Cross-bench' | 'Supply and Confidence';

export interface DistrictTraits {
  population: number;
  urbanization: number;
  income: number;
  education: number;
  elderly: number;
  religiosity: number;
  agrarian: number;
  heavyIndustry: number;
  services: number;
  coastal: number;
  transit: number;
  minority: number;
  latgalianIdentity: number;
  euEnthusiasm: number;
  lean: number;
}

export interface District {
  name: DistrictName;
  corSeats: number;
  electsGovernor: boolean;
  traits: DistrictTraits;
}

export interface Party {
  id: string;
  name: string;
  ideology: string;
  secondaryIdeologies: string[];
  positions: Position[];
  dominantPosition: Position;
  euPosition: EUPosition;
  euroGroup: EuroGroup;
  saeimaSeats: number;
  homeDistricts: DistrictName[];
  allianceId: string;
  color: string;
}

export interface Alliance {
  id: string;
  name: string;
  color: string;
  memberPartyIds: string[];
  autoIdeology: boolean;
  autoPosition: boolean;
  autoEuPosition: boolean;
  overrideIdeology?: string;
  overrideSecondaryIdeologies?: string[];
  overridePositions?: Position[];
  overrideDominantPosition?: Position;
  overrideEuPosition?: EUPosition;
  runningDistricts: DistrictName[];
  saeimaStatus: SaeimaStatus;
  regionalAllianceId: string | null;
}

export interface RegionalAlliance {
  id: string;
  name: string;
  color: string;
  memberAllianceIds: string[];
}

export interface Weights {
  ideologyMin: number; // ideology-region fit clamp low
  ideologyMax: number;
  positionMin: number;
  positionMax: number;
  euMin: number;
  euMax: number;
  homeBonus: number;
  incumbentBonus: number;
  noiseSigma: number;
  crossEndorsementProb: number;
  dominantIdeologyWeight: number;
  secondaryIdeologyWeight: number;
  secondaryPositionWeight: number;
  seatCurveAlpha: number;
  euProHigh: number;
  euProLow: number;
  euHardAntiHigh: number;
  euHardAntiLow: number;
  euSoftFactor: number;
  ballotsPerDistrict: number;
  govRunoffNoise: number;
  leanNationalPull: number;
}

export interface DistrictOverride {
  district: DistrictName;
  shares: Record<string, number>; // allianceId -> share (0..1), locked
}

export interface ScenarioData {
  id: string;
  name: string;
  createdAt: number;
  seed: number;
  parties: Party[];
  alliances: Alliance[];
  regionalAlliances: RegionalAlliance[];
  weights: Weights;
  overrides: DistrictOverride[];
  incumbentGovernors: Partial<Record<DistrictName, string | null>>; // allianceId
  saeimaTotalSeats: number;
}

export interface ModifierLog {
  baseShare: number;
  ideologyFit: number;
  positionFit: number;
  euEffect: number;
  homeBonus: number;
  incumbencyBonus: number;
  noise: number;
  finalShare: number; // normalized within district
  rawScore: number;
  votes: number;
}

export interface DistrictResult {
  district: DistrictName;
  turnoutBallots: number;
  quota: number;
  shares: Record<string, ModifierLog>; // allianceId
  ballots: { ranking: string[]; weight: number }[];
  rounds: MeekRound[];
  elected: { allianceId: string; order: number }[];
  eliminatedOrder: string[];
  governor?: GovernorResult;
  overridden: boolean;
}

export interface MeekRound {
  round: number;
  quota: number;
  tallies: Record<string, number>;
  keepFactors: Record<string, number>;
  elected: string[];
  eliminated: string | null;
  note: string;
}

export interface GovernorResult {
  candidates: { allianceId: string; label: string; stage1Share: number; blocAllianceIds: string[] }[];
  stage1Shares: Record<string, number>;
  winner: string | null;
  wonInStage1: boolean;
  runoff?: { a: string; b: string; shares: Record<string, number>; transfers: Record<string, string> };
  totalValid: number;
}

export interface SimulationResult {
  seed: number;
  weights: Weights;
  districtResults: Record<DistrictName, DistrictResult>;
  councilorTotals: Record<string, number>;
  governors: Partial<Record<DistrictName, string>>;
  jointSessionWeights: Record<string, number>;
  timestamp: number;
}

export interface Scenario extends ScenarioData {
  results: SimulationResult | null;
}
