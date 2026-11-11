import { describe, expect, it } from 'vitest';

import {
  canPoseComposition,
  composerColumns,
  draftPayload,
  posePayload,
  templatePayload,
  templateRefusal,
  type Composition,
} from '../mercuriale-composition';
import { NO_PROMOTION_POLICY } from '../promotion-policy';

/** **Une mercuriale en composition** : quand elle se pose, et ce qui part. */

const LINE = { sku: 'VIE-001-1', unitPriceMillicents: 90_000 };
const READY: Composition = {
  label: ' Mercuriale 2027 ',
  validFrom: '2027-01-01',
  validTo: '',
  lines: [LINE],
  policy: NO_PROMOTION_POLICY,
  discount: null,
};

describe('canPoseComposition', () => {
  it('pose un nom, une date de début et un prix ; ou une remise complète seule', () => {
    expect(canPoseComposition(READY)).toBe(true);
    expect(
      canPoseComposition({
        ...READY,
        lines: [],
        discount: { mode: 'all_except', baseBp: 1500, lines: [] },
      }),
    ).toBe(true);
  });

  it('refuse sans nom, sans début, vide, avec une remise incomplète ou une politique vide', () => {
    expect(canPoseComposition({ ...READY, label: '  ' })).toBe(false);
    expect(canPoseComposition({ ...READY, validFrom: '' })).toBe(false);
    expect(canPoseComposition({ ...READY, lines: [] })).toBe(false);
    expect(
      canPoseComposition({ ...READY, discount: { mode: 'all_except', baseBp: null, lines: [] } }),
    ).toBe(false);
    expect(canPoseComposition({ ...READY, policy: { mode: 'selected', promotionIds: [] } })).toBe(
      false,
    );
  });
});

describe('les corps envoyés', () => {
  it('pose à minuit à Paris, sans fin quand le champ est vide', () => {
    expect(posePayload(READY)).toMatchObject({
      label: 'Mercuriale 2027',
      validFrom: '2026-12-31T23:00:00.000Z',
      validTo: null,
      lines: [LINE],
      generalDiscount: null,
    });
  });

  it('le brouillon garde des dates vides en `null`', () => {
    expect(draftPayload({ ...READY, validFrom: '' })).toMatchObject({
      validFrom: null,
      validTo: null,
    });
  });

  it('le gabarit : un palier à partir de 1 par article, et un refus qui nomme ce qui manque', () => {
    expect(templatePayload(READY.label, READY.lines).lines).toEqual([
      {
        sku: LINE.sku,
        tiers: [{ minQuantity: 1, unitPriceMillicents: 90_000 }],
        plannedVolume: null,
      },
    ]);
    expect(templateRefusal(' ', [LINE])).toContain('Nommez');
    expect(templateRefusal('Grille', [])).toContain('Aucun prix saisi');
    expect(templateRefusal('Grille', [LINE])).toBeNull();
  });
});

describe('composerColumns', () => {
  it('montre la famille en « Toutes » et dit ce que comparent prix et effort', () => {
    const columns = composerColumns({ allShelves: true, negotiated: false, hasFirmPrices: false });
    expect(columns.map((column) => column.key)).toContain('shelf');
    expect(columns.find((column) => column.key === 'current')?.label).toContain('sans mercuriale');
    const filtered = composerColumns({ allShelves: false, negotiated: true, hasFirmPrices: true });
    expect(filtered.map((column) => column.key)).not.toContain('shelf');
    expect(filtered.find((column) => column.key === 'effort')?.label).toContain('prix ferme');
  });
});
