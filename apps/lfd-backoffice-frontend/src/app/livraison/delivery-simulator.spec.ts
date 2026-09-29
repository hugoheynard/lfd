import { describe, expect, it } from 'vitest';

import {
  buildPayload,
  copyNameOf,
  draftKey,
  EMPTY_SETTINGS,
  emptyStop,
  exampleScenario,
  gpsText,
  importScenario,
  nextStopId,
  parseGps,
  type ScenarioDraft,
  scenarioDraftOf,
  scenarioFileContent,
  scenarioNameError,
  scenarioSizeLabel,
  SIMULATION_MAX_STOPS,
  type SettingsDraft,
} from './delivery-simulator';

const SETTINGS: SettingsDraft = {
  earliestDeparture: '07:00',
  maxRoundMinutes: 240,
  stopMinutes: 5,
  safetyMarginMinutes: 20,
  multiplePassages: false,
};

const example = (): ScenarioDraft => exampleScenario(['Camionnette'], SETTINGS);

describe('le simulateur — lire des coordonnées collées', () => {
  it('lit « lat, lng » avec une virgule', () => {
    expect(parseGps('45.4485, 6.9823')).toEqual({ ok: true, gps: { lat: 45.4485, lng: 6.9823 } });
  });

  it('lit « lat lng » avec des espaces, et des négatifs', () => {
    expect(parseGps('  -33.9  18.42 ')).toEqual({ ok: true, gps: { lat: -33.9, lng: 18.42 } });
  });

  it('refuse le vide en donnant un exemple', () => {
    const parsed = parseGps('  ');
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.message).toContain('45.4485, 6.9823');
  });

  it('refuse la virgule décimale à la française, ambiguë', () => {
    expect(parseGps('45,4485, 6,9823').ok).toBe(false);
  });

  it('refuse un seul nombre, ou trois', () => {
    expect(parseGps('45.4485').ok).toBe(false);
    expect(parseGps('45.4, 6.9, 1').ok).toBe(false);
  });

  it('refuse du texte', () => {
    expect(parseGps('Val d’Isère').ok).toBe(false);
  });

  it('refuse une latitude hors bornes en rappelant l’ordre', () => {
    const parsed = parseGps('6.98, 145.44');
    expect(parsed.ok).toBe(true);
    const inverted = parseGps('145.44, 6.98');
    expect(!inverted.ok && inverted.message).toContain('latitude, longitude');
  });

  it('refuse une longitude hors bornes', () => {
    expect(parseGps('45, 181').ok).toBe(false);
  });

  it('se recolle tel qu’il a été lu', () => {
    expect(gpsText({ lat: 45.4602, lng: 6.9649 })).toBe('45.4602, 6.9649');
  });
});

describe('le simulateur — identifiants locaux', () => {
  it('ne réutilise jamais un identifiant présent', () => {
    const stops = example().stops;
    expect(nextStopId(stops)).toBe('arret-7');
    expect(nextStopId([])).toBe('arret-1');
    expect(emptyStop(stops.slice(2)).id).toBe('arret-7');
  });
});

describe('le simulateur — construire le corps de « Proposer »', () => {
  it('rend le scénario d’exemple tel quel, départ réglé, en tournées neuves', () => {
    const built = buildPayload(example());
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.payload.stops).toHaveLength(6);
    expect(built.payload.stops[0]).toEqual({
      id: 'arret-1',
      label: 'Arrêt La Daille',
      gps: { lat: 45.4602, lng: 6.9649 },
      window: null,
    });
    expect(built.payload.departure).toBeNull();
    expect(built.payload.settings).toEqual({
      earliestDeparture: '07:00',
      maxRoundMinutes: 240,
      stopMinutes: 5,
      safetyMarginMinutes: 20,
      defaultMode: 'new_rounds',
      multiplePassages: false,
    });
  });

  it('pose une fenêtre « avant » quand seul la fin est saisie, et une fenêtre pleine sinon', () => {
    const draft = example();
    const stops = draft.stops.map((stop, index) =>
      index === 0
        ? { ...stop, windowEnd: '10:00' }
        : index === 1
          ? { ...stop, windowStart: '08:00', windowEnd: '09:30' }
          : stop,
    );
    const built = buildPayload({ ...draft, stops });
    expect(built.ok && built.payload.stops[0]?.window).toEqual({ start: null, end: '10:00' });
    expect(built.ok && built.payload.stops[1]?.window).toEqual({ start: '08:00', end: '09:30' });
  });

  it('refuse un début sans fin et une fenêtre à l’envers, en nommant l’arrêt', () => {
    const draft = example();
    const stops = draft.stops.map((stop, index) =>
      index === 0
        ? { ...stop, windowStart: '08:00' }
        : index === 1
          ? { ...stop, windowStart: '10:00', windowEnd: '09:00' }
          : stop,
    );
    const built = buildPayload({ ...draft, stops });
    expect(built.ok).toBe(false);
    expect(!built.ok && built.errors).toEqual([
      '« Arrêt La Daille » : une fenêtre a besoin d’une fin (le début seul ne dit rien).',
      '« Arrêt Val d’Isère centre » : la fenêtre finit avant de commencer.',
    ]);
  });

  it('rend toutes les fautes d’un coup : nom, coordonnées, véhicules, réglages', () => {
    const built = buildPayload({
      stops: [
        {
          id: 'arret-1',
          label: '',
          coordinates: 'ici',
          windowStart: '',
          windowEnd: '',
          stopMinutes: null,
        },
      ],
      vehicles: [],
      settings: EMPTY_SETTINGS,
      departure: 'configured',
      departureCoordinates: '',
    });
    expect(!built.ok && built.errors).toHaveLength(4);
    expect(!built.ok && built.errors[0]).toBe('Arrêt n° 1 : nom requis.');
    expect(!built.ok && built.errors[3]).toContain(
      'Réglages incomplets : départ au plus tôt, durée maximale, temps de livraison sur place, marge de sécurité.',
    );
  });

  it('refuse un véhicule sans nom', () => {
    const built = buildPayload({ ...example(), vehicles: ['Camionnette', '  '] });
    expect(!built.ok && built.errors).toEqual(['Chaque véhicule a besoin d’un nom.']);
  });

  it('tient la borne du contrat sur les arrêts', () => {
    const one = example().stops[0];
    if (one === undefined) {
      throw new Error('exemple vide');
    }
    const stops = Array.from({ length: SIMULATION_MAX_STOPS + 1 }, (_, i) => ({
      ...one,
      id: `arret-${String(i + 1)}`,
    }));
    const built = buildPayload({ ...example(), stops });
    expect(!built.ok && built.errors).toEqual([`${String(SIMULATION_MAX_STOPS)} arrêts au plus.`]);
  });

  it('prend un point de départ saisi, et refuse un point illisible', () => {
    const custom = buildPayload({
      ...example(),
      departure: 'custom',
      departureCoordinates: '45.45 6.98',
    });
    expect(custom.ok && custom.payload.departure).toEqual({ lat: 45.45, lng: 6.98 });
    const bad = buildPayload({ ...example(), departure: 'custom', departureCoordinates: '' });
    expect(!bad.ok && bad.errors[0]).toMatch(/^Point de départ : /u);
  });
});

describe('le simulateur — exporter puis réimporter', () => {
  it('relit exactement ce qu’il a exporté', () => {
    const built = buildPayload({
      ...example(),
      departure: 'custom',
      departureCoordinates: '45.4485, 6.9823',
    });
    if (!built.ok) {
      throw new Error('exemple invalide');
    }
    const imported = importScenario(scenarioFileContent(built.payload));
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.draft.departure).toBe('custom');
    expect(imported.draft.departureCoordinates).toBe('45.4485, 6.9823');
    expect(buildPayload(imported.draft)).toEqual(built);
  });

  it('refuse un fichier qui n’est pas du JSON', () => {
    expect(importScenario('{ pas du json')).toEqual({
      ok: false,
      message: 'Ce fichier n’est pas du JSON lisible.',
    });
  });

  it('refuse un scénario hors contrat en nommant l’arrêt fautif', () => {
    const built = buildPayload(example());
    if (!built.ok) {
      throw new Error('exemple invalide');
    }
    const broken = {
      ...built.payload,
      stops: built.payload.stops.map((stop, index) =>
        index === 2 ? { ...stop, gps: { lat: 120, lng: 6 } } : stop,
      ),
    };
    const imported = importScenario(JSON.stringify(broken));
    expect(imported.ok).toBe(false);
    expect(!imported.ok && imported.message).toContain('arrêt n° 3');
    expect(!imported.ok && imported.message).toContain('latitude hors bornes');
  });
});

describe('le simulateur — le temps sur place par arrêt (L9-C8)', () => {
  it('ne l’envoie que s’il est saisi', () => {
    const draft = example();
    const stops = draft.stops.map((stop, index) =>
      index === 0 ? { ...stop, stopMinutes: 12 } : stop,
    );
    const built = buildPayload({ ...draft, stops });
    expect(built.ok && built.payload.stops[0]?.stopMinutes).toBe(12);
    expect(built.ok && 'stopMinutes' in (built.payload.stops[1] ?? {})).toBe(false);
  });

  it('refuse un temps hors bornes en nommant l’arrêt', () => {
    const draft = example();
    const stops = draft.stops.map((stop, index) =>
      index === 1 ? { ...stop, stopMinutes: 0 } : stop,
    );
    const built = buildPayload({ ...draft, stops });
    expect(built.ok).toBe(false);
    expect(!built.ok && built.errors[0]).toContain(
      '« Arrêt Val d’Isère centre » : temps sur place',
    );
  });

  it('refuse des réglages sans marge de sécurité, en la nommant', () => {
    const built = buildPayload({
      ...example(),
      settings: { ...SETTINGS, safetyMarginMinutes: null },
    });
    expect(!built.ok && built.errors).toContain('Réglages incomplets : marge de sécurité.');
  });

  it('relit un fichier d’avant la marge : champ vide, rien d’inventé', () => {
    const built = buildPayload(example());
    if (!built.ok) {
      throw new Error('exemple invalide');
    }
    const { safetyMarginMinutes: _dropped, ...older } = built.payload.settings;
    const draft = scenarioDraftOf({ ...built.payload, settings: older });
    expect(draft.settings.safetyMarginMinutes).toBeNull();
  });
});

describe('le simulateur — modifié depuis l’enregistrement (L9-C7)', () => {
  it('un scénario rouvert a l’empreinte de celui qu’on a enregistré', () => {
    const built = buildPayload({
      ...example(),
      stops: example().stops.map((s) => ({ ...s, stopMinutes: 7 })),
    });
    if (!built.ok) {
      throw new Error('exemple invalide');
    }
    const reopened = scenarioDraftOf(built.payload);
    const again = buildPayload(reopened);
    expect(again).toEqual(built);
    expect(draftKey(scenarioDraftOf(built.payload))).toBe(draftKey(reopened));
  });

  it('change d’empreinte au moindre changement, pas sur des espaces', () => {
    const draft = example();
    const renamed = { ...draft, vehicles: ['Camionnette 2'] };
    const padded = { ...draft, vehicles: ['  Camionnette '] };
    expect(draftKey(renamed)).not.toBe(draftKey(draft));
    expect(draftKey(padded)).toBe(draftKey(draft));
    expect(draftKey({ ...draft, settings: { ...SETTINGS, safetyMarginMinutes: 30 } })).not.toBe(
      draftKey(draft),
    );
  });

  it('ignore des coordonnées de départ quand le départ est le point réglé', () => {
    const draft = example();
    expect(draftKey({ ...draft, departureCoordinates: '45, 6' })).toBe(draftKey(draft));
  });
});

describe('le simulateur — nommer un scénario', () => {
  it('refuse un nom vide ou trop long', () => {
    expect(scenarioNameError('   ')).toBe('Donnez un nom au scénario.');
    expect(scenarioNameError('x'.repeat(81))).toBe('80 caractères au plus.');
    expect(scenarioNameError('Hiver, une camionnette de moins')).toBeNull();
  });

  it('propose une copie pour « Enregistrer sous… », rien pour un scénario neuf', () => {
    expect(copyNameOf('Samedi de février')).toBe('Samedi de février (copie)');
    expect(copyNameOf(null)).toBe('');
  });

  it('dit la taille d’un scénario', () => {
    expect(scenarioSizeLabel(1, 1)).toBe('1 arrêt · 1 véhicule');
    expect(scenarioSizeLabel(12, 3)).toBe('12 arrêts · 3 véhicules');
  });
});
