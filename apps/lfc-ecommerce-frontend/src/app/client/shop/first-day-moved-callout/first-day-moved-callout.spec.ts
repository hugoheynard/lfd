import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { OrderContextStore, type ServiceChoice } from '../../order-context.store';
import { FirstDayMovedCallout } from './first-day-moved-callout';

const AU_LABO: ServiceChoice = {
  mode: 'pickup',
  place: 'Le Labo',
  at: 'au Labo',
  address: 'Route de la Balme, Val d’Isère',
  pickupAddressId: 'pick_labo',
  slot: '7 h – 8 h',
  window: { start: '07:00', end: '08:00' },
  date: '2026-09-10',
};

function boot(choice: ServiceChoice | null, moved: string | null) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [FirstDayMovedCallout],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const store = TestBed.inject(OrderContextStore);
  store.choice.set(choice);
  store.movedToFirstDay.set(moved);
  const fixture = TestBed.createComponent(FirstDayMovedCallout);
  fixture.detectChanges();
  return { fixture, store, host: fixture.nativeElement as HTMLElement };
}

describe('FirstDayMovedCallout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('dit le déplacement, la date en toutes lettres', () => {
    const { host } = boot(AU_LABO, '2026-09-10');
    expect(host.querySelector('[data-first-day-moved]')?.textContent).toContain(
      'Les commandes ouvrent le jeudi 10 septembre : votre commande a été déplacée à cette date.',
    );
  });

  it('ne dit rien quand rien n’a été déplacé', () => {
    const { host } = boot(AU_LABO, null);
    expect(host.querySelector('[data-first-day-moved]')).toBeNull();
  });

  it('se ferme, et ne revient pas tant que la date ne bouge pas', async () => {
    const { fixture, store, host } = boot(AU_LABO, '2026-09-10');
    host.querySelector<HTMLButtonElement>('[data-first-day-moved-close]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(store.movedToFirstDay()).toBeNull();
    expect(host.querySelector('[data-first-day-moved]')).toBeNull();
  });

  it('se tait quand la journée a quitté la date d’ouverture', () => {
    const { host } = boot({ ...AU_LABO, date: '2026-09-12' }, '2026-09-10');
    expect(host.querySelector('[data-first-day-moved]')).toBeNull();
  });
});
