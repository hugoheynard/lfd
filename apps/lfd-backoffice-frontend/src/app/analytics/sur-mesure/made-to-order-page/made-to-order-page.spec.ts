import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type {
  MadeToOrderByClientView,
  MadeToOrderMonthWindow,
  MadeToOrderMonthlyView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { MadeToOrderReportsService } from '../made-to-order-reports.service';
import { MadeToOrderPage } from './made-to-order-page';

const MONTHLY: MadeToOrderMonthlyView = {
  months: 12,
  rows: [
    {
      month: '2026-10',
      madeToOrderHtCents: 2_000,
      otherHtCents: 5_000,
      unknownHtCents: 3_000,
      totalHtCents: 10_000,
      madeToOrderOrders: 2,
      madeToOrderShare: 0.2,
    },
  ],
};

const CLIENTS: MadeToOrderByClientView = {
  from: '2026-10-01',
  to: '2026-10-30',
  madeToOrderHtCents: 2_000,
  unknownHtCents: 700,
  clients: [
    {
      clientKey: 'company:a',
      kind: 'company',
      companyId: 'a',
      name: 'Hôtel des Cimes',
      principalName: 'Groupe Cimes',
      madeToOrderHtCents: 2_000,
      unknownHtCents: 700,
      articles: [
        {
          sku: 'ENT-001-1',
          productName: 'Entremets signature',
          saleUnit: 'piece',
          quantity: 2,
          htCents: 2_000,
          orders: 1,
        },
      ],
    },
  ],
};

class FakeApi {
  readonly monthsAsked: MadeToOrderMonthWindow[] = [];
  readonly periodsAsked: [string, string][] = [];
  clientsFailure: unknown = null;
  monthly(months: MadeToOrderMonthWindow): Promise<MadeToOrderMonthlyView> {
    this.monthsAsked.push(months);
    return Promise.resolve(MONTHLY);
  }
  byClient(from: string, to: string): Promise<MadeToOrderByClientView> {
    this.periodsAsked.push([from, to]);
    return this.clientsFailure === null
      ? Promise.resolve(CLIENTS)
      : Promise.reject(this.clientsFailure);
  }
}

async function render(api: FakeApi) {
  TestBed.configureTestingModule({
    imports: [MadeToOrderPage],
    providers: [{ provide: MadeToOrderReportsService, useValue: api }],
  });
  const fixture = TestBed.createComponent(MadeToOrderPage);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const textOf = (root: HTMLElement): string => (root.textContent ?? '').replace(/\s+/gu, ' ');

describe('MadeToOrderPage', () => {
  it('lit 12 mois et le mois en cours par défaut', async () => {
    const api = new FakeApi();
    await render(api);
    expect(api.monthsAsked).toEqual([12]);
    const [period] = api.periodsAsked;
    expect(period?.[0]).toMatch(/^\d{4}-\d{2}-01$/u);
    expect(period?.[0].slice(0, 7)).toBe(period?.[1].slice(0, 7));
  });

  it('montre la part, et l’avant-suivi à part plutôt que dans le reste', async () => {
    const text = textOf((await render(new FakeApi())).nativeElement as HTMLElement);
    expect(text).toContain('octobre 2026');
    expect(text).toContain('20 %');
    expect(text).toContain('Avant le suivi');
    expect(text).toContain('ne sont comptées ni d’un côté ni de l’autre');
  });

  it('nomme le client, son principal et ses articles', async () => {
    const text = textOf((await render(new FakeApi())).nativeElement as HTMLElement);
    expect(text).toContain('Hôtel des Cimes');
    expect(text).toContain('rattachée à Groupe Cimes');
    expect(text).toContain('Entremets signature (ENT-001-1)');
    expect(text).toContain('2 pièces');
  });

  it('dit le refus de période du serveur tel quel', async () => {
    const api = new FakeApi();
    api.clientsFailure = new HttpErrorResponse({
      status: 400,
      error: { message: 'La période finit avant son début : inversez les deux dates.' },
    });
    const text = textOf((await render(api)).nativeElement as HTMLElement);
    expect(text).toContain('inversez les deux dates');
  });
});
