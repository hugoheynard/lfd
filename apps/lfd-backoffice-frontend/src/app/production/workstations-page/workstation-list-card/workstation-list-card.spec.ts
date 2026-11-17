import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  CatalogFamilyView,
  PlaceProductsPayload,
  WorkstationProductView,
  WorkstationView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorkstationsService } from '../../workstations.service';
import { WorkstationListCard } from './workstation-list-card';

/** Le service des postes doublé : il retient chaque geste et sa clé d'intention. */
class FakeWorkstations {
  readonly calls: { gesture: string; detail: unknown; key: string }[] = [];
  refuseNext: HttpErrorResponse | null = null;
  private next = 0;

  private record(gesture: string, detail: unknown, key: string): void {
    const refusal = this.refuseNext;
    this.refuseNext = null;
    this.calls.push({ gesture, detail, key });
    if (refusal !== null) {
      throw refusal;
    }
  }

  async declare(name: string, key: string): Promise<string> {
    this.record('declare', name, key);
    this.next += 1;
    return `ws_new_${String(this.next)}`;
  }
  async rename(id: string, name: string, key: string): Promise<void> {
    this.record('rename', { id, name }, key);
  }
  async reorder(ids: readonly string[], key: string): Promise<void> {
    this.record('reorder', ids, key);
  }
  async archive(id: string, key: string): Promise<void> {
    this.record('archive', id, key);
  }
  async place(payload: PlaceProductsPayload, key: string): Promise<void> {
    this.record('place', payload, key);
  }
}

const VIENNOISERIE: CatalogFamilyView = { id: 'fam_v', name: 'Viennoiserie', position: 1 };
const TRAITEUR: CatalogFamilyView = { id: 'fam_t', name: 'Traiteur salé', position: 2 };
const FINE: CatalogFamilyView = {
  id: 'fam_vf',
  name: 'Viennoiserie fine',
  position: 3,
  root: { id: 'fam_v', name: 'Viennoiserie', position: 1 },
};

function product(
  sku: string,
  family: CatalogFamilyView | null,
  workstationId: string | null = null,
): WorkstationProductView {
  return {
    productSku: sku,
    productName: sku,
    family,
    workstationId,
    ordered: false,
    variants: [],
  };
}

const STATIONS: readonly WorkstationView[] = [
  { id: 'ws_a', name: 'Boulangerie', position: 0, trackingLevel: null },
  { id: 'ws_b', name: 'Pâtisserie', position: 1, trackingLevel: null },
];

let api: FakeWorkstations;

async function mount(
  workstations: readonly WorkstationView[],
  products: readonly WorkstationProductView[],
  canWrite = true,
): Promise<{ fixture: ComponentFixture<WorkstationListCard>; changes: number[] }> {
  TestBed.configureTestingModule({
    imports: [WorkstationListCard],
    providers: [{ provide: WorkstationsService, useValue: api }],
  });
  const fixture = TestBed.createComponent(WorkstationListCard);
  fixture.componentRef.setInput('workstations', workstations);
  fixture.componentRef.setInput('products', products);
  fixture.componentRef.setInput('canWrite', canWrite);
  const changes: number[] = [];
  fixture.componentInstance.changed.subscribe(() => changes.push(1));
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, changes };
}

describe('les postes du fournil', () => {
  beforeEach(() => {
    api = new FakeWorkstations();
    TestBed.resetTestingModule();
  });

  it('ajoute un poste nommé, avec une clé d’intention, puis fait relire', async () => {
    const { fixture, changes } = await mount(STATIONS, []);
    const card = fixture.componentInstance;

    card['newName'].set('  Tourier ');
    await card['declare']();

    expect(api.calls).toEqual([{ gesture: 'declare', detail: 'Tourier', key: expect.any(String) }]);
    expect(card['newName']()).toBe('');
    expect(changes).toHaveLength(1);
  });

  it('un renommage refusé se dit avec les mots du serveur, et un nouvel essai garde sa clé', async () => {
    const { fixture } = await mount(STATIONS, []);
    const card = fixture.componentInstance;
    const [boulangerie] = STATIONS;
    if (boulangerie === undefined) throw new Error('fixture');

    card['setDraft']('ws_a', 'Pain');
    api.refuseNext = new HttpErrorResponse({
      status: 503,
      error: { message: 'Serveur occupé.' },
    });
    await card['rename'](boulangerie);
    expect(card['refusal']()).toBe('Serveur occupé.');

    await card['rename'](boulangerie);
    const [first, second] = api.calls;
    expect(second?.detail).toEqual({ id: 'ws_a', name: 'Pain' });
    expect(second?.key).toBe(first?.key);
  });

  it('monte un poste : l’ordre envoyé est l’ordre complet, échangé', async () => {
    const { fixture } = await mount(STATIONS, []);

    await fixture.componentInstance['move'](1, -1);

    expect(api.calls[0]).toMatchObject({ gesture: 'reorder', detail: ['ws_b', 'ws_a'] });
  });

  it('ne monte pas le premier', async () => {
    const { fixture } = await mount(STATIONS, []);

    await fixture.componentInstance['move'](0, -1);

    expect(api.calls).toEqual([]);
  });

  it('« Partir des rayons » : un poste par rayon racine, puis ses produits sans poste', async () => {
    const products = [
      product('CRO', VIENNOISERIE),
      product('PAC', FINE),
      product('BRI', VIENNOISERIE, 'ws_b'),
      product('QUI', TRAITEUR),
      product('OLD', null),
    ];
    const { fixture } = await mount([], products);

    await fixture.componentInstance['fromShelves']();

    expect(api.calls.map(({ gesture, detail }) => ({ gesture, detail }))).toEqual([
      { gesture: 'declare', detail: 'Viennoiserie' },
      { gesture: 'place', detail: { productSkus: ['CRO', 'PAC'], workstationId: 'ws_new_1' } },
      { gesture: 'declare', detail: 'Traiteur salé' },
      { gesture: 'place', detail: { productSkus: ['QUI'], workstationId: 'ws_new_2' } },
    ]);
  });

  it('« Partir des rayons » reprend un poste qui porte déjà le nom du rayon', async () => {
    const { fixture } = await mount(
      [{ id: 'ws_v', name: 'Viennoiserie', position: 0, trackingLevel: null }],
      [product('CRO', VIENNOISERIE)],
    );

    await fixture.componentInstance['fromShelves']();

    expect(api.calls.map(({ gesture, detail }) => ({ gesture, detail }))).toEqual([
      { gesture: 'place', detail: { productSkus: ['CRO'], workstationId: 'ws_v' } },
    ]);
  });

  it('sans le droit d’écrire, ne propose aucun geste', async () => {
    const { fixture } = await mount(STATIONS, [product('CRO', VIENNOISERIE)], false);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-from-shelves]')).toBeNull();
    expect(el.querySelector('[data-declare]')).toBeNull();
    expect(el.textContent).toContain('Pâtisserie');
  });
});
