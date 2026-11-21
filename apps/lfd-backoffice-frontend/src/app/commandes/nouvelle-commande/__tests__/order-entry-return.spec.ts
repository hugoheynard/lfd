import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ORDER_ENTRY_RETURN,
  OrderEntryReturnStore,
  orderEntryParams,
  pointOf,
  returnLabelOf,
  returnTargetOf,
} from '../order-entry-return';

describe('l’origine de la saisie à part', () => {
  it('garde un chemin interne au back-office', () => {
    expect(returnTargetOf('/comptoir')).toBe('/comptoir');
    expect(returnTargetOf('/commandes')).toBe('/commandes');
  });

  it.each([
    ['absente', undefined],
    ['vide', ''],
    ['externe', 'https://ailleurs.example'],
    ['d’une autre origine', '//ailleurs.example'],
    ['la saisie elle-même', '/nouvelle-commande'],
    ['une étape de la saisie', '/nouvelle-commande/pro'],
  ])('retombe sur la liste quand elle est %s', (_case, raw) => {
    expect(returnTargetOf(raw)).toBe(DEFAULT_ORDER_ENTRY_RETURN);
  });

  it('nomme le retour dans les mots de l’écran d’origine', () => {
    expect(returnLabelOf('/comptoir')).toBe('Retour au comptoir');
    expect(returnLabelOf('/comptoir/retrait')).toBe('Retour au comptoir');
    expect(returnLabelOf('/commandes')).toBe('Retour aux commandes');
    expect(returnLabelOf('/supervision')).toBe('Retour');
  });

  it('lit le point du comptoir, ou rien', () => {
    expect(pointOf('site-1')).toBe('site-1');
    expect(pointOf('  ')).toBeNull();
    expect(pointOf(undefined)).toBeNull();
  });

  it('n’écrit le point dans l’adresse que s’il existe', () => {
    expect(orderEntryParams('/commandes')).toEqual({ retour: '/commandes' });
    expect(orderEntryParams('/comptoir', 'site-1')).toEqual({
      retour: '/comptoir',
      point: 'site-1',
    });
  });
});

describe('le parcours de la saisie', () => {
  function store(): OrderEntryReturnStore {
    TestBed.resetTestingModule();
    return TestBed.inject(OrderEntryReturnStore);
  }

  it('part de la liste des commandes, sans point', () => {
    const route = store();
    expect(route.target()).toBe('/commandes');
    expect(route.point()).toBeNull();
  });

  it('retient l’origine et le point d’arrivée', () => {
    const route = store();
    route.noteArrival('/comptoir', 'site-1');
    expect(route.target()).toBe('/comptoir');
    expect(route.point()).toBe('site-1');
    expect(route.label()).toBe('Retour au comptoir');
  });

  it('garde l’origine du parcours sur une étape sans origine', () => {
    const route = store();
    route.noteArrival('/comptoir', 'site-1');
    route.noteArrival(undefined, undefined);
    expect(route.target()).toBe('/comptoir');
    expect(route.point()).toBe('site-1');
  });

  it('oublie le point du comptoir quand la liste ouvre la saisie', () => {
    // Sans quoi un « Retrait immédiat » resterait proposé loin du client.
    const route = store();
    route.noteArrival('/comptoir', 'site-1');
    route.noteArrival('/commandes', undefined);
    expect(route.point()).toBeNull();
  });
});
