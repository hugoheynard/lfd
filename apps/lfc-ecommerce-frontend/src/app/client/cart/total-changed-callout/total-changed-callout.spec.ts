import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ShopQuoteView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ClientOrders, type SeenTotalChange } from '../../client-orders.service';
import { FR } from '../../copy/fr';
import { ClientCart } from '../client-cart.service';
import type { QuoteStatus } from '../shop-quote.service';
import { TotalChangedCallout } from './total-changed-callout';

const BEFORE: ShopQuoteView = {
  lines: [],
  subtotalHtCents: 4000,
  discountCents: 0,
  discountAdjustment: null,
  voucherDiscountCents: 0,
  deliveryFeeCents: 0,
  deliveryVatMode: 'standard',
  vat: [{ rate: 5.5, amountCents: 230 }],
  totalCents: 4230,
};

interface World {
  readonly change: SeenTotalChange | null;
  readonly after: ShopQuoteView;
  readonly pricing?: QuoteStatus;
}

let dismissed = 0;

function boot({ change, after, pricing = 'ready' }: World): ComponentFixture<TotalChangedCallout> {
  dismissed = 0;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [TotalChangedCallout],
    providers: [
      {
        provide: ClientCart,
        useValue: { totals: signal(after), pricing: signal(pricing), lines: signal([]) },
      },
      {
        provide: ClientOrders,
        useValue: {
          totalChange: signal(change),
          dismissTotalChange: (): void => {
            dismissed += 1;
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(TotalChangedCallout);
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<TotalChangedCallout>): string =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim();

const buttons = (fixture: ComponentFixture<TotalChangedCallout>): HTMLButtonElement[] => [
  ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
];

describe('TotalChangedCallout — l’écart de total, en un message (plan total vu, T3)', () => {
  it('nomme les deux totaux et la surtaxe apparue', () => {
    const fixture = boot({
      change: { before: BEFORE, settlement: 'account' },
      after: { ...BEFORE, lateFeeCents: 500, totalCents: 4730 },
    });

    expect(text(fixture)).toContain('42,30');
    expect(text(fixture)).toContain('47,30');
    expect(text(fixture)).toContain('après l’heure limite, un supplément de 5,00');
  });

  it('un écart nul ne dit rien', () => {
    const fixture = boot({ change: { before: BEFORE, settlement: null }, after: { ...BEFORE } });
    expect(text(fixture)).toBe('');
  });

  it('se tait tant que le devis neuf est en vol', () => {
    const fixture = boot({
      change: { before: BEFORE, settlement: null },
      after: { ...BEFORE, totalCents: 4730 },
      pricing: 'loading',
    });
    expect(text(fixture)).toBe('');
  });

  it('sans écart reconnu terme à terme, dit que les prix ont été mis à jour', () => {
    const fixture = boot({
      change: { before: BEFORE, settlement: null },
      after: { ...BEFORE, totalCents: 4231 },
    });
    expect(text(fixture)).toContain(FR.cart.changeOther);
  });

  it('confirmer rejoue le règlement choisi au premier clic', () => {
    const fixture = boot({
      change: { before: BEFORE, settlement: 'card' },
      after: { ...BEFORE, totalCents: 4730 },
    });
    const emitted: (string | null)[] = [];
    fixture.componentInstance.confirm.subscribe((settlement) => emitted.push(settlement));

    const [confirm] = buttons(fixture);
    expect(confirm?.textContent).toContain('47,30');
    confirm?.click();

    expect(emitted).toEqual(['card']);
  });

  it('modifier referme l’écart', () => {
    const fixture = boot({
      change: { before: BEFORE, settlement: null },
      after: { ...BEFORE, totalCents: 4730 },
    });
    buttons(fixture)[1]?.click();
    expect(dismissed).toBe(1);
  });
});
