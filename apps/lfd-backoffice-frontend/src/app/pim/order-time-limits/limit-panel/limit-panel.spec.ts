import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  EffectiveOrderTimeLimitView,
  OrderTimeLimitPayload,
  OrderTimeLimitView,
} from '@lfd/pim-contracts';
import { By } from '@angular/platform-browser';
import { FoldListboxComponent, FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { CategoryStore } from '../../catalogue/category-store';
import { ProductListStore } from '../../catalogue/product-list-store';
import { OrderTimeLimitsService } from '../order-time-limits.service';
import { LimitPanel, type LimitPanelData } from './limit-panel';

/** La case « l'équipe peut passer outre » : décochée d'office, relue, envoyée. */

const PRODUCT = { type: 'product', id: 'p1' } as const;

const RULE: OrderTimeLimitView = {
  id: 'l1',
  scope: { type: 'product', id: 'p1' },
  scopeLabel: 'Bûche',
  daysBefore: 2,
  time: '12:00',
  graceMinutes: null,
  staffMayExceed: true,
  archived: false,
  excludedProductIds: [],
};

class FakeApi {
  readonly sent: OrderTimeLimitPayload[] = [];
  lineage: EffectiveOrderTimeLimitView | null = null;
  effective(productId: string): Promise<EffectiveOrderTimeLimitView> {
    return this.lineage === null
      ? Promise.reject(new Error('absent'))
      : Promise.resolve({ ...this.lineage, productId });
  }
  set(payload: OrderTimeLimitPayload): Promise<{ id: string }> {
    this.sent.push(payload);
    return Promise.resolve({ id: 'l1' });
  }
}

const notify = { success: (): void => undefined, error: (): void => undefined };

/** Les listes de choix : deux familles, un produit. */
const categories = {
  items: signal([
    { id: 'f1', name: { fr: 'Gâteaux' }, isArchived: false },
    { id: 'f0', name: { fr: 'Ancienne' }, isArchived: true },
  ]),
  ensure: (): Promise<void> => Promise.resolve(),
};
const products = {
  products: signal([{ id: 'p1', sku: 'BUC-01', name: { fr: 'Bûche' } }]),
  open: (): Promise<void> => Promise.resolve(),
};

const FAMILY_RULE: OrderTimeLimitView = {
  ...RULE_BASE(),
  id: 'l2',
  scope: { type: 'category', id: 'f1' },
  scopeLabel: 'Gâteaux',
  archived: true,
  excludedProductIds: ['p1', 'p2', 'p3'],
};

function RULE_BASE(): OrderTimeLimitView {
  return {
    id: 'l1',
    scope: { type: 'product', id: 'p1' },
    scopeLabel: 'Bûche',
    daysBefore: 2,
    time: '12:00',
    graceMinutes: null,
    staffMayExceed: true,
    archived: false,
    excludedProductIds: [],
  };
}

async function render(
  data: LimitPanelData,
  api = new FakeApi(),
): Promise<{ fixture: ComponentFixture<LimitPanel>; api: FakeApi }> {
  TestBed.configureTestingModule({
    imports: [LimitPanel],
    providers: [
      { provide: OrderTimeLimitsService, useValue: api },
      { provide: NotifyService, useValue: notify },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) },
      { provide: CategoryStore, useValue: categories },
      { provide: ProductListStore, useValue: products },
    ],
  });
  const fixture = TestBed.createComponent(LimitPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, api };
}

const box = (fixture: ComponentFixture<LimitPanel>): HTMLInputElement =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    'fold-checkbox input[type="checkbox"]',
  ) as HTMLInputElement;

const submit = async (fixture: ComponentFixture<LimitPanel>): Promise<void> => {
  const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
  (buttons[buttons.length - 1] as HTMLButtonElement).click();
  await fixture.whenStable();
};

describe('LimitPanel — la case « l’équipe peut passer outre »', () => {
  it('est décochée sur une limite neuve, et part à false', async () => {
    const { fixture, api } = await render({ scope: PRODUCT, label: 'Bûche', rule: null });
    expect(box(fixture).checked).toBe(false);
    const time = (fixture.nativeElement as HTMLElement).querySelector(
      'input[type="time"]',
    ) as HTMLInputElement;
    time.value = '10:00';
    time.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await submit(fixture);
    expect(api.sent).toEqual([
      {
        scope: { type: 'product', id: 'p1' },
        daysBefore: 1,
        time: '10:00',
        graceMinutes: null,
        staffMayExceed: false,
      },
    ]);
  });

  it('relit la case depuis la limite, et envoie ce qui est coché', async () => {
    const { fixture, api } = await render({ scope: PRODUCT, label: 'Bûche', rule: RULE });
    expect(box(fixture).checked).toBe(true);
    box(fixture).click();
    fixture.detectChanges();
    await submit(fixture);
    expect(api.sent[0]?.staffMayExceed).toBe(false);
  });

  it('dit sous la case ce qu’elle permet', async () => {
    const { fixture } = await render({ scope: PRODUCT, label: 'Bûche', rule: null });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "L'heure limite générale reste opposée.",
    );
  });

  it('dit la règle du point de décision unique', async () => {
    const { fixture } = await render({ scope: PRODUCT, label: 'Bûche', rule: null });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "Passer outre n'est possible que si toutes les limites qui visent ce produit le permettent.",
    );
  });
});

const text = (fixture: ComponentFixture<LimitPanel>): string =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/gu, ' ');

describe('LimitPanel — la portée famille', () => {
  it('pose sur la famille fixée à l’ouverture', async () => {
    const { fixture, api } = await render({
      scope: { type: 'category', id: 'f1' },
      label: 'Gâteaux',
      rule: null,
    });
    expect(text(fixture)).toContain("S'applique à Gâteaux, à ses sous-familles");
    const time = (fixture.nativeElement as HTMLElement).querySelector(
      'input[type="time"]',
    ) as HTMLInputElement;
    time.value = '12:00';
    time.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await submit(fixture);
    expect(api.sent[0]?.scope).toEqual({ type: 'category', id: 'f1' });
  });

  it('montre avant validation les exclusions qu’une famille archivée remet en vigueur', async () => {
    const { fixture } = await render({
      scope: { type: 'category', id: 'f1' },
      label: 'Gâteaux',
      rule: FAMILY_RULE,
    });
    expect(text(fixture)).toContain('3 produits restent exclus');
  });

  it('ne dit rien des exclusions d’une famille en vigueur', async () => {
    const { fixture } = await render({
      scope: { type: 'category', id: 'f1' },
      label: 'Gâteaux',
      rule: { ...FAMILY_RULE, archived: false },
    });
    expect(text(fixture)).not.toContain('restent exclus');
  });

  it('fait choisir la portée sans « toute la production », et retrouve la limite archivée de la famille choisie', async () => {
    const { fixture } = await render({
      scope: null,
      label: '',
      rule: null,
      known: [FAMILY_RULE],
    });
    expect(text(fixture)).not.toContain('Toute la production');
    const [, family] = fixture.debugElement.queryAll(By.directive(FoldListboxComponent));
    (family?.componentInstance as FoldListboxComponent<string>).selectionChange.emit('f1');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(text(fixture)).toContain('3 produits restent exclus');
  });
});

describe('LimitPanel — une limite de produit sans effet face à sa famille', () => {
  const lineage = (excludesProduct: boolean): EffectiveOrderTimeLimitView => ({
    productId: 'p1',
    lineage: [
      { id: 'f1', label: 'Gâteaux' },
      { id: 'f0', label: 'Pâtisserie' },
    ],
    rules: [
      {
        rule: {
          ...FAMILY_RULE,
          archived: false,
          excludedProductIds: excludesProduct ? ['p1'] : [],
        },
        excludesProduct,
      },
    ],
    explained: null,
  });

  async function typed(
    days: string,
    time: string,
    excludesProduct = false,
  ): Promise<ComponentFixture<LimitPanel>> {
    const api = new FakeApi();
    api.lineage = lineage(excludesProduct);
    const { fixture } = await render({ scope: PRODUCT, label: 'Bûche', rule: null }, api);
    const listbox = fixture.debugElement.query(By.directive(FoldListboxComponent));
    (listbox.componentInstance as FoldListboxComponent<string>).selectionChange.emit(days);
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      'input[type="time"]',
    ) as HTMLInputElement;
    input.value = time;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('avertit pendant la saisie quand la famille est plus stricte, sans bloquer', async () => {
    const fixture = await typed('1', '18:00');
    expect(text(fixture)).toContain("Sans effet : la famille Gâteaux impose l'avant-veille, 12:00");
    expect(text(fixture)).toContain('excluez-le de la limite de la famille');
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    expect((buttons[buttons.length - 1] as HTMLButtonElement).disabled).toBe(false);
  });

  it('avertit aussi quand elle est égale', async () => {
    const fixture = await typed('2', '12:00');
    expect(text(fixture)).toContain('Sans effet');
  });

  it('se tait quand la limite du produit est plus stricte', async () => {
    const fixture = await typed('3', '18:00');
    expect(text(fixture)).not.toContain('Sans effet');
  });

  it('se tait quand le produit est exclu de la famille', async () => {
    const fixture = await typed('1', '18:00', true);
    expect(text(fixture)).not.toContain('Sans effet');
  });
});
