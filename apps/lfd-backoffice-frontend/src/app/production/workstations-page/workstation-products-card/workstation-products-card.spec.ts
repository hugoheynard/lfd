import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  CatalogFamilyView,
  PlaceProductsPayload,
  WorkstationProductView,
  WorkstationView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorkstationsService } from '../../workstations.service';
import { UNPLACED, WorkstationProductsCard } from './workstation-products-card';

class FakeWorkstations {
  readonly placed: { payload: PlaceProductsPayload; key: string }[] = [];
  async place(payload: PlaceProductsPayload, key: string): Promise<void> {
    this.placed.push({ payload, key });
  }
}

const VIENNOISERIE: CatalogFamilyView = { id: 'fam_v', name: 'Viennoiserie', position: 1 };
const TRAITEUR: CatalogFamilyView = { id: 'fam_t', name: 'Traiteur salé', position: 2 };

function product(
  sku: string,
  family: CatalogFamilyView | null,
  over: Partial<WorkstationProductView> = {},
): WorkstationProductView {
  return {
    productSku: sku,
    productName: sku,
    family,
    workstationId: null,
    position: null,
    workstations: [],
    ordered: false,
    variants: [],
    ...over,
  };
}

const STATIONS: readonly WorkstationView[] = [
  { id: 'ws_p', name: 'Pâtisserie', position: 0, trackingLevel: null },
];

const PRODUCTS = [
  product('CRO', VIENNOISERIE, { workstationId: 'ws_p', ordered: true }),
  product('PAC', VIENNOISERIE),
  product('QUI', TRAITEUR, { ordered: true }),
  product('TAR', TRAITEUR, {
    productName: null,
    variants: [{ sku: 'TAR-6', variantName: 'Tarte 6 parts', sellable: false }],
  }),
];

let api: FakeWorkstations;

async function mount(
  unplacedFirst = false,
  station: string | null = null,
): Promise<{ fixture: ComponentFixture<WorkstationProductsCard>; card: WorkstationProductsCard }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WorkstationProductsCard],
    providers: [{ provide: WorkstationsService, useValue: api }],
  });
  const fixture = TestBed.createComponent(WorkstationProductsCard);
  fixture.componentRef.setInput('products', PRODUCTS);
  fixture.componentRef.setInput('offCatalog', [{ sku: 'OLD-1', productName: 'Ancien' }]);
  fixture.componentRef.setInput('workstations', STATIONS);
  fixture.componentRef.setInput('unplacedCount', 3);
  fixture.componentRef.setInput('canWrite', true);
  fixture.componentRef.setInput('unplacedFirst', unplacedFirst);
  fixture.componentRef.setInput('station', station);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, card: fixture.componentInstance };
}

const skus = (card: WorkstationProductsCard): string[] =>
  card['visibleProducts']().map((entry) => entry.productSku);

describe('les produits et leur poste', () => {
  beforeEach(() => {
    api = new FakeWorkstations();
  });

  it('ouvre filtré « à ranger » quand l’adresse le demande, avec le compte servi', async () => {
    const { card } = await mount(true);

    expect(skus(card)).toEqual(['PAC', 'QUI', 'TAR']);
    expect(card['unplacedLabel']()).toBe('À ranger (3)');
  });

  it('ouvert sur un poste, ne montre que ses produits — même arrivé pour ranger — et le filtre s’efface', async () => {
    const { card } = await mount(true, 'ws_p');

    expect(skus(card)).toEqual(['CRO']);
    expect(card['onlyUnplaced']()).toBe(false);
    card['stationFilter'].set(null);
    expect(skus(card)).toEqual(['CRO', 'PAC', 'QUI', 'TAR']);
  });

  it('filtre par rayon racine et par « commandé ces jours-ci »', async () => {
    const { card } = await mount();

    card['shelf'].set('fam_t');
    expect(skus(card)).toEqual(['QUI', 'TAR']);
    card['onlyOrdered'].set(true);
    expect(skus(card)).toEqual(['QUI']);
  });

  it('cherche aussi dans les déclinaisons, et nomme un produit sans nom par sa déclinaison', async () => {
    const { card } = await mount();

    card['query'].set('6 parts');
    expect(skus(card)).toEqual(['TAR']);
    const [tarte] = card['visibleProducts']();
    if (tarte === undefined) throw new Error('fixture');
    expect(card['nameOf'](tarte)).toBe('Tarte 6 parts');
  });

  it('place un produit à un poste, ou le remet « à ranger », avec une clé d’intention', async () => {
    const { card } = await mount();
    const [croissant, pac] = PRODUCTS;
    if (croissant === undefined || pac === undefined) throw new Error('fixture');

    await card['place'](pac, 'ws_p');
    await card['place'](croissant, UNPLACED);

    expect(api.placed).toEqual([
      { payload: { productSkus: ['PAC'], workstationId: 'ws_p' }, key: expect.any(String) },
      { payload: { productSkus: ['CRO'], workstationId: null }, key: expect.any(String) },
    ]);
  });

  it('ne renvoie rien quand le poste choisi est déjà le sien', async () => {
    const { card } = await mount();
    const [croissant] = PRODUCTS;
    if (croissant === undefined) throw new Error('fixture');

    await card['place'](croissant, 'ws_p');

    expect(api.placed).toEqual([]);
  });

  it('« tout ce rayon → ce poste » place tout le rayon, quels que soient les autres filtres', async () => {
    const { card } = await mount();

    card['shelf'].set('fam_t');
    card['onlyOrdered'].set(true);
    card['bulkTarget'].set('ws_p');
    await card['placeShelf']();

    expect(api.placed[0]?.payload).toEqual({ productSkus: ['QUI', 'TAR'], workstationId: 'ws_p' });
  });

  it('dit les SKU commandés qui ne sont plus au catalogue', async () => {
    const { fixture } = await mount();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-off-catalog]')?.textContent,
    ).toContain('Ancien (OLD-1)');
  });
});
