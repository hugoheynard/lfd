import type { BinTypeView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  archivedOnLabel,
  binDraftOf,
  binTraitsLabel,
  draftInnerVolumeLiters,
  readBinDraft,
  sameBinPayload,
  splitBins,
  type BinTypeDraft,
} from './delivery-bins';

function bin(id: string, archivedAt: string | null = null): BinTypeView {
  return {
    id,
    name: `Bac ${id}`,
    outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
    inner: { lengthCm: 56, widthCm: 36, heightCm: 27 },
    innerVolumeLiters: 54,
    isotherm: false,
    maxStack: 5,
    divisible: true,
    archivedAt,
  };
}

const FILLED: BinTypeDraft = binDraftOf(bin('M'));

describe('readBinDraft', () => {
  it('rend la charge complète d’un formulaire rempli, nom rogné', () => {
    expect(readBinDraft({ ...FILLED, name: '  Bac M  ' })).toEqual({
      ok: true,
      payload: {
        name: 'Bac M',
        outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
        inner: { lengthCm: 56, widthCm: 36, heightCm: 27 },
        isotherm: false,
        maxStack: 5,
        divisible: true,
      },
    });
  });

  it('refuse un formulaire vide en demandant d’abord le nom', () => {
    expect(readBinDraft(binDraftOf(undefined))).toEqual({
      ok: false,
      issue: 'Nommez le type de bac.',
    });
  });

  it('nomme la dimension qui manque, et de quel côté', () => {
    expect(readBinDraft({ ...FILLED, inner: { ...FILLED.inner, widthCm: null } })).toEqual({
      ok: false,
      issue: 'Saisissez la largeur intérieure.',
    });
  });

  it('refuse une dimension hors bornes ou non entière', () => {
    for (const heightCm of [0, 301, 12.5]) {
      const reading = readBinDraft({ ...FILLED, outer: { ...FILLED.outer, heightCm } });
      expect(reading.ok).toBe(false);
    }
  });

  it('🔴 refuse un intérieur plus grand que l’extérieur, en disant les deux mesures', () => {
    expect(readBinDraft({ ...FILLED, inner: { ...FILLED.inner, heightCm: 31 } })).toEqual({
      ok: false,
      issue: 'La hauteur intérieure (31 cm) dépasse la hauteur extérieure (30 cm).',
    });
  });

  it('admet un intérieur égal à l’extérieur', () => {
    expect(readBinDraft({ ...FILLED, inner: FILLED.outer }).ok).toBe(true);
  });

  it('demande la pile, puis la borne de 1 à 20', () => {
    expect(readBinDraft({ ...FILLED, maxStack: null })).toEqual({
      ok: false,
      issue: 'Dites combien de bacs tiennent dans une pile.',
    });
    expect(readBinDraft({ ...FILLED, maxStack: 21 })).toEqual({
      ok: false,
      issue: 'Une pile compte de 1 à 20 bacs.',
    });
  });

  it('refuse un nom de plus de 60 caractères', () => {
    expect(readBinDraft({ ...FILLED, name: 'x'.repeat(61) }).ok).toBe(false);
  });
});

describe('sameBinPayload', () => {
  it('ne voit rien à écrire quand la fiche est celle du type', () => {
    const reading = readBinDraft(FILLED);
    expect(reading.ok && sameBinPayload(bin('M'), reading.payload)).toBe(true);
  });

  it('voit une case cochée', () => {
    const reading = readBinDraft({ ...FILLED, isotherm: true });
    expect(reading.ok && sameBinPayload(bin('M'), reading.payload)).toBe(false);
  });
});

describe('draftInnerVolumeLiters', () => {
  it('arrondit à l’inférieur, comme le serveur', () => {
    expect(draftInnerVolumeLiters({ lengthCm: 56, widthCm: 36, heightCm: 27 })).toBe(54);
  });

  it('ne dit rien tant qu’une dimension manque', () => {
    expect(draftInnerVolumeLiters({ lengthCm: 56, widthCm: null, heightCm: 27 })).toBeNull();
  });
});

describe('les libellés', () => {
  it('disent le froid, la pile et la cloison', () => {
    expect(binTraitsLabel(bin('M'))).toBe(
      'Sec · pile de 5 au plus · cloisonnable en deux demi-bacs',
    );
    expect(binTraitsLabel({ ...bin('F'), isotherm: true, divisible: false })).toBe(
      'Isotherme · pile de 5 au plus',
    );
  });

  it('datent l’archivage au jour de Paris', () => {
    expect(archivedOnLabel('2026-02-01T23:30:00.000Z')).toBe('archivé le 2 février 2026');
  });
});

describe('splitBins', () => {
  it('garde l’ordre des proposés, et met l’archivé le plus récent en tête', () => {
    const catalogue = splitBins([
      bin('A', '2026-01-01T10:00:00.000Z'),
      bin('B'),
      bin('C', '2026-03-01T10:00:00.000Z'),
      bin('D'),
    ]);
    expect(catalogue.active.map((type) => type.id)).toEqual(['B', 'D']);
    expect(catalogue.archived.map((type) => type.id)).toEqual(['C', 'A']);
  });
});
