import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FoldDateComponent } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { FR } from '../../copy/fr';
import { NO_DAYS, type OrderDays } from '../client-order-history.service';
import { OrderDayFilter } from './order-day-filter';

/** Des jours comparés entre eux seulement : le filtre ne lit pas l'horloge. */
describe('OrderDayFilter — le filtre « du … au … » (plan du récapitulatif, R3)', () => {
  let fixture: ComponentFixture<OrderDayFilter>;
  let emitted: OrderDays[];

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const field = (attribute: string): FoldDateComponent =>
    fixture.debugElement.query(By.css(`[${attribute}]`)).injector.get(FoldDateComponent);

  function boot(days: OrderDays): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [OrderDayFilter] });
    fixture = TestBed.createComponent(OrderDayFilter);
    fixture.componentRef.setInput('days', days);
    emitted = [];
    fixture.componentInstance.daysChange.subscribe((days) => emitted.push(days));
    fixture.detectChanges();
  }

  beforeEach(() => {
    boot(NO_DAYS);
  });

  it('émet la borne choisie, l’autre gardée', () => {
    field('data-day-from').value.set('2026-10-01');
    expect(emitted).toEqual([{ from: '2026-10-01', to: null }]);
  });

  it('n’émet pas une paire inversée — le serveur la refuserait', () => {
    boot({ from: '2026-10-15', to: null });
    field('data-day-to').value.set('2026-10-01');
    expect(emitted).toEqual([]);
  });

  it('un champ vidé retire sa borne', () => {
    boot({ from: '2026-10-01', to: '2026-10-15' });
    field('data-day-to').value.set('');
    expect(emitted).toEqual([{ from: '2026-10-01', to: null }]);
  });

  it('sans borne, ni phrase ni bouton d’effacement', () => {
    expect(el().querySelector('[data-day-undated]')).toBeNull();
    expect(el().querySelector('[data-day-clear]')).toBeNull();
  });

  it('une borne posée dit ce qu’elle écarte, et s’efface d’un geste', () => {
    boot({ from: '2026-10-01', to: null });
    expect(el().querySelector('[data-day-undated]')?.textContent?.trim()).toBe(
      FR.orders.summary.filterUndated,
    );
    (el().querySelector('[data-day-clear]') as HTMLButtonElement).click();
    expect(emitted).toEqual([NO_DAYS]);
  });
});
