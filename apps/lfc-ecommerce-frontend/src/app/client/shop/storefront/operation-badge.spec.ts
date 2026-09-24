import type { PublicStorefrontOperationView } from '@lfd/contracts';

import { EN } from '../../copy/en';
import { FR } from '../../copy/fr';
import { daysUntil, operationBadge } from './operation-badge';

/**
 * La pastille calculée d'une annonce d'opération (D11). Les dates ne sont
 * comparées qu'à `now`, qui est une constante de la suite : aucune horloge.
 */
const OPERATION: PublicStorefrontOperationView = {
  key: 'noel-2026',
  state: 'open',
  // 15 novembre, minuit à Paris.
  orderFrom: '2026-11-14T23:00:00.000Z',
  // 21 décembre, midi à Paris.
  orderUntil: '2026-12-21T11:00:00.000Z',
  pickupFrom: '2026-12-20',
  pickupUntil: '2026-12-24',
};

describe('operationBadge', () => {
  it('annoncée : « Dès le 15 nov. », le jour d’ouverture lu à Paris', () => {
    const badge = operationBadge({ ...OPERATION, state: 'announced' }, new Date(), 'fr', FR);
    expect(badge).toBe('Dès le 15 nov.');
  });

  it('ouverte : les jours calendaires de Paris jusqu’à la clôture', () => {
    const now = new Date('2026-12-03T08:00:00.000Z');
    expect(operationBadge(OPERATION, now, 'fr', FR)).toBe('J‑18');
    expect(operationBadge(OPERATION, now, 'en', EN)).toBe('D‑18');
  });

  it('le jour de la clôture : « Dernier jour », même le matin', () => {
    const now = new Date('2026-12-21T06:00:00.000Z');
    expect(operationBadge(OPERATION, now, 'fr', FR)).toBe('Dernier jour');
  });

  it('close : « Commandes closes »', () => {
    expect(operationBadge({ ...OPERATION, state: 'closed' }, new Date(), 'fr', FR)).toBe(
      'Commandes closes',
    );
  });
});

describe('daysUntil', () => {
  /** 23 h 30 à Paris la veille : un écart d'instants dirait 0, le calendrier dit 1. */
  it('compte en jours de Paris, pas en tranches de 24 h', () => {
    expect(daysUntil(OPERATION.orderUntil, new Date('2026-12-20T22:30:00.000Z'))).toBe(1);
    expect(daysUntil(OPERATION.orderUntil, new Date('2026-12-20T23:30:00.000Z'))).toBe(0);
  });

  it('une date illisible ne compte rien', () => {
    expect(daysUntil('pas une date', new Date())).toBeNull();
  });
});
