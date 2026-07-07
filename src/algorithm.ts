import type {
  Character, Profession, GroupResult, GenerationResult, TankInfo,
} from './types';
import { PROFESSIONS } from './types';

const PROF_WEIGHTS: Record<Profession, number> = {
  'Wojownik': 6, 'Mag': 5, 'Łowca': 4, 'Tropiciel': 3, 'Paladyn': 2, 'Tancerz Ostrzy': 1,
};

function charScore(char: Character, targetLevel: number): number {
  const ratio = char.level / targetLevel;
  const levelScore = Math.max(0, 1 - Math.abs(ratio - 1) * 0.8);
  const equipScore = (char.equipQuality - 1) / 4;
  if (char.profession === 'Paladyn') return levelScore * 0.3 + equipScore * 0.7;
  return levelScore * 0.5 + equipScore * 0.5;
}

function tankValue(char: Character): number {
  if (char.profession === 'Paladyn') return (char.equipQuality / 5) * 1.5;
  if (char.profession === 'Wojownik') return char.equipQuality / 5;
  return 0;
}

function bestTankInGroup(group: Character[]): TankInfo | null {
  let best: TankInfo | null = null;
  for (const c of group) {
    const tv = tankValue(c);
    if (tv > 0 && (!best || tv > best.score)) {
      best = { profession: c.profession, equipQuality: c.equipQuality, score: tv };
    }
  }
  return best;
}

function groupAvgScore(group: Character[], targetLevel: number, maxGroupSize?: number): number {
  if (!group.length) return 0;
  const denom = maxGroupSize ?? group.length;
  return group.reduce((s, c) => s + charScore(c, targetLevel), 0) / denom;
}

function countProf(group: Character[], prof: Profession): number {
  return group.filter(c => c.profession === prof).length;
}

function fixConstraints(groups: Character[][], maxGroupSize: number): void {
  // 1. Remove excess Tropiciele (max 2 per group)
  for (let i = 0; i < groups.length; i++) {
    const trops = groups[i].filter(c => c.profession === 'Tropiciel');
    for (let extra = 2; extra < trops.length; extra++) {
      const exc = trops[extra];
      const dst = groups.findIndex((g, idx) =>
        idx !== i && countProf(g, 'Tropiciel') < 2 && g.length < maxGroupSize,
      );
      if (dst >= 0) {
        groups[i] = groups[i].filter(c => c.id !== exc.id);
        groups[dst].push(exc);
      }
    }
  }
  // 2. Remove excess Łowcy (max 2 per group)
  for (let i = 0; i < groups.length; i++) {
    const lowcy = groups[i].filter(c => c.profession === 'Łowca');
    for (let extra = 2; extra < lowcy.length; extra++) {
      const exc = lowcy[extra];
      const dst = groups.findIndex((g, idx) =>
        idx !== i && countProf(g, 'Łowca') < 2 && g.length < maxGroupSize,
      );
      if (dst >= 0) {
        groups[i] = groups[i].filter(c => c.id !== exc.id);
        groups[dst].push(exc);
      }
    }
  }
  // 3. Ensure ≥1 Tropiciel per non-empty group
  for (let i = 0; i < groups.length; i++) {
    if (!groups[i].length || countProf(groups[i], 'Tropiciel') > 0) continue;
    const donor = groups.findIndex((g, idx) =>
      idx !== i && countProf(g, 'Tropiciel') >= 2,
    );
    if (donor < 0) continue;
    const trop = groups[donor].find(c => c.profession === 'Tropiciel')!;
    if (groups[i].length < maxGroupSize) {
      groups[donor] = groups[donor].filter(c => c.id !== trop.id);
      groups[i].push(trop);
    } else {
      const swap = groups[i].find(
        c => c.profession !== 'Tropiciel' && c.profession !== 'Mag' && c.profession !== 'Paladyn',
      );
      if (
        swap &&
        (swap.profession !== 'Łowca' || countProf(groups[donor], 'Łowca') < 2) &&
        groups[donor].length < maxGroupSize
      ) {
        groups[i] = groups[i].filter(c => c.id !== swap.id);
        groups[i].push(trop);
        groups[donor] = groups[donor].filter(c => c.id !== trop.id);
        groups[donor].push(swap);
      }
    }
  }
  // 4. Ensure ≥1 Mag or Paladyn per non-empty group
  for (let i = 0; i < groups.length; i++) {
    const hasMagPal = groups[i].some(c => c.profession === 'Mag' || c.profession === 'Paladyn');
    if (!groups[i].length || hasMagPal) continue;
    const donor = groups.findIndex((g, idx) => {
      const cnt = g.filter(c => c.profession === 'Mag' || c.profession === 'Paladyn').length;
      return idx !== i && cnt >= 2;
    });
    if (donor < 0) continue;
    const magPal = groups[donor].find(c => c.profession === 'Mag' || c.profession === 'Paladyn')!;
    if (groups[i].length < maxGroupSize) {
      groups[donor] = groups[donor].filter(c => c.id !== magPal.id);
      groups[i].push(magPal);
    } else {
      const swap = groups[i].find(
        c => c.profession !== 'Tropiciel' && c.profession !== 'Mag' && c.profession !== 'Paladyn',
      );
      if (
        swap &&
        (swap.profession !== 'Łowca' || countProf(groups[donor], 'Łowca') < 2) &&
        groups[donor].length < maxGroupSize
      ) {
        groups[i] = groups[i].filter(c => c.id !== swap.id);
        groups[i].push(magPal);
        groups[donor] = groups[donor].filter(c => c.id !== magPal.id);
        groups[donor].push(swap);
      }
    }
  }
  // 5. Soft: ensure ≥1 tank (Wojownik/Paladyn) per non-empty group
  for (let i = 0; i < groups.length; i++) {
    const hasTank = groups[i].some(
      c => c.profession === 'Wojownik' || c.profession === 'Paladyn',
    );
    if (!groups[i].length || hasTank) continue;
    const donor = groups.findIndex((g, idx) => {
      const cnt = g.filter(c => c.profession === 'Wojownik' || c.profession === 'Paladyn').length;
      return idx !== i && cnt >= 2;
    });
    if (donor < 0) continue;
    const tankToMove =
      groups[donor].find(c => c.profession === 'Paladyn') ??
      groups[donor].find(c => c.profession === 'Wojownik')!;
    if (
      groups[i].length < maxGroupSize &&
      !groups[i].some(c => c.owner === tankToMove.owner)
    ) {
      groups[donor] = groups[donor].filter(c => c.id !== tankToMove.id);
      groups[i].push(tankToMove);
    }
  }
}

function fixOwnerConflicts(groups: Character[][], maxGroupSize: number): void {
  for (let i = 0; i < groups.length; i++) {
    const byOwner: Record<string, Character[]> = {};
    for (const c of groups[i]) {
      (byOwner[c.owner] = byOwner[c.owner] ?? []).push(c);
    }
    for (const owner of Object.keys(byOwner)) {
      const extras = byOwner[owner].slice(1);
      for (const charToMove of extras) {
        const dst = groups.findIndex((g, idx) =>
          idx !== i &&
          !g.some(c => c.owner === owner) &&
          g.length < maxGroupSize,
        );
        if (dst >= 0) {
          groups[i] = groups[i].filter(c => c.id !== charToMove.id);
          groups[dst].push(charToMove);
          continue;
        }
        let swapped = false;
        for (let j = 0; j < groups.length && !swapped; j++) {
          if (j === i || groups[j].some(c => c.owner === owner)) continue;
          const swapCandidate = groups[j].find(c => {
            const ownersInI = groups[i]
              .filter(x => x.id !== charToMove.id)
              .map(x => x.owner);
            return !ownersInI.includes(c.owner);
          });
          if (swapCandidate) {
            groups[i] = groups[i].filter(c => c.id !== charToMove.id);
            groups[j] = groups[j].filter(c => c.id !== swapCandidate.id);
            groups[i].push(swapCandidate);
            groups[j].push(charToMove);
            swapped = true;
          }
        }
      }
    }
  }
}

export function generateGroups(
  characters: Character[],
  targetLevel: number,
  minGroupSize: number,
  maxGroupSize: number,
): GenerationResult {
  if (!characters.length) return { groups: [], unplacedRequired: [], unplacedOptional: [] };

  const required = characters.filter(c => c.availableFights === 1);
  const optional = characters.filter(c => c.availableFights > 1);

  const mainChars = required.length > 0 ? required : optional;
  const extraChars = required.length > 0 ? optional : [];

  const ownerCount: Record<string, number> = {};
  for (const c of mainChars) ownerCount[c.owner] = (ownerCount[c.owner] ?? 0) + 1;

  const sorted = [...mainChars].sort((a, b) => {
    const countDiff = (ownerCount[b.owner] ?? 0) - (ownerCount[a.owner] ?? 0);
    if (countDiff !== 0) return countDiff;
    return charScore(b, targetLevel) - charScore(a, targetLevel);
  });

  const targetSize = Math.round((minGroupSize + maxGroupSize) / 2);
  const nGroups = Math.max(1, Math.round(sorted.length / targetSize));
  const groups: Character[][] = Array.from({ length: nGroups }, () => []);

  for (let i = 0; i < sorted.length; i++) {
    const round = Math.floor(i / nGroups);
    const idealPos = round % 2 !== 0 ? nGroups - 1 - (i % nGroups) : i % nGroups;
    let pos = idealPos;
    for (let offset = 1; offset < nGroups; offset++) {
      if (!groups[idealPos].some(c => c.owner === sorted[i].owner)) break;
      pos = (idealPos + offset) % nGroups;
    }
    groups[pos].push(sorted[i]);
  }

  fixOwnerConflicts(groups, maxGroupSize);
  fixConstraints(groups, maxGroupSize);
  fixConstraints(groups, maxGroupSize);
  fixConstraints(groups, maxGroupSize);
  fixOwnerConflicts(groups, maxGroupSize);

  const unplacedOptional: Character[] = [];
  const sortedExtra = [...extraChars].sort(
    (a, b) => charScore(b, targetLevel) - charScore(a, targetLevel),
  );
  const slotsUsed = new Map<string, number>();

  for (let pass = 0; pass < 5; pass++) {
    let anyPlaced = false;
    for (const char of sortedExtra) {
      const used = slotsUsed.get(char.id) ?? 0;
      if (used >= char.availableFights) continue;

      let bestIdx = -1;
      let bestScore = -Infinity;

      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        if (g.length >= maxGroupSize) continue;
        if (g.some(c => c.id === char.id)) continue;
        if (g.some(c => c.owner === char.owner)) continue;
        if (char.profession === 'Tropiciel' && countProf(g, 'Tropiciel') >= 2) continue;
        if (char.profession === 'Łowca' && countProf(g, 'Łowca') >= 2) continue;

        const profs = new Set(g.map(c => c.profession));
        const diversity = profs.has(char.profession) ? 0 : 2;
        const profW = PROF_WEIGHTS[char.profession] / 6;
        const qDiff = Math.abs(
          groupAvgScore(g, targetLevel, maxGroupSize) - charScore(char, targetLevel),
        );
        const groupHasTank = g.some(
          c => c.profession === 'Wojownik' || c.profession === 'Paladyn',
        );
        const tankBonus =
          !groupHasTank && (char.profession === 'Wojownik' || char.profession === 'Paladyn')
            ? 1.5 : 0;
        const paladynEqBonus =
          char.profession === 'Paladyn' ? (char.equipQuality / 5) * 0.8 : 0;
        const sc = diversity + profW + (1 - qDiff) + tankBonus + paladynEqBonus;
        if (sc > bestScore) { bestScore = sc; bestIdx = gi; }
      }

      if (bestIdx >= 0) {
        groups[bestIdx].push(char);
        slotsUsed.set(char.id, used + 1);
        anyPlaced = true;
      }
    }
    if (!anyPlaced) break;
  }

  for (const char of extraChars) {
    if ((slotsUsed.get(char.id) ?? 0) === 0) unplacedOptional.push(char);
  }

  const validGroups: GroupResult[] = [];
  const unplacedRequired: Character[] = [];

  for (const group of groups) {
    if (group.length >= minGroupSize) {
      const id = validGroups.length + 1;
      const rawAvgLevelRatio =
        group.reduce((s, c) => s + c.level / targetLevel, 0) / group.length;
      const rawAvgEquipQuality =
        group.reduce((s, c) => s + c.equipQuality, 0) / group.length;
      const avgLevelRatio =
        group.reduce((s, c) => s + c.level / targetLevel, 0) / maxGroupSize;
      const avgEquipQuality =
        group.reduce((s, c) => s + c.equipQuality, 0) / maxGroupSize;
      const hasTropiciel = group.some(c => c.profession === 'Tropiciel');
      const hasMagOrPaladyn = group.some(
        c => c.profession === 'Mag' || c.profession === 'Paladyn',
      );
      const professionCount: Partial<Record<Profession, number>> = {};
      for (const prof of PROFESSIONS) {
        const cnt = countProf(group, prof);
        if (cnt > 0) professionCount[prof] = cnt;
      }
      const bestTank = bestTankInGroup(group);
      const ownerCounts: Record<string, number> = {};
      for (const c of group) ownerCounts[c.owner] = (ownerCounts[c.owner] ?? 0) + 1;
      const ownerConflicts = Object.entries(ownerCounts)
        .filter(([, cnt]) => cnt > 1)
        .map(([owner]) => owner);
      validGroups.push({
        id, members: group,
        avgLevelRatio, avgEquipQuality,
        rawAvgLevelRatio, rawAvgEquipQuality,
        hasTropiciel, hasMagOrPaladyn, professionCount, bestTank, ownerConflicts,
      });
    } else {
      unplacedRequired.push(...group.filter(c => c.availableFights === 1));
      unplacedOptional.push(...group.filter(c => c.availableFights > 1));
    }
  }

  validGroups.sort((a, b) => {
    const qa = a.avgLevelRatio + a.avgEquipQuality / 5;
    const qb = b.avgLevelRatio + b.avgEquipQuality / 5;
    return qb - qa;
  });
  validGroups.forEach((g, i) => { g.id = i + 1; });

  return { groups: validGroups, unplacedRequired, unplacedOptional };
}

export function parseProfession(raw: string): Profession | null {
  const map: Record<string, Profession> = {
    'wojownik': 'Wojownik', 'w': 'Wojownik',
    'mag': 'Mag', 'm': 'Mag',
    'łowca': 'Łowca', 'lowca': 'Łowca', 'l': 'Łowca', 'ł': 'Łowca',
    'tancerz ostrzy': 'Tancerz Ostrzy', 'tancerz': 'Tancerz Ostrzy',
    'to': 'Tancerz Ostrzy', 't': 'Tancerz Ostrzy',
    'paladyn': 'Paladyn', 'p': 'Paladyn',
    'tropiciel': 'Tropiciel', 'tr': 'Tropiciel',
  };
  return map[raw.toLowerCase().trim()] ?? null;
}

export function parseCSV(text: string): { chars: Character[]; errors: string[] } {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const chars: Character[] = [];
  const errors: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const sep = lines[i].includes('\t') ? '\t' : ';';
    let parts = lines[i].split(sep).map(p => p.trim());

    if (
      parts.length > 0 &&
      /^(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}\.\d{2}\.\d{4})/.test(parts[0])
    ) {
      parts = parts.slice(1);
    }

    if (parts.length < 4) {
      errors.push(`Wiersz ${i + 1}: za mało kolumn (min. 4)`);
      continue;
    }
    const [owner, characterName, profRaw, levelRaw, equipRaw, fightsRaw] = parts;
    const profession = parseProfession(profRaw ?? '');
    if (!profession) {
      errors.push(`Wiersz ${i + 1}: nieznana profesja "${profRaw}"`);
      continue;
    }
    const level = parseInt(levelRaw ?? '');
    if (isNaN(level) || level < 1) {
      errors.push(`Wiersz ${i + 1}: nieprawidłowy poziom "${levelRaw}"`);
      continue;
    }
    const equipQuality = Math.min(5, Math.max(1, parseInt(equipRaw ?? '3') || 3));
    const availableFights = Math.max(1, parseInt(fightsRaw ?? '1') || 1);
    chars.push({
      id: `csv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`,
      owner: owner || '?',
      characterName: characterName || '?',
      profession,
      level,
      equipQuality,
      availableFights,
    });
  }
  return { chars, errors };
}
