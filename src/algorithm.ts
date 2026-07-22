import type {
  Character, Profession, GroupResult, GenerationResult, TankInfo, RemainingFights,
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

/** Tank = tarcza: Paladyn zawsze, Wojownik tylko ze zadeklarowaną tarczą. Tancerz = awaryjny. */
function hasShield(char: Character): boolean {
  if (char.profession === 'Paladyn') return true;
  if (char.profession === 'Wojownik') return Boolean(char.hasShield);
  return false;
}

function tankValue(char: Character): number {
  if (char.profession === 'Paladyn') return (char.equipQuality / 5) * 1.5;
  if (char.profession === 'Wojownik' && char.hasShield) return char.equipQuality / 5;
  if (char.profession === 'Tancerz Ostrzy') return (char.equipQuality / 5) * 0.1;
  return 0;
}

function isProperTank(c: Character): boolean {
  return hasShield(c);
}

function isAnyTank(c: Character): boolean {
  return tankValue(c) > 0;
}

function countProperTanks(group: Character[]): number {
  return group.filter(isProperTank).length;
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

/** Soft: wolimy ≤2 postaci tej samej profesji (Trop/Łowca i tak hard ≤2). */
const SOFT_MAX_PER_PROF = 2;

/**
 * Różnorodność 0–1: nie wystarczy „jest 5/6 profesji”, jeśli 5 to Wojownicy.
 * Pokrycie + równomierność (HHI) + kara za dominację / nadmiar ponad soft max (2).
 */
export function professionDiversity(group: Character[]): number {
  if (!group.length) return 0;
  const n = group.length;
  const counts = PROFESSIONS.map(p => countProf(group, p)).filter(c => c > 0);
  const unique = counts.length;
  const coverage = unique / PROFESSIONS.length;

  const hhi = counts.reduce((s, c) => s + (c / n) ** 2, 0);
  const kCap = Math.min(PROFESSIONS.length, n);
  const hhiIdeal = 1 / kCap;
  const evenness = Math.max(0, Math.min(1, (1 - hhi) / (1 - hhiIdeal)));

  const maxC = Math.max(...counts);
  const idealMax = Math.min(SOFT_MAX_PER_PROF, Math.max(1, Math.ceil(n / kCap)));
  const concentration =
    maxC <= idealMax
      ? 1
      : Math.max(0, 1 - (maxC - idealMax) / Math.max(1, n - idealMax));

  // 5× ta sama profesja w 10-os. = 3 nadmiaru → mocno w dół
  const excess = counts.reduce((s, c) => s + Math.max(0, c - SOFT_MAX_PER_PROF), 0);
  const excessScore = Math.max(0, 1 - (excess / n) * 2.5);

  return Math.max(
    0,
    Math.min(
      1,
      0.15 * coverage +
        0.15 * evenness +
        0.20 * concentration +
        0.50 * excessScore,
    ),
  );
}

/** Kara / bonus za dokładanie postaci danej profesji (soft cap). */
function professionStackPenalty(group: Character[], profession: Profession): number {
  const cnt = countProf(group, profession);
  if (cnt < SOFT_MAX_PER_PROF) return 1.2; // jeszcze miejsce — bonus
  if (cnt === SOFT_MAX_PER_PROF) return -2.5; // 3. ta sama — mocna kara
  return -5 - (cnt - SOFT_MAX_PER_PROF); // dalej gorzej
}

function noOwnerIn(group: Character[], owner: string): boolean {
  return !group.some(c => c.owner === owner);
}

function fixConstraints(groups: Character[][], maxGroupSize: number): void {
  // 1. Remove excess Tropiciele (max 2 per group)
  for (let i = 0; i < groups.length; i++) {
    const trops = groups[i].filter(c => c.profession === 'Tropiciel');
    for (let extra = 2; extra < trops.length; extra++) {
      const exc = trops[extra];
      const dst = groups.findIndex((g, idx) =>
        idx !== i &&
        countProf(g, 'Tropiciel') < 2 &&
        g.length < maxGroupSize &&
        noOwnerIn(g, exc.owner),
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
        idx !== i &&
        countProf(g, 'Łowca') < 2 &&
        g.length < maxGroupSize &&
        noOwnerIn(g, exc.owner),
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
    // Find a donor group with ≥2 Tropiciele whose Tropiciel won't conflict in group i
    const donor = groups.findIndex((g, idx) =>
      idx !== i &&
      countProf(g, 'Tropiciel') >= 2 &&
      g.some(c => c.profession === 'Tropiciel' && noOwnerIn(groups[i], c.owner)),
    );
    if (donor < 0) continue;
    const trop = groups[donor].find(
      c => c.profession === 'Tropiciel' && noOwnerIn(groups[i], c.owner),
    )!;
    if (groups[i].length < maxGroupSize) {
      groups[donor] = groups[donor].filter(c => c.id !== trop.id);
      groups[i].push(trop);
    } else {
      const swap = groups[i].find(
        c =>
          c.profession !== 'Tropiciel' &&
          c.profession !== 'Mag' &&
          c.profession !== 'Paladyn' &&
          noOwnerIn(groups[donor], c.owner),
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
      return (
        idx !== i &&
        cnt >= 2 &&
        g.some(
          c =>
            (c.profession === 'Mag' || c.profession === 'Paladyn') &&
            noOwnerIn(groups[i], c.owner),
        )
      );
    });
    if (donor < 0) continue;
    const magPal = groups[donor].find(
      c =>
        (c.profession === 'Mag' || c.profession === 'Paladyn') &&
        noOwnerIn(groups[i], c.owner),
    )!;
    if (groups[i].length < maxGroupSize) {
      groups[donor] = groups[donor].filter(c => c.id !== magPal.id);
      groups[i].push(magPal);
    } else {
      const swap = groups[i].find(
        c =>
          c.profession !== 'Tropiciel' &&
          c.profession !== 'Mag' &&
          c.profession !== 'Paladyn' &&
          noOwnerIn(groups[donor], c.owner),
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
  // 5. Tank distribution (Pal/Woj; Tancerz is last-resort only)
  distributeTanks(groups, maxGroupSize);
}

/**
 * Spread proper tanks (Paladyn/Wojownik) so each group has at least one when possible.
 * Supports move + swap (full groups). Tancerz Ostrzy counts as a weak tank for "has tank"
 * display, but surplus redistribution only moves Pal/Woj from groups that have ≥2.
 */
function distributeTanks(groups: Character[][], maxGroupSize: number): void {
  for (let i = 0; i < groups.length; i++) {
    if (!groups[i].length || countProperTanks(groups[i]) > 0) continue;

    const donor = groups.findIndex(
      (g, idx) => idx !== i && countProperTanks(g) >= 2,
    );
    if (donor < 0) continue;

    // Prefer moving Wojownik so donor keeps Paladyn; among same class prefer lower level
    const tankCandidates = groups[donor]
      .filter(c => isProperTank(c) && noOwnerIn(groups[i], c.owner))
      .sort((a, b) => {
        if (a.profession !== b.profession)
          return a.profession === 'Wojownik' ? -1 : 1;
        return a.level - b.level;
      });

    for (const tankToMove of tankCandidates) {
      // Direct move if space
      if (groups[i].length < maxGroupSize) {
        groups[donor] = groups[donor].filter(c => c.id !== tankToMove.id);
        groups[i].push(tankToMove);
        break;
      }

      // Swap with a non-critical member of the needy group
      const swap = groups[i].find(c => {
        if (isProperTank(c)) return false;
        if (c.profession === 'Tropiciel' && countProf(groups[i], 'Tropiciel') <= 1) return false;
        // Keep Mag/Pal coverage unless incoming tank is Paladyn
        if (
          (c.profession === 'Mag' || c.profession === 'Paladyn') &&
          tankToMove.profession !== 'Paladyn' &&
          !groups[i].some(
            x => x.id !== c.id && (x.profession === 'Mag' || x.profession === 'Paladyn'),
          )
        ) return false;
        if (!noOwnerIn(groups[donor].filter(x => x.id !== tankToMove.id), c.owner)) return false;
        if (c.profession === 'Łowca' && countProf(groups[donor], 'Łowca') >= 2) return false;
        if (c.profession === 'Tropiciel' && countProf(groups[donor], 'Tropiciel') >= 2) return false;
        return true;
      });

      if (swap) {
        groups[i] = groups[i].filter(c => c.id !== swap.id);
        groups[i].push(tankToMove);
        groups[donor] = groups[donor].filter(c => c.id !== tankToMove.id);
        groups[donor].push(swap);
        break;
      }
    }
  }
}

/** Metryka jak w UI / sortowaniu grup: padded lvl + eq (puste sloty = 0). */
function groupDisplayScore(g: Character[], targetLevel: number, maxGroupSize: number): number {
  if (!g.length) return 0;
  const level = g.reduce((s, c) => s + c.level / targetLevel, 0) / maxGroupSize;
  const equip = g.reduce((s, c) => s + c.equipQuality, 0) / maxGroupSize;
  return level + equip / 5;
}

/** Wkład postaci w lvl/eq (wyższy = mocniej ciągnie średnie grupy w górę). */
function charDisplayValue(c: Character, targetLevel: number): number {
  return c.level / targetLevel + c.equipQuality / 5;
}

/**
 * Cel: jak najwyższe średnie lvl/eq w grupach ORAZ możliwie równe grupy
 * ORAZ zrównoważona różnorodność profesji (nie stackowanie jednej klasy).
 */
function rosterDisplayObjective(
  groups: Character[][],
  targetLevel: number,
  maxGroupSize: number,
): number {
  if (!groups.length) return 0;
  const scores = groups.map(g => groupDisplayScore(g, targetLevel, maxGroupSize));
  const min = Math.min(...scores);
  const avg = scores.reduce((s, x) => s + x, 0) / scores.length;
  const divs = groups.map(professionDiversity);
  const minDiv = Math.min(...divs);
  const avgDiv = divs.reduce((s, x) => s + x, 0) / divs.length;
  return min + 0.35 * avg + 0.55 * minDiv + 0.25 * avgDiv;
}

// Wyrównuj grupy po padded lvl+eq, maksymalizując objective (wysoko + równo)
function balanceGroups(groups: Character[][], targetLevel: number, maxGroupSize: number): void {
  const objective = () => rosterDisplayObjective(groups, targetLevel, maxGroupSize);

  for (let pass = 0; pass < 30; pass++) {
    const baseline = objective();
    let bestSwap: { i: number; j: number; ci: Character; cj: Character; score: number } | null = null;

    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        for (const ci of groups[i]) {
          for (const cj of groups[j]) {
            if (!canSwapBetween(groups, i, j, ci, cj)) continue;

            // Symulacja
            const savedI = groups[i];
            const savedJ = groups[j];
            groups[i] = [...savedI.filter(c => c.id !== ci.id), cj];
            groups[j] = [...savedJ.filter(c => c.id !== cj.id), ci];
            const sc = objective();
            groups[i] = savedI;
            groups[j] = savedJ;

            if (sc > baseline + 0.002 && (!bestSwap || sc > bestSwap.score)) {
              bestSwap = { i, j, ci, cj, score: sc };
            }
          }
        }
      }
    }

    if (!bestSwap) break;
    const { i, j, ci, cj } = bestSwap;
    groups[i] = groups[i].filter(c => c.id !== ci.id);
    groups[i].push(cj);
    groups[j] = groups[j].filter(c => c.id !== cj.id);
    groups[j].push(ci);
  }
}

/** Hard constraints for a swap between two groups. */
function canSwapBetween(
  groups: Character[][],
  i: number,
  j: number,
  ci: Character,
  cj: Character,
): boolean {
  if (groups[i].some(c => c.id !== ci.id && c.owner === cj.owner)) return false;
  if (groups[j].some(c => c.id !== cj.id && c.owner === ci.owner)) return false;

  const newI = [...groups[i].filter(c => c.id !== ci.id), cj];
  const newJ = [...groups[j].filter(c => c.id !== cj.id), ci];

  if (cj.profession === 'Tropiciel' && countProf(newI, 'Tropiciel') > 2) return false;
  if (cj.profession === 'Łowca' && countProf(newI, 'Łowca') > 2) return false;
  if (ci.profession === 'Tropiciel' && countProf(newJ, 'Tropiciel') > 2) return false;
  if (ci.profession === 'Łowca' && countProf(newJ, 'Łowca') > 2) return false;

  if (ci.profession === 'Tropiciel' && !newI.some(c => c.profession === 'Tropiciel')) return false;
  if (cj.profession === 'Tropiciel' && !newJ.some(c => c.profession === 'Tropiciel')) return false;
  if (
    (ci.profession === 'Mag' || ci.profession === 'Paladyn') &&
    !newI.some(c => c.profession === 'Mag' || c.profession === 'Paladyn')
  ) return false;
  if (
    (cj.profession === 'Mag' || cj.profession === 'Paladyn') &&
    !newJ.some(c => c.profession === 'Mag' || c.profession === 'Paladyn')
  ) return false;

  if (isProperTank(ci) && countProperTanks(newI) === 0 && !isProperTank(cj)) return false;
  if (isProperTank(cj) && countProperTanks(newJ) === 0 && !isProperTank(ci)) return false;

  return true;
}

/**
 * Mniejsza grupa nadrabia brakujący slot wyższym lvl/eq.
 * Używa tego samego objective: wysoko + równo (min + 0.35*avg).
 */
function compensateSizeWithQuality(
  groups: Character[][],
  targetLevel: number,
  maxGroupSize: number,
): void {
  const cVal = (c: Character) => charDisplayValue(c, targetLevel);
  const objective = () => rosterDisplayObjective(groups, targetLevel, maxGroupSize);

  for (let pass = 0; pass < 40; pass++) {
    const baseline = objective();
    let best: {
      from: number; to: number; strong: Character; weak: Character; score: number;
    } | null = null;

    for (let big = 0; big < groups.length; big++) {
      for (let small = 0; small < groups.length; small++) {
        if (big === small) continue;
        if (groups[big].length < groups[small].length) continue;

        for (const strong of groups[big]) {
          for (const weak of groups[small]) {
            if (cVal(strong) <= cVal(weak) + 0.02) continue;
            if (!canSwapBetween(groups, big, small, strong, weak)) continue;

            const savedBig = groups[big];
            const savedSmall = groups[small];
            groups[big] = [...savedBig.filter(c => c.id !== strong.id), weak];
            groups[small] = [...savedSmall.filter(c => c.id !== weak.id), strong];
            const sc = objective();
            groups[big] = savedBig;
            groups[small] = savedSmall;

            if (sc > baseline + 0.002 && (!best || sc > best.score)) {
              best = { from: big, to: small, strong, weak, score: sc };
            }
          }
        }
      }
    }

    if (!best) break;
    groups[best.from] = groups[best.from].filter(c => c.id !== best.strong.id);
    groups[best.from].push(best.weak);
    groups[best.to] = groups[best.to].filter(c => c.id !== best.weak.id);
    groups[best.to].push(best.strong);
  }

  balanceGroups(groups, targetLevel, maxGroupSize);
}

// Returns characters that could not be placed anywhere without creating a conflict.
// These must be added to unplaced lists by the caller.
function fixOwnerConflicts(groups: Character[][], maxGroupSize: number): Character[] {
  const ejected: Character[] = [];

  for (let i = 0; i < groups.length; i++) {
    const byOwner: Record<string, Character[]> = {};
    for (const c of groups[i]) {
      (byOwner[c.owner] = byOwner[c.owner] ?? []).push(c);
    }
    for (const owner of Object.keys(byOwner)) {
      const extras = byOwner[owner].slice(1);
      for (const charToMove of extras) {
        // 1. Move to a group with space and no same owner
        const dst = groups.findIndex((g, idx) =>
          idx !== i &&
          noOwnerIn(g, owner) &&
          g.length < maxGroupSize,
        );
        if (dst >= 0) {
          groups[i] = groups[i].filter(c => c.id !== charToMove.id);
          groups[dst].push(charToMove);
          continue;
        }
        // 2. Swap with a character from another group
        let swapped = false;
        for (let j = 0; j < groups.length && !swapped; j++) {
          if (j === i || groups[j].some(c => c.owner === owner)) continue;
          const ownersInIAfterRemoval = groups[i]
            .filter(x => x.id !== charToMove.id)
            .map(x => x.owner);
          const swapCandidate = groups[j].find(
            c => !ownersInIAfterRemoval.includes(c.owner),
          );
          if (swapCandidate) {
            groups[i] = groups[i].filter(c => c.id !== charToMove.id);
            groups[j] = groups[j].filter(c => c.id !== swapCandidate.id);
            groups[i].push(swapCandidate);
            groups[j].push(charToMove);
            swapped = true;
          }
        }
        if (!swapped) {
          // Hard constraint: eject rather than leave a conflict
          groups[i] = groups[i].filter(c => c.id !== charToMove.id);
          ejected.push(charToMove);
        }
      }
    }
  }

  return ejected;
}

function resultQuality(r: GenerationResult): [number, number, number, number] {
  const charsPlaced = r.groups.reduce((s, g) => s + g.members.length, 0);
  // unikalne postacie z ≥1 walką
  const uniquePlaced = new Set(r.groups.flatMap(g => g.members.map(c => c.id))).size;
  const softOk = r.groups.filter(g => g.hasTropiciel && g.hasMagOrPaladyn).length;
  const avgDiv =
    r.groups.length === 0
      ? 0
      : r.groups.reduce((s, g) => s + g.professionDiversity, 0) / r.groups.length;
  // Wyżej = lepiej: najpierw jak najmniej bez walki, potem jak najwięcej postaci, potem walki, soft, diversity
  return [
    -r.unplacedRequired.length,
    uniquePlaced,
    charsPlaced,
    softOk,
    avgDiv,
  ];
}

function isBetterResult(a: GenerationResult, b: GenerationResult): boolean {
  const qa = resultQuality(a);
  const qb = resultQuality(b);
  for (let i = 0; i < qa.length; i++) {
    if (qa[i] !== qb[i]) return qa[i] > qb[i];
  }
  return false;
}

/** Jedna próba generacji dla ustalonej liczby grup. */
function generateGroupsFixed(
  characters: Character[],
  targetLevel: number,
  minGroupSize: number,
  maxGroupSize: number,
  nGroups: number,
): GenerationResult {
  // Pierwsza walka KAŻDEJ postaci = obowiązkowa; kolejne (rebitki) = opcjonalne
  const mainChars = [...characters];
  const rebitekChars = characters.filter(c => c.availableFights > 1);

  const ownerCount: Record<string, number> = {};
  for (const c of mainChars) ownerCount[c.owner] = (ownerCount[c.owner] ?? 0) + 1;

  const sorted = [...mainChars].sort((a, b) => {
    const countDiff = (ownerCount[b.owner] ?? 0) - (ownerCount[a.owner] ?? 0);
    if (countDiff !== 0) return countDiff;
    return charDisplayValue(b, targetLevel) - charDisplayValue(a, targetLevel);
  });

  const groups: Character[][] = Array.from({ length: nGroups }, () => []);
  const leftoverFirst: Character[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const char = sorted[i];
    const round = Math.floor(i / nGroups);
    const idealPos = round % 2 !== 0 ? nGroups - 1 - (i % nGroups) : i % nGroups;

    let pos = -1;
    let bestDraft = -Infinity;
    for (let offset = 0; offset < nGroups; offset++) {
      const candidate = (idealPos + offset) % nGroups;
      if (groups[candidate].some(c => c.owner === char.owner)) continue;
      if (groups[candidate].length >= maxGroupSize) continue;
      if (isProperTank(char) && countProperTanks(groups[candidate]) > 0) continue;
      const after = [...groups[candidate], char];
      const sc =
        professionDiversity(after) * 10 +
        professionStackPenalty(groups[candidate], char.profession) -
        Math.abs(candidate - idealPos) * 0.05;
      if (sc > bestDraft) {
        bestDraft = sc;
        pos = candidate;
      }
    }
    if (pos < 0) {
      bestDraft = -Infinity;
      for (let offset = 0; offset < nGroups; offset++) {
        const candidate = (idealPos + offset) % nGroups;
        if (groups[candidate].length >= maxGroupSize) continue;
        if (groups[candidate].some(c => c.owner === char.owner)) continue;
        const after = [...groups[candidate], char];
        const sc =
          professionDiversity(after) * 10 +
          professionStackPenalty(groups[candidate], char.profession);
        if (sc > bestDraft) {
          bestDraft = sc;
          pos = candidate;
        }
      }
    }
    if (pos < 0) {
      leftoverFirst.push(char);
      continue;
    }
    groups[pos].push(char);
  }

  const ejected1 = fixOwnerConflicts(groups, maxGroupSize);
  fixConstraints(groups, maxGroupSize);
  fixConstraints(groups, maxGroupSize);
  fixConstraints(groups, maxGroupSize);
  const ejected2 = fixOwnerConflicts(groups, maxGroupSize);
  balanceGroups(groups, targetLevel, maxGroupSize);
  distributeTanks(groups, maxGroupSize);
  const ejected3 = fixOwnerConflicts(groups, maxGroupSize);

  let pendingFirst = [
    ...leftoverFirst,
    ...ejected1,
    ...ejected2,
    ...ejected3,
  ];
  pendingFirst = [...new Map(pendingFirst.map(c => [c.id, c])).values()];
  pendingFirst = pendingFirst.filter(
    c => !groups.some(g => g.some(x => x.id === c.id)),
  );

  function countPlacements(charId: string): number {
    let n = 0;
    for (const g of groups) n += g.filter(c => c.id === charId).length;
    return n;
  }

  function canPlaceInGroup(char: Character, g: Character[]): boolean {
    if (g.length >= maxGroupSize) return false;
    if (g.some(c => c.id === char.id)) return false;
    if (g.some(c => c.owner === char.owner)) return false;
    if (char.profession === 'Tropiciel' && countProf(g, 'Tropiciel') >= 2) return false;
    if (char.profession === 'Łowca' && countProf(g, 'Łowca') >= 2) return false;
    return true;
  }

  function scoreExtraPlacement(char: Character, g: Character[]): number {
    const after = [...g, char];
    const divGain = professionDiversity(after) - professionDiversity(g);
    const stack = professionStackPenalty(g, char.profession);
    const profW = PROF_WEIGHTS[char.profession] / 6;
    const qDiff = Math.abs(
      groupAvgScore(g, targetLevel, maxGroupSize) - charScore(char, targetLevel),
    );
    const groupHasProperTank = g.some(isProperTank);
    const groupHasAnyTank = g.some(isAnyTank);
    const tankBonus =
      !groupHasProperTank && isProperTank(char) ? 1.5
      : !groupHasAnyTank && char.profession === 'Tancerz Ostrzy' ? 0.15
      : 0;
    const paladynEqBonus =
      char.profession === 'Paladyn' ? (char.equipQuality / 5) * 0.8 : 0;
    const minGroupLevel = g.length > 0 ? Math.min(...g.map(c => c.level)) : targetLevel;
    const tankLevelBonus = isAnyTank(char) && char.level <= minGroupLevel
      ? (isProperTank(char) ? 1.0 : 0.1)
      : 0;
    const fillBonus = g.length < minGroupSize ? (minGroupSize - g.length) * 8 : 0;
    return divGain * 8 + stack + profW + (1 - qDiff) + tankBonus + paladynEqBonus + tankLevelBonus + fillBonus;
  }

  function tryPlaceFirst(char: Character): boolean {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      if (!canPlaceInGroup(char, g)) continue;
      const after = [...g, char];
      const sc =
        (g.length < minGroupSize ? 100 : 0) -
        g.length +
        professionDiversity(after) * 12 +
        professionStackPenalty(g, char.profession);
      if (sc > bestScore) { bestScore = sc; bestIdx = gi; }
    }
    if (bestIdx < 0) return false;
    groups[bestIdx].push(char);
    return true;
  }

  const stillUnplaced: Character[] = [];
  for (const char of pendingFirst) {
    if (!tryPlaceFirst(char)) stillUnplaced.push(char);
  }

  // Wypchnij TYLKO dodatkową walkę (rebitek już mający ≥2 wystąpienia), by wcisnąć pierwszą walkę
  for (const char of [...stillUnplaced]) {
    let placed = false;
    for (let gi = 0; gi < groups.length && !placed; gi++) {
      const g = groups[gi];
      if (g.some(c => c.owner === char.owner)) continue;
      if (char.profession === 'Tropiciel' && countProf(g, 'Tropiciel') >= 2) continue;
      if (char.profession === 'Łowca' && countProf(g, 'Łowca') >= 2) continue;

      if (g.length < maxGroupSize) {
        g.push(char);
        placed = true;
        break;
      }

      const victim = g.find(c => {
        if (countPlacements(c.id) < 2) return false;
        if (c.profession === 'Tropiciel' && countProf(g, 'Tropiciel') <= 1) return false;
        if (
          (c.profession === 'Mag' || c.profession === 'Paladyn') &&
          !g.some(x => x.id !== c.id && (x.profession === 'Mag' || x.profession === 'Paladyn'))
        ) return false;
        if (isProperTank(c) && countProperTanks(g) <= 1 && !isProperTank(char)) return false;
        return true;
      });
      if (victim) {
        groups[gi] = g.filter(c => c.id !== victim.id);
        groups[gi].push(char);
        placed = true;
      }
    }
    if (placed) {
      const idx = stillUnplaced.findIndex(c => c.id === char.id);
      if (idx >= 0) stillUnplaced.splice(idx, 1);
    }
  }

  const sortedExtra = [...rebitekChars].sort(
    (a, b) => charDisplayValue(b, targetLevel) - charDisplayValue(a, targetLevel),
  );

  for (let pass = 0; pass < 8; pass++) {
    let anyPlaced = false;
    const preferUndersized = pass < 4;
    for (const char of sortedExtra) {
      const used = countPlacements(char.id);
      if (used >= char.availableFights) continue;
      if (used < 1) continue;

      let bestIdx = -1;
      let bestScore = -Infinity;
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        if (!canPlaceInGroup(char, g)) continue;
        if (preferUndersized && g.length >= minGroupSize) continue;
        const sc = scoreExtraPlacement(char, g);
        if (sc > bestScore) { bestScore = sc; bestIdx = gi; }
      }
      if (bestIdx < 0) continue;
      groups[bestIdx].push(char);
      anyPlaced = true;
    }
    if (!anyPlaced && !preferUndersized) break;
  }

  for (let pass = 0; pass < 4; pass++) {
    let anyPlaced = false;
    for (const char of sortedExtra) {
      const used = countPlacements(char.id);
      if (used >= char.availableFights || used < 1) continue;
      let bestIdx = -1;
      let bestScore = -Infinity;
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        if (g.length >= minGroupSize) continue;
        if (!canPlaceInGroup(char, g)) continue;
        const sc = scoreExtraPlacement(char, g);
        if (sc > bestScore) { bestScore = sc; bestIdx = gi; }
      }
      if (bestIdx >= 0) {
        groups[bestIdx].push(char);
        anyPlaced = true;
      }
    }
    if (!anyPlaced) break;
  }

  for (let gi = 0; gi < groups.length; gi++) {
    if (groups[gi].length >= minGroupSize) continue;
    const stranded = [...groups[gi]];
    groups[gi] = [];
    for (const char of stranded) {
      const others = countPlacements(char.id);
      if (others >= 1) {
        for (let gj = 0; gj < groups.length; gj++) {
          if (gj === gi) continue;
          if (!canPlaceInGroup(char, groups[gj])) continue;
          groups[gj].push(char);
          break;
        }
      } else if (!tryPlaceFirst(char)) {
        stillUnplaced.push(char);
      }
    }
  }

  compensateSizeWithQuality(groups, targetLevel, maxGroupSize);
  distributeTanks(groups, maxGroupSize);
  const ejectedFinal = fixOwnerConflicts(groups, maxGroupSize);
  for (const char of ejectedFinal) {
    if (countPlacements(char.id) === 0 && !tryPlaceFirst(char)) {
      stillUnplaced.push(char);
    }
  }

  for (const c of characters) {
    if (countPlacements(c.id) === 0 && !stillUnplaced.some(x => x.id === c.id)) {
      if (!tryPlaceFirst(c)) stillUnplaced.push(c);
    }
  }

  const validGroups: GroupResult[] = [];
  const unplacedRequired: Character[] = [
    ...new Map(stillUnplaced.map(c => [c.id, c])).values(),
  ].filter(c => countPlacements(c.id) === 0);

  for (const group of groups) {
    if (group.length < minGroupSize) {
      const stranded = [...group];
      group.length = 0;
      for (const char of stranded) {
        if (countPlacements(char.id) >= 1) continue;
        if (!tryPlaceFirst(char) && !unplacedRequired.some(x => x.id === char.id)) {
          unplacedRequired.push(char);
        }
      }
      continue;
    }
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
      id, members: [...group],
      avgLevelRatio, avgEquipQuality,
      rawAvgLevelRatio, rawAvgEquipQuality,
      hasTropiciel, hasMagOrPaladyn,
      professionDiversity: professionDiversity(group),
      professionCount, bestTank, ownerConflicts,
    });
  }

  const placedCount = new Map<string, number>();
  for (const g of validGroups) {
    for (const c of g.members) {
      placedCount.set(c.id, (placedCount.get(c.id) ?? 0) + 1);
    }
  }

  const remainingFights: RemainingFights[] = [];
  for (const c of characters) {
    const placed = placedCount.get(c.id) ?? 0;
    if (placed === 0) {
      if (!unplacedRequired.some(x => x.id === c.id)) unplacedRequired.push(c);
      continue;
    }
    const remaining = c.availableFights - placed;
    if (remaining > 0) {
      remainingFights.push({ character: c, placed, remaining });
    }
  }
  remainingFights.sort((a, b) => b.remaining - a.remaining);

  validGroups.sort((a, b) => {
    const qa = a.avgLevelRatio + a.avgEquipQuality / 5;
    const qb = b.avgLevelRatio + b.avgEquipQuality / 5;
    return qa - qb;
  });
  validGroups.forEach((g, i) => { g.id = i + 1; });

  return {
    groups: validGroups,
    unplacedRequired: [...new Map(unplacedRequired.map(c => [c.id, c])).values()],
    remainingFights,
  };
}

export function generateGroups(
  characters: Character[],
  targetLevel: number,
  minGroupSize: number,
  maxGroupSize: number,
): GenerationResult {
  if (!characters.length) {
    return { groups: [], unplacedRequired: [], remainingFights: [] };
  }

  const ownerFights: Record<string, number> = {};
  for (const c of characters) {
    ownerFights[c.owner] = (ownerFights[c.owner] ?? 0) + c.availableFights;
  }
  // Start: tyle grup, ile max. bić jednego gracza (wszystkie postacie + rebitki)
  const maxOwnerFights = Math.max(1, ...Object.values(ownerFights));

  const extraFightPool = characters.reduce(
    (s, c) => s + Math.max(0, c.availableFights - 1),
    0,
  );
  const nGroupsMin = Math.max(1, Math.ceil(characters.length / maxGroupSize));
  const nGroupsMax = Math.max(
    nGroupsMin,
    Math.floor((characters.length + extraFightPool) / minGroupSize),
  );
  const nGroupsStart = Math.min(nGroupsMax, Math.max(nGroupsMin, maxOwnerFights));

  // Od max w dół — wybierz wariant z największą liczbą bijących postaci (przy zachowaniu kryteriów)
  let best: GenerationResult | null = null;
  for (let n = nGroupsStart; n >= nGroupsMin; n--) {
    const candidate = generateGroupsFixed(
      characters, targetLevel, minGroupSize, maxGroupSize, n,
    );
    if (!best || isBetterResult(candidate, best)) {
      best = candidate;
    }
    // Idealnie: wszystkie postacie biją ≥1× i każda grupa ma Trop + Mag/Pal
    if (
      candidate.unplacedRequired.length === 0 &&
      candidate.groups.length === n &&
      candidate.groups.every(g => g.hasTropiciel && g.hasMagOrPaladyn)
    ) {
      break;
    }
  }

  return best!;
}

export function parseProfession(raw: string): Profession | null {
  const map: Record<string, Profession> = {
    'wojownik': 'Wojownik', 'w': 'Wojownik',
    'mag': 'Mag', 'm': 'Mag',
    'łowca': 'Łowca', 'lowca': 'Łowca', 'h': 'Łowca', 'l': 'Łowca', 'ł': 'Łowca',
    'tancerz ostrzy': 'Tancerz Ostrzy', 'tancerz': 'Tancerz Ostrzy',
    'b': 'Tancerz Ostrzy', 'to': 'Tancerz Ostrzy',
    'paladyn': 'Paladyn', 'p': 'Paladyn',
    'tropiciel': 'Tropiciel', 't': 'Tropiciel', 'tr': 'Tropiciel',
  };
  return map[raw.toLowerCase().trim()] ?? null;
}

function parseShield(raw: string | undefined, profession: Profession): boolean {
  if (profession === 'Paladyn') return true;
  if (profession !== 'Wojownik') return false;
  if (raw == null || raw === '') return false;
  const v = raw.toLowerCase().trim();
  return v === '1' || v === 'tak' || v === 'true' || v === 'yes' || v === 'tarcza';
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
    const [owner, characterName, profRaw, levelRaw, equipRaw, fightsRaw, shieldRaw] = parts;
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
      hasShield: parseShield(shieldRaw, profession),
    });
  }
  return { chars, errors };
}
