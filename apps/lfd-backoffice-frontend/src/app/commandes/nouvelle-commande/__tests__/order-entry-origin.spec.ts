import { describe, expect, it } from 'vitest';

import {
  backLinkOf,
  counterPlacedOrderOf,
  destinationAfterPlacingOf,
  orderEntryOriginOf,
} from '../order-entry-origin';

describe("l'origine de la saisie", () => {
  it('vaut « commercial » quand la route ne déclare rien — le comportement historique', () => {
    expect(orderEntryOriginOf({})).toBe('commercial');
  });

  it('vaut « counter » quand la route du comptoir le déclare', () => {
    expect(orderEntryOriginOf({ origin: 'counter' })).toBe('counter');
  });

  it('ramène le Commercial au dossier du compte', () => {
    expect(backLinkOf('commercial', 'c1')).toEqual({
      link: ['/comptes-clients', 'c1', 'commandes'],
      label: 'Ses commandes',
    });
  });

  it('ramène le comptoir à son sélecteur, jamais vers /comptes-clients', () => {
    expect(backLinkOf('counter', 'c1')).toEqual({
      link: ['/comptoir/nouvelle-commande'],
      label: 'Retour au comptoir',
    });
  });

  it('mène le Commercial à la commande passée, dans le dossier du compte', () => {
    expect(destinationAfterPlacingOf('commercial', 'c1', 'o1')).toEqual([
      '/comptes-clients',
      'c1',
      'commandes',
      'o1',
    ]);
  });

  it('renvoie le comptoir au sélecteur après la commande', () => {
    expect(destinationAfterPlacingOf('counter', 'c1', 'o1')).toEqual([
      '/comptoir/nouvelle-commande',
    ]);
  });
});

describe('la commande transmise au sélecteur du comptoir', () => {
  it('relit numéro et lien de règlement', () => {
    const state = { counterPlacedOrder: { orderNumber: 'CMD-1', paymentUrl: 'https://pay/x' } };
    expect(counterPlacedOrderOf(state)).toEqual({
      orderNumber: 'CMD-1',
      paymentUrl: 'https://pay/x',
    });
  });

  it('admet une commande sans lien de règlement', () => {
    const state = { counterPlacedOrder: { orderNumber: 'CMD-1', paymentUrl: null } };
    expect(counterPlacedOrderOf(state)?.paymentUrl).toBeNull();
  });

  it('ignore un état absent ou mal formé', () => {
    expect(counterPlacedOrderOf(undefined)).toBeNull();
    expect(counterPlacedOrderOf({ navigationId: 3 })).toBeNull();
    expect(counterPlacedOrderOf({ counterPlacedOrder: { orderNumber: 7 } })).toBeNull();
  });
});
