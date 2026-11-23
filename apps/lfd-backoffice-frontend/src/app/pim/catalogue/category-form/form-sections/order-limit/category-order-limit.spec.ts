import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import type { OrderTimeLimitListItem } from '@lfd/pim-contracts';
import { FoldListboxComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../../notify.service';
import { OrderTimeLimitsService } from '../../../../order-time-limits/order-time-limits.service';
import { CategoryStore } from '../../../category-store';
import { ProductListStore } from '../../../product-list-store';
import { CategoryOrderLimit } from './category-order-limit';

function familyRule(over: Partial<OrderTimeLimitListItem> = {}): OrderTimeLimitListItem {
  return {
    id: 'l2',
    scope: { type: 'category', id: 'f1' },
    scopeLabel: 'Gâteaux',
    daysBefore: 2,
    time: '12:00',
    graceMinutes: null,
    staffMayExceed: false,
    archived: false,
    excludedProductIds: ['p7'],
    exclusions: [{ productId: 'p7', label: 'FRA-06' }],
    ...over,
  };
}

class FakeApi {
  rules: readonly OrderTimeLimitListItem[] = [];
  readonly calls: string[] = [];
  refuseExclusion = false;
  list(): Promise<readonly OrderTimeLimitListItem[]> {
    return Promise.resolve(this.rules);
  }
  archive(id: string): Promise<void> {
    this.calls.push(`archive:${id}`);
    return Promise.resolve();
  }
  restore(id: string): Promise<void> {
    this.calls.push(`restore:${id}`);
    return Promise.resolve();
  }
  exclude(id: string, productId: string): Promise<void> {
    this.calls.push(`exclude:${id}:${productId}`);
    if (this.refuseExclusion) {
      return Promise.reject(
        new HttpErrorResponse({
          status: 409,
          error: { code: 'pim.order_time_limit.exclusion_outside_family', message: 'refus' },
        }),
      );
    }
    return Promise.resolve();
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

const products = {
  products: signal([
    { id: 'p7', sku: 'FRA-06', name: { fr: 'Fraisier' }, categoryId: 'f1' },
    { id: 'p9', sku: 'ENT-01', name: { fr: 'Entremets' }, categoryId: 'f2' },
    { id: 'p5', sku: 'PAN-01', name: { fr: 'Pain' }, categoryId: 'pain' },
  ]),
  open: (): Promise<void> => Promise.resolve(),
};

const categories = {
  items: signal([
    { id: 'f1', parentId: null },
    { id: 'f2', parentId: 'f1' },
    { id: 'pain', parentId: null },
  ]),
  ensure: (): Promise<void> => Promise.resolve(),
};

async function render(
  api: FakeApi,
  notify = new FakeNotify(),
): Promise<ComponentFixture<CategoryOrderLimit>> {
  TestBed.configureTestingModule({
    imports: [CategoryOrderLimit],
    providers: [
      { provide: OrderTimeLimitsService, useValue: api },
      { provide: NotifyService, useValue: notify },
      { provide: ProductListStore, useValue: products },
      { provide: CategoryStore, useValue: categories },
    ],
  });
  const fixture = TestBed.createComponent(CategoryOrderLimit);
  fixture.componentRef.setInput('familyId', 'f1');
  fixture.componentRef.setInput('familyName', 'Gâteaux');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const textOf = (fixture: ComponentFixture<CategoryOrderLimit>): string =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/gu, ' ');

function button(fixture: ComponentFixture<CategoryOrderLimit>, label: string): HTMLButtonElement {
  const found = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
  ).find((candidate) => (candidate.textContent ?? '').trim() === label);
  if (found === undefined) {
    throw new Error(`bouton « ${label} » absent`);
  }
  return found;
}

describe('CategoryOrderLimit', () => {
  it('propose de poser une limite quand la famille n’en a pas', async () => {
    const api = new FakeApi();
    api.rules = [familyRule({ scope: { type: 'category', id: 'autre' } })];
    const fixture = await render(api);

    expect(textOf(fixture)).toContain('Pas de limite sur cette famille');
    expect(button(fixture, 'Poser une limite')).toBeTruthy();
  });

  it('dit la limite de la famille, ses exclus, et réintègre un exclu', async () => {
    const api = new FakeApi();
    api.rules = [familyRule()];
    const fixture = await render(api);

    expect(textOf(fixture)).toContain("L'avant-veille, 12:00");
    expect(textOf(fixture)).toContain('1 produit exclu');
    expect(textOf(fixture)).toContain('FRA-06');

    button(fixture, 'Réintégrer').click();
    await fixture.whenStable();
    expect(api.calls).toEqual(['include:l2:p7']);
  });

  it('archive après confirmation', async () => {
    const api = new FakeApi();
    api.rules = [familyRule()];
    const fixture = await render(api);

    button(fixture, 'Archiver').click();
    fixture.detectChanges();
    button(fixture, 'Confirmer').click();
    await fixture.whenStable();
    expect(api.calls).toEqual(['archive:l2']);
  });

  it('restaure une limite archivée', async () => {
    const api = new FakeApi();
    api.rules = [familyRule({ archived: true })];
    const fixture = await render(api);

    expect(textOf(fixture)).toContain('archivée');
    button(fixture, 'Restaurer').click();
    await fixture.whenStable();
    expect(api.calls).toEqual(['restore:l2']);
  });

  it('nomme la famille quand le produit n’y est pas', async () => {
    const api = new FakeApi();
    api.rules = [familyRule()];
    api.refuseExclusion = true;
    const notify = new FakeNotify();
    const fixture = await render(api, notify);

    const listbox = fixture.debugElement.query(By.directive(FoldListboxComponent));
    (listbox.componentInstance as FoldListboxComponent<string>).selectionChange.emit('p9');
    fixture.detectChanges();
    button(fixture, 'Exclure').click();
    await fixture.whenStable();

    expect(api.calls).toEqual(['exclude:l2:p9']);
    expect(notify.said.at(-1)).toContain("Ce produit n'est pas dans la famille Gâteaux");
  });

  it('ne propose que la descendance, sans les produits déjà exclus', async () => {
    const api = new FakeApi();
    api.rules = [familyRule()];
    const fixture = await render(api);

    const listbox = fixture.debugElement.query(By.directive(FoldListboxComponent));
    const options = (listbox.componentInstance as FoldListboxComponent<string>).options() ?? [];
    expect(options.map((option) => ('value' in option ? option.value : null))).toEqual(['p9']);
  });
});
