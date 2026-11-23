import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { EffectiveOrderTimeLimitView, OrderTimeLimitView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../../../notify.service';
import { OrderTimeLimitsService } from '../../../../../order-time-limits/order-time-limits.service';
import { ProductFormStore } from '../../../product-form-store';
import { OrderLimitForm } from '../order-limit-form';

function rule(over: Partial<OrderTimeLimitView>): OrderTimeLimitView {
  return {
    id: 'l1',
    scope: { type: 'product', id: 'p1' },
    scopeLabel: 'FRA-06',
    daysBefore: 1,
    time: '18:00',
    graceMinutes: null,
    staffMayExceed: false,
    archived: false,
    excludedProductIds: [],
    ...over,
  };
}

const GATEAUX = rule({
  id: 'l2',
  scope: { type: 'category', id: 'f1' },
  scopeLabel: 'Gâteaux',
  daysBefore: 2,
  time: '12:00',
  staffMayExceed: true,
});

class FakeApi {
  view: EffectiveOrderTimeLimitView = {
    productId: 'p1',
    lineage: [
      { id: 'f1', label: 'Gâteaux' },
      { id: 'f0', label: 'Pâtisserie' },
    ],
    rules: [
      { rule: rule({}), excludesProduct: false },
      { rule: GATEAUX, excludesProduct: false },
    ],
    explained: {
      limit: { daysBefore: 2, time: '12:00', graceMinutes: 0, staffMayExceed: false },
      from: { type: 'category', id: 'f1' },
    },
  };
  readonly calls: string[] = [];
  refuse = false;
  effective(): Promise<EffectiveOrderTimeLimitView> {
    return Promise.resolve(this.view);
  }
  exclude(id: string, productId: string): Promise<void> {
    this.calls.push(`exclude:${id}:${productId}`);
    return this.refuse
      ? Promise.reject(
          new HttpErrorResponse({
            status: 409,
            error: { code: 'pim.order_time_limit.exclusion_outside_family', message: 'refus' },
          }),
        )
      : Promise.resolve();
  }
  include(id: string, productId: string): Promise<void> {
    this.calls.push(`include:${id}:${productId}`);
    return Promise.resolve();
  }
}

class FakeNotify {
  readonly said: string[] = [];
  success(message: string): void {
    this.said.push(message);
  }
  error(): void {
    this.said.push('erreur');
  }
  refused(_error: unknown, message?: string): void {
    this.said.push(message ?? 'refus');
  }
}

async function render(
  api: FakeApi,
  notify = new FakeNotify(),
): Promise<ComponentFixture<OrderLimitForm>> {
  TestBed.configureTestingModule({
    imports: [OrderLimitForm],
    providers: [
      provideRouter([]),
      { provide: OrderTimeLimitsService, useValue: api },
      { provide: NotifyService, useValue: notify },
      {
        provide: ProductFormStore,
        useValue: { productId: signal('p1'), pageTitle: signal('Fraisier') },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderLimitForm);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const textOf = (fixture: ComponentFixture<OrderLimitForm>): string =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/gu, ' ');

const box = (fixture: ComponentFixture<OrderLimitForm>): HTMLInputElement =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    'fold-checkbox input[type="checkbox"]',
  ) as HTMLInputElement;

describe('OrderLimitForm — la limite effective et sa provenance', () => {
  it('dit la limite effective et la famille dont elle vient', async () => {
    const text = textOf(await render(new FakeApi()));

    expect(text).toContain("L'avant-veille, 12:00 — famille Gâteaux");
    expect(text).toContain("L'équipe ne peut pas passer outre.");
    expect(text).toContain('Modifier la limite propre');
  });

  it('dit « limite propre du produit » quand elle gagne', async () => {
    const api = new FakeApi();
    api.view = {
      ...api.view,
      rules: [{ rule: rule({}), excludesProduct: false }],
      explained: {
        limit: { daysBefore: 1, time: '18:00', graceMinutes: 0, staffMayExceed: true },
        from: { type: 'product', id: 'p1' },
      },
    };
    const text = textOf(await render(api));

    expect(text).toContain('La veille, 18:00 — limite propre du produit');
    expect(text).not.toContain('Exclure de la limite');
  });

  it('sans limite, dit que seule la règle générale juge et propose d’en poser une', async () => {
    const api = new FakeApi();
    api.view = { ...api.view, rules: [], explained: null };
    const text = textOf(await render(api));

    expect(text).toContain('seule la règle générale juge ce produit');
    expect(text).toContain('Poser une limite propre');
  });
});

describe('OrderLimitForm — exclure de la limite d’une famille', () => {
  it('une case par famille qui pose une limite, et la cocher exclut', async () => {
    const api = new FakeApi();
    const fixture = await render(api);

    expect(textOf(fixture)).toContain('Exclure de la limite de la famille Gâteaux');
    expect(box(fixture).checked).toBe(false);
    box(fixture).click();
    await fixture.whenStable();

    expect(api.calls).toEqual(['exclude:l2:p1']);
  });

  it('décocher réintègre', async () => {
    const api = new FakeApi();
    api.view = {
      ...api.view,
      rules: [{ rule: GATEAUX, excludesProduct: true }],
    };
    const fixture = await render(api);

    expect(box(fixture).checked).toBe(true);
    box(fixture).click();
    await fixture.whenStable();

    expect(api.calls).toEqual(['include:l2:p1']);
  });

  it('nomme la famille quand le produit n’y est pas (409)', async () => {
    const api = new FakeApi();
    api.refuse = true;
    const notify = new FakeNotify();
    const fixture = await render(api, notify);

    box(fixture).click();
    await fixture.whenStable();

    expect(notify.said).toEqual(["Ce produit n'est pas dans la famille Gâteaux."]);
  });
});
