import { useState, useEffect, useRef } from 'react';
import {
  Stack, Row, Grid, H1, H2, H3, Text, Card, CardHeader, CardBody,
  Button, TextInput, Select, TextArea, Table, Pill, Stat, Callout,
  Divider, Spacer, IconButton,
} from './ui';
import { generateGroups, parseCSV } from './algorithm';
import type { Character, GenerationResult } from './types';
import { PROFESSIONS, EQUIP_LABELS } from './types';

// ─── localStorage state hook ──────────────────────────────────────────────────

function useLS<T>(key: string, defaultValue: T): [T, (v: T | ((p: T) => T)) => void] {
  const k = `mgp_${key}`;
  const [state, setState] = useState<T>(() => {
    try {
      const item = localStorage.getItem(k);
      return item ? (JSON.parse(item) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const setValue = (value: T | ((prev: T) => T)) => {
    setState(prev => {
      const next = typeof value === 'function' ? (value as (p: T) => T)(prev) : value;
      try { localStorage.setItem(k, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Sync across tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === k && e.newValue) {
        try { setState(JSON.parse(e.newValue) as T); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [k]);

  return [state, setValue];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const profOptions = PROFESSIONS.map(p => ({ value: p, label: p }));
const equipOptions = Object.entries(EQUIP_LABELS).map(([v, l]) => ({
  value: v, label: `${v} — ${l}`,
}));

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [characters, setCharacters] = useLS<Character[]>('chars_v3', []);
  const [targetLevel, setTargetLevel] = useLS<string>('targetLevel', '50');
  const [minGroupSize, setMinGroupSize] = useLS<string>('minGS', '6');
  const [maxGroupSize, setMaxGroupSize] = useLS<string>('maxGS', '10');
  const [result, setResult] = useLS<GenerationResult | null>('result', null);
  const [tab, setTab] = useLS<string>('tab', 'decl');

  // Add-character form
  const [fOwner, setFOwner] = useLS<string>('fo', '');
  const [fChar, setFChar] = useLS<string>('fc', '');
  const [fProf, setFProf] = useLS<string>('fp', 'Wojownik');
  const [fLevel, setFLevel] = useLS<string>('fl', '50');
  const [fEquip, setFEquip] = useLS<string>('fe', '3');
  const [fFights, setFFights] = useLS<string>('ff', '1');

  // CSV import
  const [csvText, setCsvText] = useLS<string>('csv', '');
  const [csvErrors, setCsvErrors] = useLS<string[]>('csvErr', []);

  const tl   = Math.max(1, parseInt(targetLevel) || 50);
  const minGS = Math.max(2, parseInt(minGroupSize) || 6);
  const maxGS = Math.max(minGS + 1, parseInt(maxGroupSize) || 10);

  const addChar = () => {
    if (!fOwner.trim() || !fChar.trim()) return;
    const newChar: Character = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      owner: fOwner.trim(),
      characterName: fChar.trim(),
      profession: fProf as Character['profession'],
      level: Math.max(1, parseInt(fLevel) || tl),
      equipQuality: Math.min(5, Math.max(1, parseInt(fEquip) || 3)),
      availableFights: Math.max(1, parseInt(fFights) || 1),
    };
    setCharacters(prev => [...prev, newChar]);
    setFChar('');
  };

  const importCSV = () => {
    const { chars, errors } = parseCSV(csvText);
    setCsvErrors(errors);
    if (chars.length > 0) {
      setCharacters(prev => [...prev, ...chars]);
      setCsvText('');
    }
  };

  const removeChar = (id: string) =>
    setCharacters(prev => prev.filter(c => c.id !== id));

  const handleGenerate = () => {
    setResult(generateGroups(characters, tl, minGS, maxGS));
    setTab('groups');
  };

  const requiredCount = characters.filter(c => c.availableFights === 1).length;
  const optionalCount = characters.filter(c => c.availableFights > 1).length;

  return (
    <div className="app-shell">
      <Stack gap={20}>

        {/* ── Header ── */}
        <Row align="center" gap={12} wrap>
          <H1>⚔️ Margonem — Planer Grup</H1>
          <Spacer />
          <Row gap={12} align="center" wrap>
            <Row gap={6} align="center">
              <label className="form-label" style={{ marginBottom: 0 }}>Cel lvl</label>
              <TextInput
                value={targetLevel}
                onChange={setTargetLevel}
                type="number"
                style={{ width: 64 }}
              />
            </Row>
            <Row gap={4} align="center">
              <label className="form-label" style={{ marginBottom: 0 }}>Min.</label>
              <TextInput
                value={minGroupSize}
                onChange={setMinGroupSize}
                type="number"
                style={{ width: 52 }}
              />
              <Text tone="tertiary">–</Text>
              <label className="form-label" style={{ marginBottom: 0 }}>Maks.</label>
              <TextInput
                value={maxGroupSize}
                onChange={setMaxGroupSize}
                type="number"
                style={{ width: 52 }}
              />
            </Row>
          </Row>
        </Row>

        {/* ── Summary strip ── */}
        {characters.length > 0 && (
          <Grid columns={4} gap={12}>
            <Stat value={characters.length} label="Wszystkich postaci" />
            <Stat value={requiredCount}     label="Wymaganych (1 walka)" />
            <Stat value={optionalCount}     label="Opcjonalnych (> 1 walki)" />
            <Stat
              value={result ? result.groups.length : '—'}
              label="Wygenerowanych grup"
              tone={result ? 'success' : undefined}
            />
          </Grid>
        )}

        {/* ── Tab bar ── */}
        <Row gap={8}>
          <Pill active={tab === 'decl'} onClick={() => setTab('decl')}>
            Deklaracje ({characters.length})
          </Pill>
          <Pill active={tab === 'groups'} onClick={() => setTab('groups')}>
            Grupy{result ? ` (${result.groups.length})` : ''}
          </Pill>
        </Row>

        <Divider />

        {/* ════════════════════════════════════════════════════════ */}
        {/* DEKLARACJE TAB                                          */}
        {/* ════════════════════════════════════════════════════════ */}
        {tab === 'decl' && (
          <Stack gap={16}>

            {/* Manual add form */}
            <H2>Dodaj postać ręcznie</H2>
            <Row gap={8} wrap align="end">
              <Stack gap={4} style={{ flex: '1 1 100px', minWidth: 88 }}>
                <label className="form-label">Gracz</label>
                <TextInput value={fOwner} onChange={setFOwner} placeholder="Nick gracza" />
              </Stack>
              <Stack gap={4} style={{ flex: '1 1 100px', minWidth: 88 }}>
                <label className="form-label">Postać</label>
                <TextInput value={fChar} onChange={setFChar} placeholder="Nazwa postaci" />
              </Stack>
              <Stack gap={4} style={{ flex: '1 1 150px', minWidth: 130 }}>
                <label className="form-label">Profesja</label>
                <Select value={fProf} onChange={setFProf} options={profOptions} />
              </Stack>
              <Stack gap={4} style={{ flex: '0 0 76px' }}>
                <label className="form-label">Poziom</label>
                <TextInput value={fLevel} onChange={setFLevel} type="number" />
              </Stack>
              <Stack gap={4} style={{ flex: '1 1 170px', minWidth: 150 }}>
                <label className="form-label">Jakość ekwipunku</label>
                <Select value={fEquip} onChange={setFEquip} options={equipOptions} />
              </Stack>
              <Stack gap={4} style={{ flex: '0 0 64px' }}>
                <label className="form-label">Walki</label>
                <TextInput value={fFights} onChange={setFFights} type="number" />
              </Stack>
              <Button
                variant="primary"
                onClick={addChar}
                disabled={!fOwner.trim() || !fChar.trim()}
              >
                Dodaj
              </Button>
            </Row>

            <Divider />

            {/* CSV import */}
            <Stack gap={8}>
              <H3>Import z arkusza (CSV / Excel)</H3>
              <Text size="small" tone="secondary">
                Wklej wiersze z arkusza (separator: tab lub średnik).
                Kolejność: Gracz ; Postać ; Profesja ; Poziom ; Jakość(1–5) ; Walki(opcj.)
              </Text>
              <Text size="small" tone="tertiary">
                Skróty profesji: W=Wojownik, M=Mag, Ł/L=Łowca, Tr=Tropiciel, P=Paladyn, TO/T=Tancerz Ostrzy
              </Text>
              <TextArea
                value={csvText}
                onChange={setCsvText}
                placeholder={'KrólBajt;Dragonek;Wojownik;48;3;1\nElvira;Moonshade;Mag;52;4;2'}
                rows={4}
              />
              {csvErrors.length > 0 && (
                <Callout tone="warning" title="Błędy w CSV">
                  {csvErrors.map((e, i) => (
                    <Text key={i} size="small">{e}</Text>
                  ))}
                </Callout>
              )}
              <Row>
                <Button
                  variant="secondary"
                  onClick={importCSV}
                  disabled={!csvText.trim()}
                >
                  Importuj
                </Button>
              </Row>
            </Stack>

            <Divider />

            {/* Character list */}
            {characters.length === 0 ? (
              <Callout tone="neutral" title="Brak deklaracji">
                Dodaj postacie ręcznie lub zaimportuj z CSV/arkusza.
              </Callout>
            ) : (
              <Stack gap={12}>
                <Row align="center" gap={8}>
                  <H2>Lista postaci ({characters.length})</H2>
                  <Spacer />
                  <Button
                    variant="ghost"
                    onClick={() => { setCharacters([]); setResult(null); }}
                  >
                    Wyczyść wszystko
                  </Button>
                  {characters.length >= minGS && (
                    <Button variant="primary" onClick={handleGenerate}>
                      Generuj grupy
                    </Button>
                  )}
                </Row>

                <Table
                  stickyHeader
                  striped
                  headers={['Gracz', 'Postać', 'Profesja', 'Poziom', 'Jakość ekwipunku', 'Walki', '']}
                  columnAlign={['left', 'left', 'left', 'right', 'left', 'center', 'center']}
                  rows={characters.map(c => [
                    c.owner,
                    c.characterName,
                    c.profession,
                    c.level,
                    `${c.equipQuality} — ${EQUIP_LABELS[c.equipQuality]}`,
                    c.availableFights === 1
                      ? <Pill size="sm">wymagana</Pill>
                      : <Pill size="sm" tone="info">{c.availableFights}×</Pill>,
                    <IconButton
                      key="del"
                      title="Usuń postać"
                      onClick={() => removeChar(c.id)}
                    >
                      <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                        <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
                      </svg>
                    </IconButton>,
                  ])}
                />

                {characters.length < minGS && (
                  <Callout tone="info" title="Zbyt mało postaci">
                    Potrzeba minimum {minGS} postaci wymaganych, by wygenerować grupę.
                  </Callout>
                )}
              </Stack>
            )}
          </Stack>
        )}

        {/* ════════════════════════════════════════════════════════ */}
        {/* GRUPY TAB                                               */}
        {/* ════════════════════════════════════════════════════════ */}
        {tab === 'groups' && (
          <Stack gap={16}>
            <Row align="center" gap={8}>
              <H2>Wygenerowane grupy</H2>
              <Spacer />
              <Button
                variant="secondary"
                onClick={handleGenerate}
                disabled={characters.length < minGS}
              >
                Przelicz
              </Button>
            </Row>

            {!result ? (
              <Callout tone="info" title="Grupy nie zostały jeszcze wygenerowane">
                Przejdź do zakładki Deklaracje, dodaj co najmniej {minGS} postaci
                i kliknij „Generuj grupy".
              </Callout>
            ) : (
              <Stack gap={12}>

                {result.groups.length === 0 ? (
                  <Callout tone="warning" title="Brak pełnych grup">
                    Nie udało się ułożyć żadnej grupy min. {minGS}-osobowej.
                    Sprawdź deklaracje lub dodaj więcej graczy.
                  </Callout>
                ) : (
                  result.groups.map(group => {
                    const isFull = group.members.length === maxGS;
                    const fillTone =
                      isFull ? 'success'
                      : group.members.length >= Math.round((minGS + maxGS) / 2) ? 'info'
                      : 'warning';

                    const paddedLevelPct = `${(group.avgLevelRatio * 100).toFixed(0)}%`;
                    const rawLevelPct    = `${(group.rawAvgLevelRatio * 100).toFixed(0)}%`;
                    const levelTone =
                      group.avgLevelRatio >= 0.85 && group.avgLevelRatio <= 1.15 ? 'success'
                      : group.avgLevelRatio >= 0.70 ? 'warning'
                      : 'danger';

                    const tank = group.bestTank;
                    const tankTone =
                      !tank ? 'warning'
                      : tank.profession === 'Paladyn' && tank.equipQuality >= 4 ? 'success'
                      : tank.profession === 'Paladyn' ? 'info'
                      : tank.equipQuality >= 4 ? 'info'
                      : 'warning';

                    return (
                      <Card key={group.id} collapsible defaultOpen>
                        <CardHeader
                          trailing={
                            <Row gap={6} wrap>
                              <Pill size="sm" tone={group.hasTropiciel ? 'success' : 'warning'}>
                                Tr {group.hasTropiciel ? 'OK' : '!'}
                              </Pill>
                              <Pill size="sm" tone={group.hasMagOrPaladyn ? 'success' : 'warning'}>
                                M/P {group.hasMagOrPaladyn ? 'OK' : '!'}
                              </Pill>
                              <Pill size="sm" tone={tankTone}>
                                {!tank
                                  ? 'Tank !'
                                  : tank.profession === 'Paladyn'
                                  ? `Pal eq${tank.equipQuality}`
                                  : `Woj eq${tank.equipQuality}`}
                              </Pill>
                              <Pill size="sm" tone={fillTone}>
                                {group.members.length}/{maxGS} os.
                              </Pill>
                            </Row>
                          }
                        >
                          Grupa {group.id}
                        </CardHeader>
                        <CardBody>
                          <Stack gap={12}>
                            <Grid columns={4} gap={10}>
                              <Stat
                                value={paddedLevelPct}
                                label={`Śr. poziom z pustymi (cel: ${tl})`}
                                tone={levelTone}
                              />
                              <Stat
                                value={group.avgEquipQuality.toFixed(2)}
                                label={`Śr. ekwip. z pustymi (/${maxGS})`}
                              />
                              <Stat
                                value={`${Object.keys(group.professionCount).length}/6`}
                                label="Różnorodność profesji"
                              />
                              <Stat
                                value={
                                  !tank ? '—'
                                  : tank.profession === 'Paladyn'
                                  ? `Pal ${EQUIP_LABELS[tank.equipQuality]}`
                                  : `Woj ${EQUIP_LABELS[tank.equipQuality]}`
                                }
                                label="Najlepszy tank"
                                tone={
                                  !tank ? 'danger'
                                  : tank.profession === 'Paladyn' && tank.equipQuality >= 4 ? 'success'
                                  : tank.equipQuality >= 3 ? undefined
                                  : 'warning'
                                }
                              />
                            </Grid>

                            {!isFull && (
                              <Text size="small" tone="tertiary">
                                Rzeczywiste (tylko obecni): poziom {rawLevelPct},
                                ekwip. {group.rawAvgEquipQuality.toFixed(2)} —
                                brakuje {maxGS - group.members.length}{' '}
                                {maxGS - group.members.length === 1 ? 'miejsca' : 'miejsc'},
                                liczone jako lvl 0 / jakość 0
                              </Text>
                            )}

                            <Row gap={6} wrap>
                              {PROFESSIONS.map(prof => {
                                const cnt = group.professionCount[prof] ?? 0;
                                if (!cnt) return null;
                                return (
                                  <Pill key={prof} size="sm" active>
                                    {prof} ×{cnt}
                                  </Pill>
                                );
                              })}
                            </Row>

                            {group.ownerConflicts.length > 0 && (
                              <Callout tone="warning" title="Uwaga: nie udało się rozdzielić wszystkich postaci">
                                {group.ownerConflicts.map(owner => {
                                  const chars = group.members.filter(c => c.owner === owner);
                                  return (
                                    <Text key={owner} size="small">
                                      {owner}: {chars.map(c => c.characterName).join(', ')} — za mało grup, by rozdzielić
                                    </Text>
                                  );
                                })}
                              </Callout>
                            )}

                            {!group.hasTropiciel && (
                              <Callout tone="warning">
                                Brak Tropiciela — brak dostępnych Tropicieli do przypisania.
                              </Callout>
                            )}
                            {!group.hasMagOrPaladyn && (
                              <Callout tone="warning">
                                Brak Maga lub Paladyna — brak dostępnych postaci tej klasy.
                              </Callout>
                            )}

                            <Table
                              striped
                              headers={['Gracz', 'Postać', 'Profesja', 'Poziom', 'Jakość ekwip.', 'Walki']}
                              columnAlign={['left', 'left', 'left', 'right', 'left', 'center']}
                              rows={group.members.map(c => [
                                c.owner,
                                c.characterName,
                                c.profession,
                                c.level,
                                `${c.equipQuality} — ${EQUIP_LABELS[c.equipQuality]}`,
                                c.availableFights === 1 ? '1 (wym.)' : `${c.availableFights}×`,
                              ])}
                            />
                          </Stack>
                        </CardBody>
                      </Card>
                    );
                  })
                )}

                {/* Unplaced required */}
                {result.unplacedRequired.length > 0 && (
                  <Stack gap={8}>
                    <Divider />
                    <H2>Wymagane postacie bez grupy ({result.unplacedRequired.length})</H2>
                    <Callout tone="warning" title="Postacie z 1 walką nieprzypisane do grupy">
                      Nie znalazły się w żadnej grupie min. {minGS}-osobowej.
                    </Callout>
                    <Table
                      striped
                      headers={['Gracz', 'Postać', 'Profesja', 'Poziom', 'Jakość ekwipunku']}
                      columnAlign={['left', 'left', 'left', 'right', 'left']}
                      rows={result.unplacedRequired.map(c => [
                        c.owner, c.characterName, c.profession, c.level,
                        `${c.equipQuality} — ${EQUIP_LABELS[c.equipQuality]}`,
                      ])}
                    />
                  </Stack>
                )}

                {/* Unplaced optional */}
                {result.unplacedOptional.length > 0 && (
                  <Stack gap={8}>
                    <Divider />
                    <H2>Opcjonalne postacie bez przypisania ({result.unplacedOptional.length})</H2>
                    <Text tone="secondary" size="small">
                      Grupy były pełne lub limitowały daną profesję.
                    </Text>
                    <Table
                      striped
                      headers={['Gracz', 'Postać', 'Profesja', 'Poziom', 'Jakość ekwipunku', 'Dostępnych walk']}
                      columnAlign={['left', 'left', 'left', 'right', 'left', 'center']}
                      rows={result.unplacedOptional.map(c => [
                        c.owner, c.characterName, c.profession, c.level,
                        `${c.equipQuality} — ${EQUIP_LABELS[c.equipQuality]}`,
                        c.availableFights,
                      ])}
                    />
                  </Stack>
                )}

                {result.unplacedRequired.length === 0 && result.unplacedOptional.length === 0 && (
                  <Callout tone="success" title="Wszystkie postacie zostały przypisane do grup." />
                )}

              </Stack>
            )}
          </Stack>
        )}

      </Stack>
    </div>
  );
}
