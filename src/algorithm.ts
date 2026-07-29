import type {
  Character, Profession, GroupResult, GenerationResult, TankInfo, RemainingFights,
} from './types';
import { PROFESSIONS } from './types';

// ─── role helpers ────────────────────────────────────────────────────────────

function isProperTank(c: Character): boolean {
  return c.profession === 'Paladyn' || (c.profession === 'Wojownik' && c.hasShield);
}

function countProf(group: Character[], prof: Profession): number {
  return group.filter(c => c.profession === prof).length;
}

function hasTropiciel(group: Character[]): boolean {
  return group.some(c => c.profession === 'Tropiciel');
}

function hasMagOrPaladyn(group: Character[]): boolean {
  return group.some(c => c.profession === 'Mag' || c.profession === 'Paladyn');
}

function hasTank(group: Character[]): boolean {
  return group.some(isProperTank);
}

function noOwnerIn(group: Character[], owner: string): boolean {
  return !group.some(c => c.owner === owner);
}

function levelSum(group: Character[]): number {
  return group.reduce((s, c) => s + c.level, 0);
}

// ─── tank scoring ─────────────────────────────────────────────────────────────

function bestTankInGroup(group: Character[], targetLevel: number): TankInfo | null {
  let best: TankInfo | null = null;
  for (const c of group) {
    const base = Math.min(2, c.level / targetLevel) * 0.65 + (c.equipQuality / 5) * 0.35;
    let score = 0;
    if (c.profession === 'Paladyn') score = base * 1.5;
    else if (c.profession === 'Wojownik' && c.hasShield) score = base;
    else if (c.profession === 'Tancerz Ostrzy') score = base * 0.1;
    if (score > 0 && (!best || score > best.score)) {
      best = { profession: c.profession, equipQuality: c.equipQuality, score };
    }
  }
  return best;
}

// ─── profession diversity (exported, used by UI) ──────────────────────────────

export function professionDiversity(group: Character[]): number {
  if (!group.length) return 0;
  const n = group.length;
  const counts = PROFESSIONS.map(p => countProf(group, p)).filter(c => c > 0);
  const coverage = counts.length / PROFESSIONS.length;

  const hhi = counts.reduce((s, c) => s + (c / n) ** 2, 0);
  const kCap = Math.min(PROFESSIONS.length, n);
  const hhiIdeal = 1 / kCap;
  const evenness = hhi === hhiIdeal ? 1 : Math.max(0, Math.min(1, (1 - hhi) / (1 - hhiIdeal)));

  const maxC = Math.max(...counts);
  const idealMax = Math.min(2, Math.max(1, Math.ceil(n / kCap)));
  const concentration = maxC <= idealMax
    ? 1
    : Math.max(0, 1 - (maxC - idealMax) / Math.max(1, n - idealMax));

  const excess = counts.reduce((s, c) => s + Math.max(0, c - 2), 0);
  const excessScore = Math.max(0, 1 - (excess / n) * 2.5);

  return Math.max(0, Math.min(1,
    0.15 * coverage + 0.15 * evenness + 0.20 * concentration + 0.50 * excessScore,
  ));
}

// ─── placement constraints ────────────────────────────────────────────────────

function canAdd(char: Character, group: Character[], maxGS: number): boolean {
  if (group.length >= maxGS) return false;
  if (group.some(c => c.id === char.id)) return false;
  if (group.some(c => c.owner === char.owner)) return false;
  if (char.profession === 'Tropiciel' && countProf(group, 'Tropiciel') >= 2) return false;
  if (char.profession === 'Łowca' && countProf(group, 'Łowca') >= 2) return false;
  return true;
}

function canSwap(
  groups: Character[][],
  i: number, j: number,
  ci: Character, cj: Character,
): boolean {
  if (groups[i].some(c => c.id !== ci.id && c.owner === cj.owner)) return false;
  if (groups[j].some(c => c.id !== cj.id && c.owner === ci.owner)) return false;

  const newI = [...groups[i].filter(c => c.id !== ci.id), cj];
  const newJ = [...groups[j].filter(c => c.id !== cj.id), ci];

  if (countProf(newI, 'Tropiciel') > 2 || countProf(newJ, 'Tropiciel') > 2) return false;
  if (countProf(newI, 'Łowca') > 2 || countProf(newJ, 'Łowca') > 2) return false;
  if (!hasTropiciel(newI) || !hasTropiciel(newJ)) return false;
  if (!hasMagOrPaladyn(newI) || !hasMagOrPaladyn(newJ)) return false;
  if (!hasTank(newI) || !hasTank(newJ)) return false;

  return true;
}

// ─── level balancing via variance-reducing swaps ──────────────────────────────

function balanceLevels(groups: Character[][], maxGS: number): void {
  for (let pass = 0; pass < 80; pass++) {
    const avgs = groups.map(g => levelSum(g) / maxGS);
    const mean = avgs.reduce((s, x) => s + x, 0) / avgs.length;

    let bestDelta = 0.5; // min improvement threshold (in level² units)
    let bestSwap: { i: number; j: number; ci: Character; cj: Character } | null = null;

    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        for (const ci of groups[i]) {
          for (const cj of groups[j]) {
            if (ci.level === cj.level) continue;
            if (!canSwap(groups, i, j, ci, cj)) continue;

            const newAvgI = avgs[i] + (cj.level - ci.level) / maxGS;
            const newAvgJ = avgs[j] + (ci.level - cj.level) / maxGS;
            const oldVar = (avgs[i] - mean) ** 2 + (avgs[j] - mean) ** 2;
            const newVar = (newAvgI - mean) ** 2 + (newAvgJ - mean) ** 2;
            const delta = oldVar - newVar;

            if (delta > bestDelta) { bestDelta = delta; bestSwap = { i, j, ci, cj }; }
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

// ─── hard constraint enforcement ─────────────────────────────────────────────

function donateRole(
  groups: Character[][],
  i: number,
  isRole: (c: Character) => boolean,
  donorHasExtra: (g: Character[]) => boolean,
  maxGS: number,
): void {
  for (let j = 0; j < groups.length; j++) {
    if (j === i || !donorHasExtra(groups[j])) continue;

    const donor = groups[j].find(c => isRole(c) && noOwnerIn(groups[i], c.owner));
    if (!donor) continue;

    if (groups[i].length < maxGS) {
      groups[j] = groups[j].filter(c => c.id !== donor.id);
      groups[i].push(donor);
      return;
    }

    const swapOut = groups[i].find(c => {
      if (!noOwnerIn(groups[j].filter(x => x.id !== donor.id), c.owner)) return false;
      if (c.profession === 'Tropiciel' && countProf(groups[i], 'Tropiciel') <= 1) return false;
      if ((c.profession === 'Mag' || c.profession === 'Paladyn') &&
          !groups[i].some(x => x.id !== c.id && (x.profession === 'Mag' || x.profession === 'Paladyn'))) return false;
      if (isProperTank(c) && groups[i].filter(isProperTank).length <= 1) return false;
      if (c.profession === 'Łowca' && countProf(groups[j], 'Łowca') >= 2) return false;
      if (c.profession === 'Tropiciel' && countProf(groups[j], 'Tropiciel') >= 2) return false;
      return true;
    });

    if (swapOut) {
      groups[i] = groups[i].filter(c => c.id !== swapOut.id);
      groups[i].push(donor);
      groups[j] = groups[j].filter(c => c.id !== donor.id);
      groups[j].push(swapOut);
      return;
    }
  }
}

function fixHardConstraints(groups: Character[][], maxGS: number): void {
  // Cap Tropiciel and Łowca at 2 per group
  for (const prof of ['Tropiciel', 'Łowca'] as const) {
    for (let i = 0; i < groups.length; i++) {
      const excess = groups[i].filter(c => c.profession === prof).slice(2);
      for (const exc of excess) {
        const dst = groups.findIndex((g, idx) =>
          idx !== i && countProf(g, prof) < 2 && g.length < maxGS && noOwnerIn(g, exc.owner),
        );
        if (dst >= 0) {
          groups[i] = groups[i].filter(c => c.id !== exc.id);
          groups[dst].push(exc);
        }
      }
    }
  }

  // Ensure Tropiciel in each group
  for (let i = 0; i < groups.length; i++) {
    if (!groups[i].length || hasTropiciel(groups[i])) continue;
    donateRole(groups, i,
      c => c.profession === 'Tropiciel',
      g => countProf(g, 'Tropiciel') >= 2,
      maxGS,
    );
  }

  // Ensure Mag/Paladyn in each group
  for (let i = 0; i < groups.length; i++) {
    if (!groups[i].length || hasMagOrPaladyn(groups[i])) continue;
    donateRole(groups, i,
      c => c.profession === 'Mag' || c.profession === 'Paladyn',
      g => g.filter(x => x.profession === 'Mag' || x.profession === 'Paladyn').length >= 2,
      maxGS,
    );
  }

  // Ensure proper tank in each group
  for (let i = 0; i < groups.length; i++) {
    if (!groups[i].length || hasTank(groups[i])) continue;
    donateRole(groups, i,
      isProperTank,
      g => g.filter(isProperTank).length >= 2,
      maxGS,
    );
  }
}

// ─── owner conflict resolution ────────────────────────────────────────────────

function fixOwnerConflicts(groups: Character[][], maxGS: number): Character[] {
  const ejected: Character[] = [];

  for (let i = 0; i < groups.length; i++) {
    const byOwner: Record<string, Character[]> = {};
    for (const c of groups[i]) (byOwner[c.owner] = byOwner[c.owner] ?? []).push(c);

    for (const chars of Object.values(byOwner)) {
      for (const extra of chars.slice(1)) {
        const dst = groups.findIndex((g, idx) =>
          idx !== i && noOwnerIn(g, extra.owner) && g.length < maxGS,
        );
        if (dst >= 0) {
          groups[i] = groups[i].filter(c => c.id !== extra.id);
          groups[dst].push(extra);
          continue;
        }
        let swapped = false;
        for (let j = 0; j < groups.length && !swapped; j++) {
          if (j === i || !noOwnerIn(groups[j], extra.owner)) continue;
          const remainingOwners = groups[i].filter(x => x.id !== extra.id).map(x => x.owner);
          const swapCand = groups[j].find(c => !remainingOwners.includes(c.owner));
          if (swapCand) {
            groups[i] = groups[i].filter(c => c.id !== extra.id);
            groups[j] = groups[j].filter(c => c.id !== swapCand.id);
            groups[i].push(swapCand);
            groups[j].push(extra);
            swapped = true;
          }
        }
        if (!swapped) {
          groups[i] = groups[i].filter(c => c.id !== extra.id);
          ejected.push(extra);
        }
      }
    }
  }
  return ejected;
}

// ─── fair rebitki distribution ────────────────────────────────────────────────

function placeRebitki(groups: Character[][], characters: Character[], maxGS: number): void {
  function countPlaced(id: string): number {
    return groups.reduce((s, g) => s + g.filter(c => c.id === id).length, 0);
  }

  const rebChars = characters.filter(c => c.availableFights > 1);
  if (!rebChars.length) return;

  const maxFights = Math.max(...rebChars.map(c => c.availableFights));

  // Round-robin: all chars get fight #k before anyone gets fight #k+1
  for (let fightIdx = 2; fightIdx <= maxFights; fightIdx++) {
    const eligible = rebChars
      .filter(c => c.availableFights >= fightIdx && countPlaced(c.id) === fightIdx - 1)
      .sort((a, b) => b.level - a.level);

    for (const char of eligible) {
      let bestIdx = -1;
      let bestScore = -Infinity;
      for (let gi = 0; gi < groups.length; gi++) {
        if (!canAdd(char, groups[gi], maxGS)) continue;
        const g = groups[gi];
        let score = 0;
        if (!hasTropiciel(g) && char.profession === 'Tropiciel') score += 20;
        if (!hasMagOrPaladyn(g) && (char.profession === 'Mag' || char.profession === 'Paladyn')) score += 20;
        if (!hasTank(g) && isProperTank(char)) score += 20;
        score -= g.length; // prefer smaller groups
        if (countProf(g, char.profession) < 2) score += 3;
        if (score > bestScore) { bestScore = score; bestIdx = gi; }
      }
      if (bestIdx >= 0) groups[bestIdx].push(char);
    }
  }
}

// ─── build final GroupResult objects ─────────────────────────────────────────

function buildResult(
  groups: Character[][],
  characters: Character[],
  targetLevel: number,
  minGS: number,
  maxGS: number,
): GenerationResult {
  // Dissolve undersized groups; try to rescue their members
  const finalGroups: Character[][] = [];
  const rescued: Character[] = [];

  for (const g of groups) {
    if (g.length >= minGS) finalGroups.push(g);
    else rescued.push(...g);
  }

  for (const char of rescued) {
    const dst = finalGroups.find(g => canAdd(char, g, maxGS));
    if (dst) dst.push(char);
  }

  const placedIds = new Set(finalGroups.flatMap(g => g.map(c => c.id)));

  const validGroups: GroupResult[] = finalGroups.map((g, idx) => {
    const rawAvgLevelRatio = g.reduce((s, c) => s + c.level / targetLevel, 0) / g.length;
    const rawAvgEquipQuality = g.reduce((s, c) => s + c.equipQuality, 0) / g.length;
    const avgLevelRatio = g.reduce((s, c) => s + c.level / targetLevel, 0) / maxGS;
    const avgEquipQuality = g.reduce((s, c) => s + c.equipQuality, 0) / maxGS;

    const professionCount: Partial<Record<Profession, number>> = {};
    for (const prof of PROFESSIONS) {
      const cnt = countProf(g, prof);
      if (cnt > 0) professionCount[prof] = cnt;
    }

    const ownerCounts: Record<string, number> = {};
    for (const c of g) ownerCounts[c.owner] = (ownerCounts[c.owner] ?? 0) + 1;
    const ownerConflicts = Object.entries(ownerCounts).filter(([, n]) => n > 1).map(([o]) => o);

    return {
      id: idx + 1,
      members: [...g],
      avgLevelRatio, avgEquipQuality,
      rawAvgLevelRatio, rawAvgEquipQuality,
      hasTropiciel: hasTropiciel(g),
      hasMagOrPaladyn: hasMagOrPaladyn(g),
      professionDiversity: professionDiversity(g),
      professionCount,
      bestTank: bestTankInGroup(g, targetLevel),
      ownerConflicts,
    };
  });

  const unplacedRequired = characters.filter(c => !placedIds.has(c.id));

  const placedCount = new Map<string, number>();
  for (const g of finalGroups) {
    for (const c of g) placedCount.set(c.id, (placedCount.get(c.id) ?? 0) + 1);
  }
  const remainingFights: RemainingFights[] = characters
    .filter(c => {
      const p = placedCount.get(c.id) ?? 0;
      return p > 0 && c.availableFights > p;
    })
    .map(c => ({
      character: c,
      placed: placedCount.get(c.id)!,
      remaining: c.availableFights - placedCount.get(c.id)!,
    }))
    .sort((a, b) => b.remaining - a.remaining);

  validGroups.sort((a, b) => a.rawAvgLevelRatio - b.rawAvgLevelRatio);
  validGroups.forEach((g, i) => { g.id = i + 1; });

  return { groups: validGroups, unplacedRequired, remainingFights };
}

// ─── profession balance pass ──────────────────────────────────────────────────

// Swap chars between groups to equalise per-profession counts (max diff ≤ 1).
function balanceProfessions(groups: Character[][], characters: Character[]): void {
  const profCounts: Partial<Record<Profession, number>> = {};
  for (const c of characters) profCounts[c.profession] = (profCounts[c.profession] ?? 0) + 1;

  for (const prof of PROFESSIONS) {
    if (!(profCounts[prof] ?? 0)) continue;

    for (let pass = 0; pass < 30; pass++) {
      const counts = groups.map(g => countProf(g, prof));
      if (Math.max(...counts) - Math.min(...counts) <= 1) break;

      const donorIdx = counts.indexOf(Math.max(...counts));
      const recvIdx  = counts.indexOf(Math.min(...counts));

      let swapped = false;
      outer: for (const fromDonor of groups[donorIdx].filter(c => c.profession === prof)) {
        for (const fromRecv of groups[recvIdx].filter(c => c.profession !== prof)) {
          if (canSwap(groups, donorIdx, recvIdx, fromDonor, fromRecv)) {
            groups[donorIdx] = groups[donorIdx].filter(c => c.id !== fromDonor.id);
            groups[donorIdx].push(fromRecv);
            groups[recvIdx]  = groups[recvIdx].filter(c => c.id !== fromRecv.id);
            groups[recvIdx].push(fromDonor);
            swapped = true;
            break outer;
          }
        }
      }
      if (!swapped) break;
    }
  }
}

// ─── generate for a fixed number of groups ────────────────────────────────────

function tryGenerateFixed(
  characters: Character[],
  targetLevel: number,
  minGS: number,
  maxGS: number,
  nGroups: number,
): GenerationResult {
  const groups: Character[][] = Array.from({ length: nGroups }, () => []);

  const ownerCount: Record<string, number> = {};
  for (const c of characters) ownerCount[c.owner] = (ownerCount[c.owner] ?? 0) + 1;

  // Most-constrained owners first, then level desc
  const sorted = [...characters].sort((a, b) => {
    const d = (ownerCount[b.owner] ?? 0) - (ownerCount[a.owner] ?? 0);
    return d !== 0 ? d : b.level - a.level;
  });

  // Profession counts for proportional distribution
  const profCounts: Partial<Record<Profession, number>> = {};
  for (const c of characters) profCounts[c.profession] = (profCounts[c.profession] ?? 0) + 1;

  const seeded = new Set<string>();

  function seedRole(
    isRole: (c: Character) => boolean,
    groupNeedsRole: (g: Character[]) => boolean,
    sortFn: (a: Character, b: Character) => number,
  ) {
    const cands = sorted.filter(c => !seeded.has(c.id) && isRole(c)).sort(sortFn);
    for (const char of cands) {
      const best = groups
        .map((g, i) => ({ i, lvl: levelSum(g) }))
        .filter(({ i }) => groupNeedsRole(groups[i]) && canAdd(char, groups[i], maxGS))
        .sort((a, b) => a.lvl - b.lvl)[0];
      if (best) { groups[best.i].push(char); seeded.add(char.id); }
    }
  }

  // Phase 1: Seed mandatory roles
  seedRole(isProperTank, g => !hasTank(g), (a, b) => {
    if (a.profession === 'Paladyn' && b.profession !== 'Paladyn') return -1;
    if (b.profession === 'Paladyn' && a.profession !== 'Paladyn') return 1;
    return b.level - a.level;
  });
  seedRole(c => c.profession === 'Tropiciel', g => !hasTropiciel(g), (a, b) => b.level - a.level);

  // Seed Mags proportionally: target = floor(totalMags / nGroups) per group
  // (ensures e.g. 13 mags / 5 groups → each group gets 2 seeded mags, not just 1)
  const magTarget = Math.max(1, Math.floor((profCounts['Mag'] ?? 0) / nGroups));
  for (let round = 1; round <= magTarget; round++) {
    seedRole(
      c => c.profession === 'Mag',
      g => countProf(g, 'Mag') < round,
      (a, b) => b.level - a.level,
    );
  }

  // Phase 2: Fill remaining — combined score: level balance + profession balance
  const remaining = sorted.filter(c => !seeded.has(c.id));
  for (const char of remaining) {
    const lvlSums = groups.map(g => levelSum(g));
    const avgLvl = lvlSums.reduce((s, x) => s + x, 0) / nGroups || 1;
    const profTarget = (profCounts[char.profession] ?? 0) / nGroups;

    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let gi = 0; gi < groups.length; gi++) {
      if (!canAdd(char, groups[gi], maxGS)) continue;
      const lvlScore = -(lvlSums[gi] - avgLvl) / avgLvl; // prefer below-average groups
      const profScore = (profTarget - countProf(groups[gi], char.profession)) * 2;
      const score = lvlScore * 3 + profScore;
      if (score > bestScore) { bestScore = score; bestIdx = gi; }
    }
    if (bestIdx >= 0) groups[bestIdx].push(char);
  }

  // Phase 3: Fix owner conflicts, constraints, balance
  const ejected = fixOwnerConflicts(groups, maxGS);
  for (const c of ejected) {
    const dst = groups.findIndex(g => canAdd(c, g, maxGS));
    if (dst >= 0) groups[dst].push(c);
  }

  fixHardConstraints(groups, maxGS);
  fixOwnerConflicts(groups, maxGS);
  fixHardConstraints(groups, maxGS);

  // Phase 4: Balance levels, then equalise profession distribution
  balanceLevels(groups, maxGS);
  balanceProfessions(groups, characters);

  // Phase 5: Add rebitki fairly
  placeRebitki(groups, characters, maxGS);
  fixHardConstraints(groups, maxGS);

  return buildResult(groups, characters, targetLevel, minGS, maxGS);
}

// ─── result scoring ───────────────────────────────────────────────────────────

function scoreResult(r: GenerationResult): [number, number, number, number, number] {
  const uniquePlaced = new Set(r.groups.flatMap(g => g.members.map(c => c.id))).size;
  const hardOk = r.groups.filter(g => g.hasTropiciel && g.hasMagOrPaladyn && g.bestTank !== null).length;
  const avgs = r.groups.map(g => g.rawAvgLevelRatio);
  const mean = avgs.length ? avgs.reduce((s, x) => s + x, 0) / avgs.length : 0;
  const variance = avgs.length ? avgs.reduce((s, x) => s + (x - mean) ** 2, 0) / avgs.length : 0;
  const avgDiv = r.groups.length
    ? r.groups.reduce((s, g) => s + g.professionDiversity, 0) / r.groups.length
    : 0;
  return [-r.unplacedRequired.length, uniquePlaced, hardOk, -variance * 100, avgDiv];
}

function isBetter(a: GenerationResult, b: GenerationResult): boolean {
  const qa = scoreResult(a);
  const qb = scoreResult(b);
  for (let i = 0; i < qa.length; i++) {
    if (Math.abs(qa[i] - qb[i]) > 0.0001) return qa[i] > qb[i];
  }
  return false;
}

// ─── public entry point ───────────────────────────────────────────────────────

export function generateGroups(
  characters: Character[],
  targetLevel: number,
  minGroupSize: number,
  maxGroupSize: number,
): GenerationResult {
  if (!characters.length) {
    return { groups: [], unplacedRequired: [], remainingFights: [] };
  }

  const n = characters.length;
  // nMax: most groups where each can still reach minGroupSize (floor(n/minGS))
  const nMax = Math.max(1, Math.floor(n / Math.max(1, minGroupSize)));
  // nMin: try at least half that range so we explore fewer-but-fuller groups
  const nMin = Math.max(1, Math.ceil(n / maxGroupSize));

  let best: GenerationResult | null = null;
  // Try from nMax down to 1 (but at least nMin to avoid wasting time)
  for (let ng = nMax; ng >= Math.min(nMin, nMax); ng--) {
    const r = tryGenerateFixed(characters, targetLevel, minGroupSize, maxGroupSize, ng);
    if (!best || isBetter(r, best)) best = r;
    if (r.unplacedRequired.length === 0 &&
        r.groups.every(g => g.hasTropiciel && g.hasMagOrPaladyn && g.bestTank !== null)) break;
  }

  return best!;
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

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
