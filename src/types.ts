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
  availableFights: number; // pierwsza walka zawsze obowiązkowa; >1 = rebitki
  /** Tarcza: Paladyn domyślnie true; Wojownik tylko gdy zadeklarował */
  hasShield: boolean;
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
  /** 0–1: pokrycie + równomierność (nie samo „ile unikalnych”) */
  professionDiversity: number;
  professionCount: Partial<Record<Profession, number>>;
  bestTank: TankInfo | null;
  ownerConflicts: string[];
}

export interface RemainingFights {
  character: Character;
  placed: number;
  remaining: number;
}

export interface GenerationResult {
  groups: GroupResult[];
  /** Postacie bez ani jednej walki (krytyczne — nie powinno się zdarzać) */
  unplacedRequired: Character[];
  /** Rebitki: ile walk zostało po wygenerowanych grupach */
  remainingFights: RemainingFights[];
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
