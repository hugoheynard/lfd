import { TestBed } from '@angular/core/testing';
import type {
  PlaceProductsPayload,
  WorkstationProductStationView,
  WorkstationView,
} from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorkstationsService } from '../../workstations.service';
import {
  ProductStationsDialog,
  stationGestures,
  type ProductStationsDialogData,
} from './product-stations-dialog';

/** Ce que la carte a reçu, dans l'ordre, sans les clés. */
class FakeWorkstations {
  readonly calls: string[] = [];
  readonly keys: string[] = [];
  refuse: string | null = null;

  private record(call: string, key: string): Promise<void> {
    this.keys.push(key);
    if (this.refuse === call) {
      return Promise.reject(new Error('refusé'));
    }
    this.calls.push(call);
    return Promise.resolve();
  }
  addToProducts(id: string, skus: readonly string[], key: string): Promise<void> {
    return this.record(`add ${id} ${skus.join(',')}`, key);
  }
  removeFromProducts(id: string, skus: readonly string[], key: string): Promise<void> {
    return this.record(`remove ${id} ${skus.join(',')}`, key);
  }
  setFinishing(id: string, sku: string, key: string): Promise<void> {
    return this.record(`finish ${id} ${sku}`, key);
  }
  place(payload: PlaceProductsPayload, key: string): Promise<void> {
    return this.record(
      `place ${payload.workstationId ?? 'null'} ${payload.productSkus.join(',')}`,
      key,
    );
  }
}

class FakeRef {
  closedWith: unknown = 'open';
  close(value?: unknown): void {
    this.closedWith = value;
  }
}

const STATIONS: readonly WorkstationView[] = [
  { id: 'ws_p', name: 'Pâtisserie', position: 0, trackingLevel: null },
  { id: 'ws_b', name: 'Boulangerie', position: 1, trackingLevel: null },
  { id: 'ws_t', name: 'Traiteur', position: 2, trackingLevel: null },
];

const on = (workstationId: string, finishes: boolean): WorkstationProductStationView => ({
  workstationId,
  finishes,
  position: null,
});

/** Les gestes, joués contre le double, dans l'ordre. */
async function played(
  before: readonly WorkstationProductStationView[],
  chosen: readonly string[],
  finisher: string | null,
): Promise<string[]> {
  const api = new FakeWorkstations();
  for (const gesture of stationGestures('SAN', before, chosen, finisher)) {
    await gesture.send(api, 'k');
  }
  return api.calls;
}

describe('les gestes qui mènent aux postes choisis', () => {
  it('ne fait rien quand rien ne change', async () => {
    expect(await played([on('ws_p', true), on('ws_b', false)], ['ws_p', 'ws_b'], 'ws_p')).toEqual(
      [],
    );
  });

  it('un produit à ranger : le poste qui finit est ajouté le premier', async () => {
    expect(await played([], ['ws_p', 'ws_b'], 'ws_b')).toEqual(['add ws_b SAN', 'add ws_p SAN']);
  });

  it('ajoute une étape à un produit placé', async () => {
    expect(await played([on('ws_p', true)], ['ws_p', 'ws_b'], 'ws_p')).toEqual(['add ws_b SAN']);
  });

  it('change le poste qui finit avant de retirer l’ancien', async () => {
    expect(await played([on('ws_p', true), on('ws_b', false)], ['ws_b'], 'ws_b')).toEqual([
      'finish ws_b SAN',
      'remove ws_p SAN',
    ]);
  });

  it('ajoute le nouveau poste qui finit, le désigne, puis retire l’ancien', async () => {
    expect(await played([on('ws_p', true)], ['ws_t'], 'ws_t')).toEqual([
      'add ws_t SAN',
      'finish ws_t SAN',
      'remove ws_p SAN',
    ]);
  });

  it('aucun poste choisi : le produit retourne « à ranger » d’un geste', async () => {
    expect(await played([on('ws_p', true), on('ws_b', false)], [], null)).toEqual([
      'place null SAN',
    ]);
  });
});

describe('le dialogue des postes', () => {
  let api: FakeWorkstations;
  let ref: FakeRef;

  beforeEach(() => {
    api = new FakeWorkstations();
    ref = new FakeRef();
  });

  function mount(stations: readonly WorkstationProductStationView[]): ProductStationsDialog {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProductStationsDialog],
      providers: [
        { provide: WorkstationsService, useValue: api },
        { provide: FoldPanelRef, useValue: ref },
      ],
    });
    const fixture = TestBed.createComponent(ProductStationsDialog);
    const data: ProductStationsDialogData = {
      productSku: 'SAN',
      productName: 'Sandwich',
      stations,
      workstations: STATIONS,
    };
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('le poste qui finit se choisit parmi les cochés, et revient au premier coché si on décoche le sien', () => {
    const dialog = mount([on('ws_p', true), on('ws_b', false)]);

    expect(dialog['finisherOptions']().map((option) => option.value)).toEqual(['ws_p', 'ws_b']);
    dialog['toggle']('ws_p', false);
    expect(dialog['finishing']()).toBe('ws_b');
  });

  it('enregistre chaque geste sous sa clé d’intention, puis ferme sur un succès', async () => {
    const dialog = mount([on('ws_p', true)]);

    dialog['toggle']('ws_b', true);
    dialog['finisher'].set('ws_b');
    await dialog['submit']();

    expect(api.calls).toEqual(['add ws_b SAN', 'finish ws_b SAN']);
    expect(new Set(api.keys).size).toBe(2);
    expect(ref.closedWith).toBe(true);
  });

  it('un refus reste dans le dialogue ; fermer ensuite dit que la carte a changé', async () => {
    const dialog = mount([on('ws_p', true)]);
    api.refuse = 'finish ws_b SAN';

    dialog['toggle']('ws_b', true);
    dialog['finisher'].set('ws_b');
    await dialog['submit']();

    expect(ref.closedWith).toBe('open');
    expect(dialog['failure']()).not.toBeNull();
    dialog['cancel']();
    expect(ref.closedWith).toBe(true);
  });
});
