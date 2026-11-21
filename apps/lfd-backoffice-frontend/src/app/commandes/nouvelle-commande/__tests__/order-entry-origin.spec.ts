import { describe, expect, it } from 'vitest';

import {
  backLinkOf,
  counterPlacedOrderOf,
  destinationAfterPlacingOf,
  orderEntryOriginOf,
} from '../order-entry-origin';

describe("l'origine de la saisie", () => {
  it('vaut « commercial » sans point de retrait : la liste, les brouillons, la fiche', () => {
    expect(orderEntryOriginOf(undefined, true)).toBe('commercial');
    expect(orderEntryOriginOf('  ', true)).toBe('commercial');
  });

  it('vaut « counter » quand le comptoir a passé son point', () => {
    expect(orderEntryOriginOf('pick_1', true)).toBe('counter');
  });

  /**
   * Un point tapé dans l'adresse ne fait pas un comptoir : sans le droit, la
   * trace « comptoir » serait fabriquée (vitruve, 2026-11-21).
   */
  it('reste « commercial » quand la personne n’a pas le droit du comptoir', () => {
    expect(orderEntryOriginOf('pick_1', false)).toBe('commercial');
  });

  it('ramène le Commercial à l’écran d’où il vient, paramètres compris', () => {
    expect(backLinkOf('commercial', '/comptes-clients/c1/commandes')).toEqual({
      link: ['/comptes-clients/c1/commandes'],
      queryParams: {},
      label: 'Ses commandes',
    });
    expect(backLinkOf('commercial', '/commandes?view=drafts')).toEqual({
      link: ['/commandes'],
      queryParams: { view: 'drafts' },
      label: 'Retour aux commandes',
    });
  });

  it('sans retour lisible, ramène aux commandes', () => {
    expect(backLinkOf('commercial', '//ailleurs.example')).toMatchObject({
      link: ['/commandes'],
    });
  });

  it('ramène le comptoir à son sélecteur, jamais vers /comptes-clients', () => {
    expect(backLinkOf('counter', '/comptoir')).toEqual({
      link: ['/nouvelle-commande/pro'],
      queryParams: null,
      label: 'Choisir un autre compte',
    });
  });

  it('mène à la commande passée dans la liste des commandes, quand on en vient', () => {
    expect(destinationAfterPlacingOf('commercial', 'c1', 'o1', '/commandes?view=drafts')).toEqual([
      '/commandes',
      'o1',
    ]);
    expect(destinationAfterPlacingOf('commercial', 'c1', 'o1')).toEqual(['/commandes', 'o1']);
  });

  it('mène à la commande passée dans le dossier du compte, quand on vient de la fiche', () => {
    expect(
      destinationAfterPlacingOf('commercial', 'c1', 'o1', '/comptes-clients/c1/commandes'),
    ).toEqual(['/comptes-clients', 'c1', 'commandes', 'o1']);
  });

  it('renvoie le comptoir au sélecteur après la commande', () => {
    expect(destinationAfterPlacingOf('counter', 'c1', 'o1')).toEqual(['/nouvelle-commande/pro']);
  });
});

describe('la commande transmise au sélecteur du comptoir', () => {
  it('relit numéro et lien de règlement', () => {
    const state = { counterPlacedOrder: { orderNumber: 'CMD-1', paymentUrl: 'https://pay/x' } };
    expect(counterPlacedOrderOf(state)).toEqual({
      orderNumber: 'CMD-1',
      paymentUrl: 'https://pay/x',
      handover: null,
    });
  });

  it('relit l’issue de la remise du retrait immédiat (L6), refus compris', () => {
    const state = {
      counterPlacedOrder: {
        orderNumber: 'CMD-1',
        paymentUrl: null,
        handover: { orderId: 'o_1', refusal: 'Commande non réglée.' },
      },
    };
    expect(counterPlacedOrderOf(state)?.handover).toEqual({
      orderId: 'o_1',
      refusal: 'Commande non réglée.',
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
