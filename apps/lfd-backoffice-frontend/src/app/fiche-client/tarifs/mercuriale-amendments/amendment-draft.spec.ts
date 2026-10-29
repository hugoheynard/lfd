import type { PosedMercurialeView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { endAmendment, priceAmendment, runningOptions, runningSkus } from './amendment-draft';

/**
 * **Ce que la saisie d'un avenant envoie** (`plan-tarif-date-sur-une-reference.md`,
 * T6) : un début vide vaut « dès maintenant » (jamais rétroactif), changer
 * le prix d'un article en cours l'arrête dans le même avenant, le motif est
 * exigé avant tout envoi.
 */

const MERCURIALE: PosedMercurialeView = {
  id: 'merc_1',
  label: 'Mercuriale 2027',
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: null,
  status: 'active',
  ruleCount: 2,
  skuCount: 2,
  createdBy: 'staff_1',
  createdByName: null,
  lines: [
    { sku: 'VIE-001-1', productName: 'Croissant', unitPriceMillicents: 90_000, minQuantity: 1 },
    {
      sku: 'VIE-003-1',
      productName: 'Chausson',
      unitPriceMillicents: 120_000,
      minQuantity: 1,
      validTo: '2026-02-01T00:00:00.000Z',
      status: 'expired',
    },
  ],
};

const RUNNING = runningSkus(MERCURIALE);

describe('priceAmendment', () => {
  it('ajoute un article hors grille, dès maintenant, jusqu’à la fin de la mercuriale', () => {
    const draft = priceAmendment(
      { sku: 'VIE-002-1', euros: 1.8, fromDay: '', toDay: '', reason: '  Ajout  ' },
      RUNNING,
    );

    expect(draft).toEqual({
      ok: true,
      payload: {
        validTo: null,
        reason: 'Ajout',
        lines: [{ sku: 'VIE-002-1', unitPriceMillicents: 180_000 }],
        endedSkus: [],
      },
    });
  });

  it('change le prix d’un article en cours : arrête l’ancien dans le même avenant', () => {
    const draft = priceAmendment(
      { sku: 'VIE-001-1', euros: 0.85, fromDay: '', toDay: '', reason: 'Prix revu' },
      RUNNING,
    );

    expect(draft.ok && draft.payload.endedSkus).toEqual(['VIE-001-1']);
  });

  it('date le début à minuit à Paris quand on en choisit un', () => {
    const draft = priceAmendment(
      { sku: 'VIE-002-1', euros: 1, fromDay: '2026-12-01', toDay: '', reason: 'Saison' },
      RUNNING,
    );

    expect(draft.ok && draft.payload.validFrom).toBe('2026-11-30T23:00:00.000Z');
  });

  it('refuse sans article, sans prix, ou sans motif', () => {
    const base = { sku: 'VIE-002-1', euros: 1, fromDay: '', toDay: '', reason: 'Motif' };

    expect(priceAmendment({ ...base, sku: null }, RUNNING).ok).toBe(false);
    expect(priceAmendment({ ...base, euros: null }, RUNNING).ok).toBe(false);
    expect(priceAmendment({ ...base, euros: 0 }, RUNNING).ok).toBe(false);
    expect(priceAmendment({ ...base, reason: '   ' }, RUNNING)).toEqual({
      ok: false,
      refusal: 'Le motif est obligatoire : il reste au journal de l’accord.',
    });
  });
});

describe('endAmendment', () => {
  it('arrête une ligne, sans en ouvrir', () => {
    expect(endAmendment({ sku: 'VIE-001-1', fromDay: '', reason: 'Fin de saison' })).toEqual({
      ok: true,
      payload: { validTo: null, reason: 'Fin de saison', lines: [], endedSkus: ['VIE-001-1'] },
    });
  });

  it('refuse sans ligne ou sans motif', () => {
    expect(endAmendment({ sku: null, fromDay: '', reason: 'x' }).ok).toBe(false);
    expect(endAmendment({ sku: 'VIE-001-1', fromDay: '', reason: '' }).ok).toBe(false);
  });
});

describe('runningOptions', () => {
  it('ne propose d’arrêter que ce qui fait un prix aujourd’hui', () => {
    expect(runningOptions(MERCURIALE).map((option) => option.value)).toEqual(['VIE-001-1']);
  });
});
