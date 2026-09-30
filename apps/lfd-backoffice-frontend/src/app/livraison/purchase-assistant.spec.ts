import { describe, expect, it } from 'vitest';

import {
  type AssistantDraft,
  bestFormatIndex,
  buildPayload,
  EMPTY_FLOOR,
  emptyFormat,
  formatLiters,
  placeBins,
} from './purchase-assistant';

const DRAFT: AssistantDraft = {
  floor: { ...EMPTY_FLOOR, lengthCm: 290, widthCm: 166, heightCm: 139 },
  gapCm: 1,
  formats: [
    {
      key: 1,
      name: 'Bac M',
      outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
      inner: { lengthCm: 57, widthCm: 37, heightCm: 20 },
      maxStack: 7,
    },
  ],
};

describe('l’assistant d’achat — la saisie', () => {
  it('traduit une saisie complète en corps, sans passage de roue', () => {
    const built = buildPayload(DRAFT);
    expect(built.ok && built.payload.floor.wheelArches).toBeNull();
  });

  it('nomme chaque cote vide au lieu d’inventer un zéro', () => {
    const built = buildPayload({
      ...DRAFT,
      floor: { ...DRAFT.floor, heightCm: null, arches: true },
      formats: [...DRAFT.formats, emptyFormat(DRAFT.formats)],
    });
    expect(built.ok).toBe(false);
    expect(built.ok ? [] : built.missing).toEqual([
      'hauteur du véhicule',
      'longueur des passages de roue',
      'saillie des passages de roue',
      'distance des passages de roue au fond',
      'Format 2, extérieur',
      'Format 2, intérieur',
      'Format 2, pile maximale',
    ]);
  });

  it('refuse une comparaison sans format', () => {
    const built = buildPayload({ ...DRAFT, formats: [] });
    expect(built.ok ? [] : built.missing).toEqual(['au moins un format']);
  });

  it('donne à un format ajouté une clé neuve', () => {
    expect(emptyFormat(DRAFT.formats).key).toBe(2);
  });
});

describe('l’assistant d’achat — le rendu', () => {
  it('met en avant le plus de volume utile, et personne si aucun n’en donne', () => {
    const view = (usefulLiters: number) => ({
      name: 'x',
      floorCount: 0,
      levels: 0,
      total: 0,
      usefulLiters,
      vehiclePercent: 0,
      heightLimit: 'stack' as const,
      rows: [],
    });
    expect(bestFormatIndex([view(10), view(30), view(20)])).toBe(1);
    expect(bestFormatIndex([view(0), view(0)])).toBeNull();
  });

  it('écrit les litres, puis les mètres cubes', () => {
    expect(formatLiters(432)).toBe('432 L');
    expect(formatLiters(6691)).toBe('6,69 m³');
  });

  it('centre les bacs d’une rangée, jeu retiré, et tourne ceux qui le sont', () => {
    const bins = placeBins(
      [{ fromCm: 61, depthCm: 41, count: 2, orientation: 'turned' }],
      { lengthCm: 60, widthCm: 40 },
      166,
      1,
    );
    expect(bins).toEqual([
      { x: 61.5, y: 22.5, depth: 40, across: 60, turned: true },
      { x: 61.5, y: 83.5, depth: 40, across: 60, turned: true },
    ]);
  });
});
