import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { OrderContextStore, type ServiceChoice } from '../../order-context.store';
import { OrderDoors } from '../order-doors';
import { ServiceDayNotice } from '../service-day-notice';
import { ServiceDayCallout } from './service-day-callout';

const AU_LABO: ServiceChoice = {
  mode: 'pickup',
  place: 'Le Labo',
  at: 'au Labo',
  address: 'Route de la Balme, Val d’Isère',
  pickupAddressId: 'pick_labo',
  slot: '7 h – 8 h',
  window: { start: '07:00', end: '08:00' },
  date: '2026-09-07',
};

/** Ce que l'encadré a demandé aux portes, avec leurs arguments. */
let ouvertes: unknown[][] = [];

function boot(
  message: string | null,
  offersChange: boolean,
  service: ServiceChoice | null = AU_LABO,
) {
  localStorage.clear();
  TestBed.resetTestingModule();
  ouvertes = [];
  const record =
    (name: string) =>
    (...args: unknown[]): Promise<boolean> => {
      ouvertes.push([name, ...args]);
      return Promise.resolve(true);
    };
  TestBed.configureTestingModule({
    imports: [ServiceDayCallout],
    providers: [
      {
        provide: ServiceDayNotice,
        useValue: { message: signal(message), offersChange: signal(offersChange) },
      },
      {
        provide: OrderDoors,
        useValue: {
          choose: record('choose'),
          pickup: record('pickup'),
          time: record('time'),
          delivery: record('delivery'),
          changeDate: record('changeDate'),
        },
      },
    ],
  });
  TestBed.inject(OrderContextStore).choice.set(service);
  const fixture = TestBed.createComponent(ServiceDayCallout);
  let changing = 0;
  fixture.componentInstance.changing.subscribe(() => (changing += 1));
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return { host, changes: () => changing };
}

describe('ServiceDayCallout', () => {
  it('ne montre rien quand il n’y a rien à dire', () => {
    const { host } = boot(null, false);
    expect(host.querySelector('[data-late-day]')).toBeNull();
  });

  it('dit la phrase sans « Modifier » quand le jour tient', () => {
    const { host } = boot('Pour jeudi, commandez avant 23 h.', false);
    expect(host.querySelector('[data-late-day]')?.textContent).toContain('commandez avant');
    expect(host.querySelector('[data-change-day]')).toBeNull();
  });

  /**
   * « Modifier le jour » ouvre le PANNEAU DU JOUR, puis l'heure de la même
   * maison (2026-10-27). Il rouvrait l'heure seule, sur les onglets de la
   * semaine — le vieux panneau qui mêlait jour et heure.
   */
  it('« Modifier » ouvre le panneau du jour en retrait, après avoir prévenu', async () => {
    const { host, changes } = boot('Trop tard pour lundi.', true);
    const button = host.querySelector<HTMLButtonElement>('[data-change-day]');
    expect(button?.getAttribute('aria-label')).toBe('Modifier le jour');
    button?.click();
    // Les portes se chargent au clic (import dynamique).
    await vi.waitFor(() => expect(ouvertes).toHaveLength(1));
    expect(changes()).toBe(1);
    expect(ouvertes).toEqual([['changeDate']]);
  });

  it('« Modifier » ouvre le panneau du jour en livraison aussi', async () => {
    const { pickupAddressId: _point, ...base } = AU_LABO;
    const livraison: ServiceChoice = {
      ...base,
      mode: 'delivery',
      codePostal: '73150',
      deliveryAddress: {
        label: 'Chalet',
        ligne1: '1 route du Fornet',
        ligne2: '',
        codePostal: '73150',
        ville: 'Val d’Isère',
        pays: 'France',
      },
      deliveryAddressId: 'addr_1',
    };
    const { host } = boot('Trop tard pour lundi.', true, livraison);
    host.querySelector<HTMLButtonElement>('[data-change-day]')?.click();
    await vi.waitFor(() => expect(ouvertes).toHaveLength(1));
    expect(ouvertes).toEqual([['changeDate']]);
  });
});
