import type { AdminOrderRow } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ALL_SITES, siteChoicesOf, siteLabelOf } from '../commandes/order-sites';

/** Une date seulement portée : rien ne la compare à l'horloge. */
function row(companyId: string | null, companyDisplayName: string | null): AdminOrderRow {
  return {
    id: `ord_${companyId ?? 'perso'}`,
    orderNumber: 'C-0001',
    placedAt: '2026-09-12T08:00:00.000Z',
    status: 'placed',
    paymentStatus: 'not_required',
    fulfillmentMethod: 'pickup',
    subtotalCents: 1_000,
    vatCents: 55,
    totalCents: 1_055,
    customerLabel: 'SAS Alpes Chalets',
    companyId,
    companyDisplayName,
    origin: 'self_service',
  };
}

describe('le site d’une commande', () => {
  it('écrit « — » pour le compte lui-même, l’enseigne pour un sous-compte', () => {
    expect(siteLabelOf(row('alpes', 'Alpes Chalets'), 'alpes')).toBe('—');
    expect(siteLabelOf(row('arolle', 'Chalet Arolle'), 'alpes')).toBe('Chalet Arolle');
  });
});

describe('les choix du filtre par site', () => {
  it('n’offre aucun filtre quand aucune commande ne vient d’un sous-compte', () => {
    expect(siteChoicesOf([row('alpes', 'Alpes Chalets')], 'alpes')).toEqual([]);
  });

  it('propose tous les sites, le compte, puis chaque sous-compte une fois, par nom', () => {
    const choices = siteChoicesOf(
      [
        row('alpes', 'Alpes Chalets'),
        row('edelweiss', 'Chalet Edelweiss'),
        row('arolle', 'Chalet Arolle'),
        row('edelweiss', 'Chalet Edelweiss'),
      ],
      'alpes',
    );
    expect(choices).toEqual([
      { value: ALL_SITES, label: 'Tous les sites' },
      { value: 'alpes', label: 'Le compte lui-même' },
      { value: 'arolle', label: 'Chalet Arolle' },
      { value: 'edelweiss', label: 'Chalet Edelweiss' },
    ]);
  });
});
