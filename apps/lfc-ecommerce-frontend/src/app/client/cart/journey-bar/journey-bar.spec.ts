import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { OrderContextStore } from '../../order-context.store';
import { OrderDoors } from '../../shop/order-doors';
import { ClientCart } from '../client-cart.service';
import { JourneyBar } from './journey-bar';

function boot(): {
  fixture: ComponentFixture<JourneyBar>;
  doors: { resume: ReturnType<typeof vi.fn>; delivery: ReturnType<typeof vi.fn> };
  navigate: ReturnType<typeof vi.fn>;
} {
  localStorage.clear();
  const doors = {
    resume: vi.fn(() => Promise.resolve(true)),
    delivery: vi.fn(() => Promise.resolve(true)),
  };
  const navigate = vi.fn(() => Promise.resolve(true));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [JourneyBar],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: OrderDoors, useValue: doors },
      { provide: Router, useValue: { navigateByUrl: navigate } },
      {
        provide: ClientCart,
        useValue: { count: signal(2), totals: signal({ discountCents: 0, totalCents: 500 }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(JourneyBar);
  return { fixture, doors, navigate };
}

const button = (fixture: ComponentFixture<JourneyBar>): HTMLButtonElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.pay');

/** La barre hors de la boutique (plan `plan-barre-qui-accompagne.md`, §2.2). */
describe('JourneyBar', () => {
  it('reprend le parcours à l’étape qui manque', () => {
    const { fixture, doors } = boot();
    TestBed.inject(OrderContextStore).draft.set({ mode: 'pickup' });
    fixture.detectChanges();

    button(fixture)?.click();

    expect(doors.resume).toHaveBeenCalledOnce();
  });

  it('« Régler » mène à la boutique, où le règlement s’enchaîne', () => {
    const { fixture, navigate } = boot();
    fixture.detectChanges();

    button(fixture)?.click();

    expect(navigate).toHaveBeenCalledWith('/boutique');
  });
});
