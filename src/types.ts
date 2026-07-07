export type Profession =
  | 'Wojownik'
  | 'Mag'
  | 'Łowca'
  | 'Tancerz Ostrzy'
  | 'Paladyn'
  | 'Tropiciel';

export interface Character {
  id: string;
  owner: string;
  characterName: string;
  profession: Profession;
  level: number;
  equipQuality: number; // 1–5
  availableFights: number; // 1 = required, >1 = optional
}

export interface TankInfo {
  profession: Profession;
  equipQuality: number;
  score: number;
}

export interface GroupResult {
  id: number;
  members: Character[];
  avgLevelRatio: number;
  avgEquipQuality: number;
  rawAvgLevelRatio: number;
  rawAvgEquipQuality: number;
  hasTropiciel: boolean;
  hasMagOrPaladyn: boolean;
  professionCount: Partial<Record<Profession, number>>;
  bestTank: TankInfo | null;
  ownerConflicts: string[];
}

export interface GenerationResult {
  groups: GroupResult[];
  unplacedRequired: Character[];
  unplacedOptional: Character[];
}

export const PROFESSIONS: Profession[] = [
  'Wojownik', 'Mag', 'Łowca', 'Tropiciel', 'Paladyn', 'Tancerz Ostrzy',
];

export const EQUIP_LABELS: Record<number, string> = {
  1: 'Zwykłe',
  2: 'Unikatowe',
  3: 'Heroiczne',
  4: 'Legendarne',
  5: 'Legendarny +5',
};
