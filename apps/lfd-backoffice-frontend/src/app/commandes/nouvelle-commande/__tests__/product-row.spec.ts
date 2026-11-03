import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ProductRow, type CatalogOrder, type CatalogProduct } from '@lfd/b2b-ui/catalog';
import { describe, expect, it } from 'vitest';

/**
 * La rangée partagée, telle que la saisie de commande la monte (décision Hugo
 * du 2026-11-03) : « Ajouter » en toutes lettres tant que l'article n'est pas au
 * panier, puis le pas-à-pas de la LIGNE elle-même. Le jest de `@lfd/b2b-ui`
 * tourne sans TestBed : le rendu s'éprouve ici, chez son seul consommateur.
 */
const PAIN: CatalogProduct = { id: 'PAI-001', name: 'Pain de mie', minimum: 10 };

function mount(
  product: CatalogProduct,
  inCart: number,
): {
  fixture: ComponentFixture<ProductRow>;
  host: HTMLElement;
  changes: CatalogOrder[];
  adds: CatalogOrder[];
} {
  const fixture = TestBed.createComponent(ProductRow);
  fixture.componentRef.setInput('product', product);
  fixture.componentRef.setInput('inCart', inCart);
  fixture.componentRef.setInput('favoritable', false);
  const changes: CatalogOrder[] = [];
  const adds: CatalogOrder[] = [];
  fixture.componentInstance.quantityChange.subscribe((e) => changes.push(e));
  fixture.componentInstance.action.subscribe((e) => adds.push(e));
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, changes, adds };
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (found === null) {
    throw new Error(`aucun bouton « ${label} »`);
  }
  return found;
}

describe('ProductRow — saisie de commande', () => {
  it('hors panier : un bouton « Ajouter » écrit, qui dit la quantité', () => {
    const { host, adds } = mount(PAIN, 0);
    const add = button(host, 'Ajouter 10');

    expect(add.textContent.trim()).toBe('Ajouter');
    add.click();

    expect(adds).toEqual([{ product: PAIN, quantity: 10 }]);
  });

  it('hors panier : une quantité hors règle part ramenée à la règle', () => {
    const { fixture, host, adds } = mount(PAIN, 0);
    fixture.componentInstance.quantity.set(4);
    fixture.detectChanges();

    button(host, 'Ajouter 4').click();

    expect(adds[0]?.quantity).toBe(10);
  });

  it('au panier : plus de bouton d’ajout, le pas-à-pas modifie la ligne', () => {
    const { host, changes } = mount(PAIN, 12);

    expect(host.querySelector('button[aria-label^="Ajouter"]')).toBeNull();
    button(host, 'Augmenter').click();
    button(host, 'Diminuer').click();

    expect(changes.map((c) => c.quantity)).toEqual([13, 11]);
  });

  it('au plancher, le « − » devient « retirer » et émet 0', () => {
    const { host, changes } = mount(PAIN, 10);

    button(host, 'Retirer Pain de mie').click();

    expect(changes).toEqual([{ product: PAIN, quantity: 0 }]);
  });

  it('une saisie au clavier part à la validation, ramenée au plancher', () => {
    const { fixture, changes } = mount(PAIN, 12);
    fixture.componentInstance.cartDraft.set(3);

    fixture.componentInstance.onCommitDraft();

    expect(changes).toEqual([{ product: PAIN, quantity: 10 }]);
  });

  it('au poids : le cran suit le pas, et le plancher retire', () => {
    const gravlax: CatalogProduct = {
      id: 'SAU-001',
      name: 'Saumon',
      saleUnit: 'weight',
      step: 100,
      minimum: 250,
    };
    const { host, changes } = mount(gravlax, 300);

    button(host, 'Augmenter').click();
    button(host, 'Retirer Saumon').click();

    expect(changes.map((c) => c.quantity)).toEqual([400, 0]);
  });
});
