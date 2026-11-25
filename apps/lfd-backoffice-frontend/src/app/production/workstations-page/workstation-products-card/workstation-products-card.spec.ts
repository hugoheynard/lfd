import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  CatalogFamilyView,
  PlaceProductsPayload,
  WorkstationProductView,
  WorkstationView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { FoldPanelHostService } from 'fold-ng';

import { WorkstationsService } from '../../workstations.service';
import type { ProductStationsDialogData } from '../product-stations-dialog/product-stations-dialog';
import { WorkstationProductsCard } from './workstation-products-card';

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

/** Le dialogue doublé : il rend ce qu'on lui a fait répondre, et garde ce qu'on lui a ouvert. */
class FakePanels {
  answer: boolean | undefined = true;
  readonly asked: { data: ProductStationsDialogData; side: string }[] = [];
  open(
    _component: unknown,
    config: { data: ProductStationsDialogData; side: string },
  ): { closed: Promise<boolean | undefined> } {
    this.asked.push(config);
    return { closed: Promise.resolve(this.answer) };
  }
}

const STATIONS: readonly WorkstationView[] = [
  { id: 'ws_p', name: 'Pâtisserie', position: 0, trackingLevel: null },
  { id: 'ws_b', name: 'Boulangerie', position: 1, trackingLevel: null },
];

const PRODUCTS = [
  product('CRO', VIENNOISERIE, {
    workstationId: 'ws_p',
    workstations: [{ workstationId: 'ws_p', finishes: true, position: null }],
    ordered: true,
  }),
  product('PAC', VIENNOISERIE),
  product('QUI', TRAITEUR, { ordered: true }),
  product('SAN', TRAITEUR, {
    workstationId: 'ws_p',
    workstations: [
      { workstationId: 'ws_p', finishes: true, position: 0 },
      { workstationId: 'ws_b', finishes: false, position: 2 },
    ],
  }),
  product('TAR', TRAITEUR, {
    productName: null,
    variants: [{ sku: 'TAR-6', variantName: 'Tarte 6 parts', sellable: false }],
  }),
];

let api: FakeWorkstations;
let panels: FakePanels;

async function mount(
  unplacedFirst = false,
  station: string | null = null,
): Promise<{ fixture: ComponentFixture<WorkstationProductsCard>; card: WorkstationProductsCard }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WorkstationProductsCard],
    providers: [
      { provide: WorkstationsService, useValue: api },
      { provide: FoldPanelHostService, useValue: panels },
    ],
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
    panels = new FakePanels();
  });

  it('ouvre filtré « à ranger » quand l’adresse le demande, avec le compte servi', async () => {
    const { card } = await mount(true);

    expect(skus(card)).toEqual(['PAC', 'QUI', 'TAR']);
    expect(card['unplacedLabel']()).toBe('À ranger (3)');
  });

  it('ouvert sur un poste, ne montre que ses produits — même arrivé pour ranger — et le filtre s’efface', async () => {
    const { card } = await mount(true, 'ws_p');

    expect(skus(card)).toEqual(['CRO', 'SAN']);
    expect(card['onlyUnplaced']()).toBe(false);
    card['stationFilter'].set('ws_b');
    expect(skus(card)).toEqual(['SAN']);
    card['stationFilter'].set(null);
    expect(skus(card)).toEqual(['CRO', 'PAC', 'QUI', 'SAN', 'TAR']);
  });

  it('filtre par rayon racine et par « commandé ces jours-ci »', async () => {
    const { card } = await mount();

    card['shelf'].set('fam_t');
    expect(skus(card)).toEqual(['QUI', 'SAN', 'TAR']);
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

  it('montre les postes en puces, celui qui finit marqué « finit » quand il y en a plusieurs', async () => {
    const { fixture } = await mount();
    const host = fixture.nativeElement as HTMLElement;

    const sandwich = [...host.querySelectorAll('[data-stations="SAN"] [data-station-chip]')];
    expect(sandwich.map((chip) => chip.textContent?.trim())).toEqual([
      'Pâtisserie · finit',
      'Boulangerie',
    ]);
    expect(sandwich.map((chip) => chip.hasAttribute('data-finishes'))).toEqual([true, false]);
    expect(host.querySelector('[data-stations="CRO"]')?.textContent).toContain('Pâtisserie');
    expect(host.querySelector('[data-stations="CRO"]')?.textContent).not.toContain('finit');
    expect(host.querySelector('[data-stations="PAC"]')?.textContent).toContain('À ranger');
  });

  it('ouvre le dialogue des postes du produit, et relit s’il a changé la carte', async () => {
    const { fixture, card } = await mount();
    let reloads = 0;
    card.changed.subscribe(() => (reloads += 1));

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-edit-stations="SAN"]')
      ?.click();
    await fixture.whenStable();

    expect(panels.asked[0]?.data).toMatchObject({
      productSku: 'SAN',
      stations: [
        { workstationId: 'ws_p', finishes: true },
        { workstationId: 'ws_b', finishes: false },
      ],
      workstations: STATIONS,
    });
    expect(reloads).toBe(1);
  });

  it('ne relit pas quand le dialogue est fermé sans rien changer', async () => {
    const { card } = await mount();
    panels.answer = undefined;
    let reloads = 0;
    card.changed.subscribe(() => (reloads += 1));
    const [croissant] = PRODUCTS;
    if (croissant === undefined) throw new Error('fixture');

    await card['editStations'](croissant);

    expect(reloads).toBe(0);
  });

  it('« tout ce rayon → ce poste » place tout le rayon, quels que soient les autres filtres', async () => {
    const { card } = await mount();

    card['shelf'].set('fam_t');
    card['onlyOrdered'].set(true);
    card['bulkTarget'].set('ws_p');
    await card['placeShelf']();

    expect(api.placed[0]?.payload).toEqual({
      productSkus: ['QUI', 'SAN', 'TAR'],
      workstationId: 'ws_p',
    });
  });

  it('dit les SKU commandés qui ne sont plus au catalogue', async () => {
    const { fixture } = await mount();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-off-catalog]')?.textContent,
    ).toContain('Ancien (OLD-1)');
  });
});
