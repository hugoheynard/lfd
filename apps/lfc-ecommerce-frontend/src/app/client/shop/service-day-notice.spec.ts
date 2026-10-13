import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { addDays, instantToLocal } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OrderContextStore, type ServiceChoice } from '../order-context.store';
import { ServicePoints } from './pickup-points.store';
import { ServiceDayNotice } from './service-day-notice';

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
  TestBed.inject(ServicePoints).receive([], [], [{ pickupAddressId: null, date: firstDay }]);
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
