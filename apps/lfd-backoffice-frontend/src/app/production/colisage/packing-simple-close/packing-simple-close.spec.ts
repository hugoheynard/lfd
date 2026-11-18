import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  PackingFoundBody,
  PackingLine,
  PackingProblemBody,
  PackingSheet,
} from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { PackingService } from '../../packing.service';
import type { PackingPiecesDialogData } from '../packing-pieces-dialog/packing-pieces-dialog';
import { PackingDayReader } from '../packing-day.reader';
import { PackingSimpleGestures } from '../packing-simple-gestures';
import { PackingSimpleClose } from './packing-simple-close';

/**
 * Le colisage simple d'un retrait : « Tout est prêt » grisé tant que le four
 * n'a pas tout sorti, « Problème » qui envoie ce qui est vraiment là, « Pièces
 * retrouvées » sous le manque pour qui a le droit — chaque geste avec sa clé
 * d'intention, gardée après un refus, puis la relecture du poste.
 */

function line(over: Partial<PackingLine> = {}): PackingLine {
  return {
    sku: 'CRO',
    productName: 'Croissant',
    quantity: 12,
    saleUnit: 'piece',
    packed: false,
    initials: null,
    packedAt: null,
    awaitingProduction: false,
    ...over,
  };
}

function sheet(over: Partial<PackingSheet> = {}): PackingSheet {
  return {
    reference: 'CMD-001',
    orderId: 'o-1',
    containers: 0,
    customerLabel: 'Café du Port',
    clientele: 'pro',
    fulfillmentMethod: 'pickup',
    trackingLevel: 'simple',
    allReadyAvailable: true,
    destination: 'Laboratoire',
    lines: [line(), line({ sku: 'BAG', productName: 'Baguette', quantity: 8 })],
    lineCount: 2,
    packedLines: 0,
    remainingLines: 2,
    pieces: 20,
    packedPieces: 0,
    canReportShortfall: false,
    shortfallReportedAt: null,
    deliveryNoteReprintNeeded: false,
    canDeclareReady: false,
    coldOutsideIsotherm: [],
    packedAt: null,
    packedBy: null,
    packedByName: null,
    containerMode: 'listed',
    containerList: [],
    ...over,
  };
}

class FakeApi {
  readonly allReadyKeys: string[] = [];
  readonly problems: PackingProblemBody[] = [];
  readonly found: PackingFoundBody[] = [];
  refuse: string | null = null;

  private answer(): Promise<void> {
    if (this.refuse === null) {
      return Promise.resolve();
    }
    return Promise.reject(new HttpErrorResponse({ status: 409, error: { message: this.refuse } }));
  }

  allReady(_date: string, _orderId: string, key: string): Promise<void> {
    this.allReadyKeys.push(key);
    return this.answer();
  }

  reportProblem(_date: string, _orderId: string, body: PackingProblemBody): Promise<void> {
    this.problems.push(body);
    return this.answer();
  }

  recoverFound(_date: string, _orderId: string, body: PackingFoundBody): Promise<void> {
    this.found.push(body);
    return this.answer();
  }
}

class FakePanels {
  readonly opened: PackingPiecesDialogData[] = [];
  open(_component: unknown, options: { data: PackingPiecesDialogData }): { closed: Promise<void> } {
    this.opened.push(options.data);
    return { closed: new Promise<void>(() => undefined) };
  }
}

let api: FakeApi;
let panels: FakePanels;
let rereads: number;

function render(
  input: PackingSheet,
  canRecover = false,
): { fixture: ComponentFixture<PackingSimpleClose>; host: HTMLElement; packed: PackingSheet[] } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      PackingSimpleGestures,
      { provide: PackingService, useValue: api },
      {
        provide: PackingDayReader,
        useValue: {
          date: () => '2026-11-18',
          rereadAfterWrite: () => {
            rereads += 1;
            return Promise.resolve(true);
          },
        },
      },
      { provide: FoldPanelHostService, useValue: panels },
    ],
  });
  const fixture = TestBed.createComponent(PackingSimpleClose);
  fixture.componentRef.setInput('sheet', input);
  fixture.componentRef.setInput('canRecover', canRecover);
  const packed: PackingSheet[] = [];
  fixture.componentInstance.packed.subscribe((done) => packed.push(done));
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, packed };
}

async function settle(fixture: ComponentFixture<PackingSimpleClose>): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }
}

describe('le colisage simple d’une commande', () => {
  beforeEach(() => {
    api = new FakeApi();
    panels = new FakePanels();
    rereads = 0;
  });

  it('« Tout est prêt » grisé tant que le four n’a pas tout sorti, et le dit', () => {
    const { host } = render(sheet({ allReadyAvailable: false }));
    expect(host.querySelector<HTMLButtonElement>('[data-all-ready]')?.disabled).toBe(true);
    expect(host.querySelector('[data-awaiting-oven]')?.textContent).toContain('En attente du four');
  });

  it('« Tout est prêt » accepté : relit le poste et annonce la commande', async () => {
    const { fixture, host, packed } = render(sheet());
    host.querySelector<HTMLButtonElement>('[data-all-ready]')?.click();
    await settle(fixture);
    expect(api.allReadyKeys).toHaveLength(1);
    expect(rereads).toBe(1);
    expect(packed.map((done) => done.orderId)).toEqual(['o-1']);
  });

  it('un refus de « Tout est prêt » se lit avec ses mots, et le réessai garde la même clé', async () => {
    api.refuse = 'Il manque encore 2 Baguettes.';
    const { fixture, host, packed } = render(sheet());
    host.querySelector<HTMLButtonElement>('[data-all-ready]')?.click();
    await settle(fixture);
    expect(host.querySelector('[data-all-ready-refusal]')?.textContent).toContain(
      'Il manque encore 2 Baguettes.',
    );
    expect(packed).toEqual([]);
    expect(rereads).toBe(0);

    api.refuse = null;
    host.querySelector<HTMLButtonElement>('[data-all-ready]')?.click();
    await settle(fixture);
    expect(api.allReadyKeys[1]).toBe(api.allReadyKeys[0]);
  });

  it('une commande prête dit « Prête » et garde « Problème »', () => {
    const { host } = render(sheet({ packedAt: '2026-11-18T07:00:00.000Z' }));
    expect(host.querySelector('[data-simple-ready]')?.textContent).toContain('Prête');
    expect(host.querySelector('[data-all-ready]')).toBeNull();
    expect(host.querySelector('[data-problem]')).not.toBeNull();
  });

  it('« Problème » propose chaque ligne à sa quantité commandée et envoie ce qui est là', async () => {
    const { host } = render(sheet());
    host.querySelector<HTMLButtonElement>('[data-problem]')?.click();
    const data = panels.opened[0];
    expect(data?.confirmLabel).toBe('Prévenir le superviseur');
    expect(data?.lines.map((l) => [l.sku, l.initial, l.max])).toEqual([
      ['CRO', 12, 12],
      ['BAG', 8, 8],
    ]);
    const accepted = await data?.submit(
      new Map([
        ['CRO', 12],
        ['BAG', 5],
      ]),
    );
    expect(accepted).toBe(true);
    expect(api.problems).toEqual([
      {
        lines: [
          { sku: 'CRO', present: 12 },
          { sku: 'BAG', present: 5 },
        ],
      },
    ]);
    expect(rereads).toBe(1);
  });

  it('un manque en attente de décision le dit', () => {
    const { host } = render(
      sheet({ allReadyAvailable: false, shortfallReportedAt: '2026-11-18T07:00:00.000Z' }),
    );
    expect(host.querySelector('[data-awaiting-decision]')).not.toBeNull();
  });

  it('« Pièces retrouvées » : seulement sur un manque, et pour qui a le droit d’écriture', () => {
    const short = sheet({ shortfallReportedAt: '2026-11-18T07:00:00.000Z' });
    expect(render(short, false).host.querySelector('[data-found]')).toBeNull();
    expect(render(sheet(), true).host.querySelector('[data-found]')).toBeNull();
    expect(render(short, true).host.querySelector('[data-found]')).not.toBeNull();
  });

  it('« Pièces retrouvées » n’envoie que les produits retrouvés', async () => {
    const { host } = render(sheet({ shortfallReportedAt: '2026-11-18T07:00:00.000Z' }), true);
    host.querySelector<HTMLButtonElement>('[data-found]')?.click();
    const data = panels.opened[0];
    expect(data?.needsOne).toBe(true);
    expect(data?.lines.every((l) => l.initial === 0)).toBe(true);
    await data?.submit(
      new Map([
        ['CRO', 0],
        ['BAG', 3],
      ]),
    );
    expect(api.found).toEqual([{ lines: [{ sku: 'BAG', quantity: 3 }] }]);
  });

  it('un refus de « Problème » reste dans le dialogue, pas sous les boutons', async () => {
    api.refuse = 'La commande est déjà retirée par le client.';
    const { fixture, host } = render(sheet());
    host.querySelector<HTMLButtonElement>('[data-problem]')?.click();
    const data = panels.opened[0];
    const accepted = await data?.submit(
      new Map([
        ['CRO', 0],
        ['BAG', 0],
      ]),
    );
    fixture.detectChanges();
    expect(accepted).toBe(false);
    expect(data?.refusal()).toBe('La commande est déjà retirée par le client.');
    expect(host.querySelector('[data-all-ready-refusal]')).toBeNull();
  });
});
