import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { FulfillmentDayView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { AuthFacade } from '../../../auth/auth.facade';
import { type EarlyAccess, OrderAdmissionStore } from '../order-admission.store';
import { ServicePoints } from '../pickup-points.store';
import { ShopClock } from '../shop-clock';
import { DayPickerDialog } from './day-picker-dialog';

/** L'heure de la boutique est figée : 9 h à Paris, le 27 octobre. */
const NOW = new Date('2026-10-27T08:00:00.000Z');
const TODAY = '2026-10-27';

async function boot(
  days: readonly FulfillmentDayView[],
  lastDay: string | null = null,
  firstOrderableDay: string | null = null,
  earlyAccess: EarlyAccess | null = null,
): Promise<{
  readonly el: HTMLElement;
  readonly closed: (string | undefined)[];
  readonly detect: () => void;
}> {
  const closed: (string | undefined)[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DayPickerDialog],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: FoldPanelRef, useValue: { close: (v: string | undefined) => closed.push(v) } },
      { provide: ShopClock, useValue: { now: signal(NOW) } },
      { provide: OrderAdmissionStore, useValue: { earlyAccess: signal(earlyAccess) } },
      {
        provide: AuthFacade,
        useValue: { isAuthenticated: signal(false), accessToken$: () => of('jeton') },
      },
    ],
  });
  const points = TestBed.inject(ServicePoints);
  points.receive([], [], days);
  points.capDaysAt(lastDay);
  points.floorDaysAt(firstOrderableDay);
  const fixture = TestBed.createComponent(DayPickerDialog);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return {
    el: fixture.nativeElement as HTMLElement,
    closed,
    detect: () => fixture.detectChanges(),
  };
}

function button(el: HTMLElement, day: string): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>(`button[data-day="${day}"]`);
}

describe('DayPickerDialog', () => {
  it('propose « Aujourd’hui » avec son heure limite quand le serveur le sert', async () => {
    const { el, closed } = await boot([
      { pickupAddressId: null, date: TODAY, orderUntil: '2026-10-27T09:00:00.000Z' },
    ]);
    const today = button(el, 'today');
    expect(today?.textContent).toMatch(/commandez avant 10\sh/);
    today?.click();
    expect(closed).toEqual([TODAY]);
  });

  /** Plan `plan-barre-qui-accompagne.md` : plus de pied à lui, la barre du panier l'est. */
  it('🔴 porte la barre du panier en pied, et pas de pied de dialogue', async () => {
    const { el } = await boot([{ pickupAddressId: null, date: '2026-10-28', orderUntil: null }]);
    expect(el.querySelector('app-cart-bar')).not.toBeNull();
    expect(el.querySelector('fold-panel-footer')).toBeNull();
  });

  it('🔴 n’offre pas « Aujourd’hui » quand le serveur ne le sert pas', async () => {
    const { el } = await boot([{ pickupAddressId: null, date: '2026-10-28', orderUntil: null }]);
    expect(button(el, 'today')).toBeNull();
  });

  it('montre les six jours suivants, grisés quand ils ne sont pas servis', async () => {
    const { el, closed } = await boot(
      [{ pickupAddressId: null, date: '2026-10-29', orderUntil: null }],
      '2026-10-31',
    );
    const grid = ['28', '29', '30', '31'].map((d) => button(el, `2026-10-${d}`));
    const after = ['01', '02'].map((d) => button(el, `2026-11-${d}`));
    expect([...grid, ...after].every((b) => b !== null)).toBe(true);
    expect(grid.map((b) => b?.disabled)).toEqual([true, false, false, false]);
    expect(after.map((b) => b?.disabled)).toEqual([true, true]);

    grid[1]?.click();
    expect(closed).toEqual(['2026-10-29']);
  });

  /** Un calendrier navigable, plus un champ (Hugo, 2026-10-27). */
  it('« Autre date » ouvre un calendrier : jours servis cliquables, mois suivant', async () => {
    const { el, closed, detect } = await boot(
      [{ pickupAddressId: null, date: '2026-10-29', orderUntil: null }],
      '2026-12-31',
    );
    button(el, 'other')?.click();
    detect();
    const cal = (): HTMLElement => el.querySelector('app-month-picker') as HTMLElement;
    const cell = (day: string): HTMLButtonElement | null =>
      cal().querySelector<HTMLButtonElement>(`[data-day="${day}"]`);

    expect(cell('2026-10-28')?.disabled).toBe(true);
    expect(cell('2026-10-29')?.disabled).toBe(false);
    const [previous, next] = Array.from(cal().querySelectorAll<HTMLButtonElement>('.head button'));
    expect(previous?.disabled).toBe(true);

    next?.click();
    detect();
    cell('2026-11-20')?.click();
    expect(closed).toEqual(['2026-11-20']);
  });

  it('le calendrier s’arrête au dernier mois servi', async () => {
    const { el, detect } = await boot(
      [{ pickupAddressId: null, date: '2026-10-29', orderUntil: null }],
      '2026-11-15',
    );
    button(el, 'other')?.click();
    detect();
    const next = (): HTMLButtonElement | undefined =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('app-month-picker .head button'))[1];
    next()?.click();
    detect();
    expect(next()?.disabled).toBe(true);
    expect(
      el.querySelector<HTMLButtonElement>('app-month-picker [data-day="2026-11-16"]')?.disabled,
    ).toBe(true);
  });

  it('dit qu’aucun jour n’est ouvert quand le serveur n’en sert aucun', async () => {
    const { el } = await boot([{ pickupAddressId: null, date: null, orderUntil: null }]);
    expect(el.querySelector('fold-empty-state')).not.toBeNull();
  });

  /** Lot J4 : rien avant le premier jour commandable, et une ligne le dit. */
  it('grise les jours avant le premier jour commandable et dit la date en toutes lettres', async () => {
    const { el } = await boot(
      [{ pickupAddressId: 'pick_labo', date: TODAY, orderUntil: null }],
      null,
      '2026-10-29',
    );

    expect(button(el, 'today')).toBeNull();
    expect(button(el, '2026-10-28')?.disabled).toBe(true);
    expect(button(el, '2026-10-29')?.disabled).toBe(false);
    expect(el.querySelector('[data-first-orderable-day]')?.textContent?.trim()).toBe(
      'Retraits et livraisons à partir du jeudi 29 octobre',
    );
  });

  it('ne dit rien sans date', async () => {
    const { el } = await boot([{ pickupAddressId: 'pick_labo', date: TODAY, orderUntil: null }]);

    expect(el.querySelector('[data-first-orderable-day]')).toBeNull();
  });

  it('exempté d’une date future : dit l’accès anticipé à la place de la date', async () => {
    const { el } = await boot(
      [{ pickupAddressId: 'pick_labo', date: TODAY, orderUntil: null }],
      null,
      null,
      { kind: 'beforeOpening', day: '2026-10-29' },
    );

    expect(el.querySelector('[data-first-orderable-day]')?.textContent?.trim()).toBe(
      'Accès anticipé : vous pouvez choisir un jour avant le jeudi 29 octobre.',
    );
  });

  it('fermée et admis : dit l’accès pendant la fermeture', async () => {
    const { el } = await boot(
      [{ pickupAddressId: 'pick_labo', date: TODAY, orderUntil: null }],
      null,
      null,
      { kind: 'duringClosure' },
    );

    expect(el.querySelector('[data-first-orderable-day]')?.textContent?.trim()).toBe(
      'Accès anticipé : vous pouvez commander pendant la fermeture de la boutique.',
    );
  });
});
