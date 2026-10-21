import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { addDays, type FulfillmentDayView, instantToLocal } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OrderContextStore, type ServiceChoice } from '../order-context.store';
import { ServicePoints } from './pickup-points.store';
import { CartStore } from '../cart/cart.store';
import { ServiceDayNotice } from './service-day-notice';
import { ShopCatalogue } from './shop-catalogue.store';
import { TEST_CATALOGUE } from './shop-catalogue.fixture';
import { ShopClock } from './shop-clock';

const TODAY = instantToLocal(new Date()).day;

function delivery(date: string): ServiceChoice {
  return {
    mode: 'delivery',
    window: null,
    place: 'Chalet',
    at: 'au Chalet',
    address: '12 chemin des Barmettes, 73150',
    codePostal: '73150',
    slot: '',
    date,
    deliveryAddressId: 'a',
    deliveryAddress: {
      label: 'Chalet',
      ligne1: '12 chemin des Barmettes',
      ligne2: '',
      codePostal: '73150',
      ville: "Val d'Isère",
      pays: 'France',
    },
  };
}

function notice(choice: ServiceChoice, firstDay: string): string | null {
  localStorage.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  TestBed.inject(ServicePoints).receive(
    [],
    [],
    [{ pickupAddressId: null, date: firstDay, orderUntil: null }],
  );
  TestBed.inject(OrderContextStore).choice.set(choice);
  return TestBed.inject(ServiceDayNotice).message();
}

describe('ServiceDayNotice', () => {
  /**
   * Régression (Hugo, 2026-10-13) : « je croyais commander pour demain et au
   * final j'ai deux commandes pour jeudi ». Passé la limite de la veille, le
   * jour accordé est le surlendemain, et rien ne le disait.
   */
  it('dit « trop tard pour demain » et nomme le jour quand le service n’est pas demain', () => {
    const later = addDays(TODAY, 2);
    const message = notice(delivery(later), later);

    expect(message).toContain('Trop tard pour demain');
    expect(message).toContain('livrée');
    // Le jour est un MOT, jamais « prochain créneau » ni une date brute.
    expect(message).not.toContain(later);
  });

  it('se tait quand le service est bien demain', () => {
    const tomorrow = addDays(TODAY, 1);
    expect(notice(delivery(tomorrow), tomorrow)).toBeNull();
  });

  /** La limite passe pendant la saisie : le jour retenu n'est plus demandable. */
  it('annonce un jour retenu devenu trop tôt au lieu de glisser en silence', () => {
    const tomorrow = addDays(TODAY, 1);
    const message = notice(delivery(tomorrow), addDays(TODAY, 2));

    expect(message).toContain('Trop tard pour demain');
    expect(message).toContain('Changez le jour');
  });
});

/**
 * À horloge FIGÉE (2026-10-21) : mardi 20 octobre 2026 à Paris, règle de la
 * veille à 23 h. Les dates ne se comparent qu'à cette horloge-là.
 */
describe('ServiceDayNotice — l’heure limite annoncée', () => {
  const WEDNESDAY = '2026-10-21';
  const THURSDAY = '2026-10-22';
  const TUESDAY_23H = '2026-10-20T21:00:00.000Z';
  const WEDNESDAY_23H = '2026-10-21T21:00:00.000Z';

  function setUp(now: Date, days: readonly FulfillmentDayView[], held: string) {
    localStorage.clear();
    TestBed.resetTestingModule();
    const clock = signal(now);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ShopClock, useValue: { now: clock.asReadonly() } },
      ],
    });
    const points = TestBed.inject(ServicePoints);
    points.receive([], [], days);
    TestBed.inject(OrderContextStore).choice.set(delivery(held));
    const notice = TestBed.inject(ServiceDayNotice);
    TestBed.tick();
    return { notice, clock, points };
  }

  /**
   * Régression (démo du 2026-10-21) : jour gardé jeudi, serveur qui accorde
   * mercredi, mardi 15 h — la boutique disait « Trop tard pour demain ».
   */
  it('mardi 15 h, jour gardé jeudi : ni « trop tard » ni « Plus que 8 h »', () => {
    const { notice } = setUp(
      new Date('2026-10-20T13:00:00.000Z'),
      [{ pickupAddressId: null, date: WEDNESDAY, orderUntil: TUESDAY_23H }],
      THURSDAY,
    );

    const message = notice.message() ?? '';
    expect(message).not.toContain('Trop tard');
    expect(message).not.toContain('Plus que');
    // L'heure s'écrit avec une espace insécable, comme partout (`formatHour`).
    expect(message).toBe('Pour mercredi, commandez avant 23\u00a0h.');
  });

  /**
   * 🔴 La limite d'un article du panier, plus stricte que la générale, décide
   * (Hugo, 2026-10-21) : « Plus que 1 h 40 pour commander la bûche pour jeudi ».
   */
  it('nomme l’article du panier dont la limite décide', () => {
    const { notice } = setUp(
      new Date('2026-10-20T14:20:00.000Z'),
      [{ pickupAddressId: null, date: WEDNESDAY, orderUntil: TUESDAY_23H }],
      WEDNESDAY,
    );
    const base = TEST_CATALOGUE.items[0];
    if (base === undefined) {
      throw new Error('le catalogue de test est vide');
    }
    const piece = { ...base, name: 'la bûche', orderTimeLimit: { daysBefore: 1, time: '18:00' } };
    TestBed.inject(ShopCatalogue).receive({ ...TEST_CATALOGUE, items: [piece] });
    TestBed.inject(CartStore).setQuantity(piece.sku, 1);
    TestBed.tick();

    expect(notice.message()).toBe('Plus que 1 h 40 pour commander la bûche pour mercredi.');
  });

  /**
   * 🔴 La limite d'un article déjà passée pour le jour retenu : la barre se
   * taisait alors que la passation refuserait (Hugo, 2026-10-21).
   */
  it('dit « trop tard pour jeudi, possible à partir de samedi » pour l’article', () => {
    const { notice } = setUp(
      new Date('2026-10-20T13:00:00.000Z'),
      [{ pickupAddressId: null, date: WEDNESDAY, orderUntil: TUESDAY_23H }],
      '2026-10-22',
    );
    const base = TEST_CATALOGUE.items[0];
    if (base === undefined) {
      throw new Error('le catalogue de test est vide');
    }
    const piece = {
      ...base,
      name: 'Tarte myrtille T1',
      orderTimeLimit: { daysBefore: 3, time: '12:00' },
    };
    TestBed.inject(ShopCatalogue).receive({ ...TEST_CATALOGUE, items: [piece] });
    TestBed.inject(CartStore).setQuantity(piece.sku, 1);
    TestBed.tick();

    expect(notice.message()).toBe(
      'Tarte myrtille T1 : trop tard pour jeudi, possible à partir de samedi.',
    );
  });

  it('dit le temps restant sous six heures', () => {
    const { notice } = setUp(
      new Date('2026-10-20T18:45:00.000Z'),
      [{ pickupAddressId: null, date: WEDNESDAY, orderUntil: TUESDAY_23H }],
      WEDNESDAY,
    );
    expect(notice.message()).toBe('Plus que 2 h 15 pour commander pour mercredi.');
  });

  it('dit les minutes sous l’heure, et suit l’horloge', () => {
    const { notice, clock } = setUp(
      new Date('2026-10-20T20:00:00.000Z'),
      [{ pickupAddressId: null, date: WEDNESDAY, orderUntil: TUESDAY_23H }],
      WEDNESDAY,
    );
    expect(notice.message()).toBe('Plus que 1 h pour commander pour mercredi.');
    clock.set(new Date('2026-10-20T20:48:00.000Z'));
    expect(notice.message()).toBe('Plus que 12 min pour commander pour mercredi.');
  });

  it('la limite tombe page ouverte : relit les jours, puis dit l’heure passée', async () => {
    const { notice, clock, points } = setUp(
      new Date('2026-10-20T20:50:00.000Z'),
      [{ pickupAddressId: null, date: WEDNESDAY, orderUntil: TUESDAY_23H }],
      WEDNESDAY,
    );
    clock.set(new Date('2026-10-20T21:01:00.000Z'));
    TestBed.tick();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne((req) => req.url.endsWith('/fulfillment-days'))
      .flush([{ pickupAddressId: null, date: THURSDAY, orderUntil: WEDNESDAY_23H }]);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(points.nextDayFor(null)).toBe(THURSDAY);
    // Le jour gardé (mercredi) n'est plus demandable : on le dit.
    expect(notice.message()).toContain('Trop tard pour demain');
    TestBed.inject(OrderContextStore).choice.set(delivery(THURSDAY));
    expect(notice.message()).toBe(
      'Trop tard pour demain, la limite était 23\u00a0h : votre commande sera livrée jeudi 22 octobre.',
    );
  });
});
