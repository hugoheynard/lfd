import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { FulfillmentDayView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { AuthFacade } from '../../../auth/auth.facade';
import { ServicePoints } from '../pickup-points.store';
import { ShopClock } from '../shop-clock';
import { DayPickerDialog } from './day-picker-dialog';

/** L'heure de la boutique est figée : 9 h à Paris, le 27 octobre. */
const NOW = new Date('2026-10-27T08:00:00.000Z');
const TODAY = '2026-10-27';

async function boot(
  days: readonly FulfillmentDayView[],
  lastDay: string | null = null,
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
      {
        provide: AuthFacade,
        useValue: { isAuthenticated: signal(false), accessToken$: () => of('jeton') },
      },
    ],
  });
  const points = TestBed.inject(ServicePoints);
  points.receive([], [], days);
  points.capDaysAt(lastDay);
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

  it('« Autre date » borne le champ et refuse un jour non servi', async () => {
    const { el, closed, detect } = await boot(
      [{ pickupAddressId: null, date: '2026-10-29', orderUntil: null }],
      '2026-12-31',
    );
    button(el, 'other')?.click();
    detect();
    const input = el.querySelector<HTMLInputElement>('fold-date input');
    expect(input?.min).toBe('2026-10-29');
    expect(input?.max).toBe('2026-12-31');

    input!.value = '2026-10-28';
    input!.dispatchEvent(new Event('input'));
    detect();
    expect(el.textContent).toContain('n’est pas proposé');
    expect(button(el, 'confirm')?.disabled).toBe(true);

    input!.value = '2026-11-20';
    input!.dispatchEvent(new Event('input'));
    detect();
    button(el, 'confirm')?.click();
    expect(closed).toEqual(['2026-11-20']);
  });

  it('dit qu’aucun jour n’est ouvert quand le serveur n’en sert aucun', async () => {
    const { el } = await boot([{ pickupAddressId: null, date: null, orderUntil: null }]);
    expect(el.querySelector('fold-empty-state')).not.toBeNull();
  });
});
