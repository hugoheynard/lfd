import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type {
  CatalogItemView,
  CustomerShelfPriceView,
  CustomerShelfPricesView,
  CustomerSkuStat,
} from '@lfd/contracts';
import { formatCents, formatMillicents } from '@lfd/b2b-ui/order';
import { beforeEach, describe, expect, it } from 'vitest';

import { CartStore } from '../cart.store';
import { SourceProduits, type ProposedLine } from './source-produits';

const item = (sku: string, name: string): CatalogItemView => ({
  sku,
  name,
  unitPriceMillicents: 100_000,
  vatRate: 5.5,
  family: null,
  category: null,
});

const CATALOGUE = [
  item('BAG', 'Baguette'),
  item('RES', 'Réservée'),
  item('ABS', 'Absente'),
] as const;

const BAG_PRICE: CustomerShelfPriceView = {
  sku: 'BAG',
  unitPriceMillicents: 70_000,
  struckFromMillicents: 100_000,
  unitPriceTtcCents: 74,
  struckFromTtcCents: 106,
  lockedReason: null,
};

const table = (audience: CustomerShelfPricesView['audience']): CustomerShelfPricesView => ({
  audience,
  items: [BAG_PRICE, { ...BAG_PRICE, sku: 'RES', lockedReason: 'reserved_to_other_account' }],
});

interface Harness {
  readonly fixture: ComponentFixture<SourceProduits>;
  readonly added: ProposedLine[];
}

function mount(
  shelfPrices: CustomerShelfPricesView | null,
  habits: readonly CustomerSkuStat[] = [],
): Harness {
  const fixture = TestBed.createComponent(SourceProduits);
  fixture.componentRef.setInput('kind', 'catalogue');
  fixture.componentRef.setInput('catalogue', CATALOGUE);
  fixture.componentRef.setInput('habits', habits);
  fixture.componentRef.setInput('orders', []);
  fixture.componentRef.setInput('cart', new CartStore());
  fixture.componentRef.setInput('shelfPrices', shelfPrices);
  const added: ProposedLine[] = [];
  fixture.componentInstance.add.subscribe((line) => added.push(line));
  fixture.detectChanges();
  return { fixture, added };
}

/** La rangée d'un article, repérée par son nom. */
function rowOf(fixture: ComponentFixture<SourceProduits>, name: string): HTMLElement {
  const host = fixture.nativeElement as HTMLElement;
  const row = [...host.querySelectorAll<HTMLElement>('[role="tabpanel"] .src-row')].find(
    (candidate) => candidate.textContent?.includes(name) === true,
  );
  if (row === undefined) {
    throw new Error(`Aucune rangée pour ${name}`);
  }
  return row;
}

function addButtonOf(row: HTMLElement): HTMLButtonElement | null {
  return (
    [...row.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Ajouter',
    ) ?? null
  );
}

describe('la liste de la saisie au prix du client (plan liste au prix du client, L2)', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('un pro : le prix de son rayon en HT, et le tarif barré', () => {
    const { fixture } = mount(table('pro'));
    const row = rowOf(fixture, 'Baguette');
    expect(row.textContent).toContain(formatMillicents(70_000));
    expect(row.textContent).toContain('HT');
    expect(row.querySelector('s')?.textContent).toBe(`${formatMillicents(100_000)} HT`);
  });

  it('un particulier : le TTC, barré au TTC', () => {
    const { fixture } = mount(table('public'));
    const row = rowOf(fixture, 'Baguette');
    expect(row.textContent).toContain(formatCents(74));
    expect(row.textContent).toContain('TTC');
    expect(row.querySelector('s')?.textContent).toBe(`${formatCents(106)} TTC`);
  });

  it('ajouté, l’article part au prix HT du client', () => {
    const { fixture, added } = mount(table('public'));
    addButtonOf(rowOf(fixture, 'Baguette'))?.click();
    expect(added).toHaveLength(1);
    expect(added[0]?.unitPriceMillicents).toBe(70_000);
  });

  it('un article verrouillé est dit, et ne s’ajoute pas', () => {
    const { fixture } = mount(table('pro'));
    const row = rowOf(fixture, 'Réservée');
    expect(row.textContent).toContain('Réservé à un autre compte');
    expect(addButtonOf(row)).toBeNull();
    expect(row.textContent).not.toContain(formatMillicents(70_000));
  });

  it('un article absent du rayon est grisé « pas proposé », et ne s’ajoute pas', () => {
    const { fixture } = mount(table('pro'));
    const row = rowOf(fixture, 'Absente');
    expect(row.textContent).toContain('Pas proposé à ce client');
    expect(addButtonOf(row)).toBeNull();
  });

  it('sans table : le prix d’étiquette, et tout s’ajoute', () => {
    const { fixture } = mount(null);
    const row = rowOf(fixture, 'Absente');
    expect(row.textContent).toContain(formatMillicents(100_000));
    expect(addButtonOf(row)).not.toBeNull();
    expect(rowOf(fixture, 'Baguette').querySelector('s')).toBeNull();
  });

  it('une habitude prend aussi le prix du client, et une habitude hors rayon ne s’ajoute pas', () => {
    const habit = (sku: string, productName: string): CustomerSkuStat => ({
      sku,
      productName,
      orderCount: 2,
      totalQuantity: 10,
      totalCents: 1000,
      lastOrderedAt: '2026-11-01T08:00:00.000Z',
      unitPriceMillicents: 100_000,
      stillAvailable: true,
    });
    const { fixture } = mount(table('pro'), [habit('BAG', 'Baguette'), habit('ABS', 'Absente')]);
    fixture.componentRef.setInput('kind', 'habituels');
    fixture.detectChanges();
    expect(rowOf(fixture, 'Baguette').textContent).toContain(formatMillicents(70_000));
    expect(addButtonOf(rowOf(fixture, 'Absente'))).toBeNull();
  });
});
