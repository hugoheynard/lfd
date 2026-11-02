import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { localToInstant } from '@lfd/contracts';
import type { DayInternalTransfersView, DayInternalTransferView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../../commandes/orders.service';
import { NotifyService } from '../../notify.service';
import { TransferManifestDialog } from '../../livraison/transfer-manifest-dialog/transfer-manifest-dialog';
import type { HandoverBoard, SlotRow } from '../handover-slots';
import { HandoverColumn } from './handover-column';

/**
 * Le transfert interne dans l'onglet Livraison (Hugo, 2026-11-01) : une ligne
 * à son départ requis, au gabarit d'une livraison, et le manifeste.
 */

// Un jour comparé seulement aux instants de la fixture, jamais à l'horloge.
const DAY = '2030-03-12';
const at = (time: string): string => localToInstant(DAY, time)?.toISOString() ?? '';

function delivery(reference: string): SlotRow {
  return {
    orderId: `o-${reference}`,
    reference,
    customerLabel: reference,
    state: 'ready',
    time: 'avant 7 h 30',
    totalUnits: 1,
    pickupLabel: null,
    clientele: null,
    siteId: null,
    handedOverAt: null,
    readyAt: null,
    overdueMinutes: null,
    overdueCause: null,
    shelf: false,
    method: 'delivery',
    heldForQuality: false,
    roundLine: null,
    departedAt: null,
    loaded: false,
  };
}

const BOARD: HandoverBoard = {
  pickup: [],
  delivery: [
    {
      key: 'd07:30',
      kind: 'deadline',
      label: 'Avant 7 h 30',
      expected: 1,
      handedOver: 0,
      endMinutes: 450,
      rows: [delivery('LIV-1')],
    },
  ],
  pickupExpected: 0,
  deliveryExpected: 1,
  overdue: 0,
  awaitingPacking: 0,
  overdueKitchen: 0,
  held: 0,
};

const VILLAGE: DayInternalTransferView = {
  transferId: 'tr_vv',
  siteId: 'vv',
  siteLabel: 'Le Village',
  departedAt: null,
  plannedDepartureAt: at('06:45'),
  placed: true,
  orderCount: 3,
  resupplyCount: 0,
  binCount: 4,
};

class FakePanels {
  readonly opened: { component: unknown; data: unknown }[] = [];
  open(component: unknown, options: { data: unknown }): void {
    this.opened.push({ component, data: options.data });
  }
}

async function mount(transfers: readonly DayInternalTransferView[] | null) {
  const panels = new FakePanels();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AdminOrdersService, useValue: {} },
      { provide: NotifyService, useValue: {} },
      { provide: PermissionsStore, useValue: { can: (): boolean => false } },
      { provide: FoldPanelHostService, useValue: panels },
    ],
  });
  const fixture = TestBed.createComponent(HandoverColumn);
  const view: DayInternalTransfersView | null = transfers === null ? null : { day: DAY, transfers };
  fixture.componentRef.setInput('board', BOARD);
  fixture.componentRef.setInput('transfers', view);
  fixture.componentRef.setInput('method', 'delivery');
  fixture.detectChanges();
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, panels, fixture };
}

function said(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

describe('HandoverColumn — le transfert dans la liste des livraisons', () => {
  it('une ligne à son départ requis, AVANT la livraison de 7 h 30, dans sa propre tranche', async () => {
    const { el } = await mount([VILLAGE]);
    const order = Array.from(
      el.querySelectorAll('[data-slot], [data-transfer-row], [data-reference]'),
    ).map(
      (node) =>
        node.getAttribute('data-slot') ??
        node.getAttribute('data-transfer-row') ??
        node.getAttribute('data-reference'),
    );
    expect(order).toEqual(['d06:45', 'tr_vv', 'd07:30', 'LIV-1']);

    const line = el.querySelector('[data-transfer-row="tr_vv"]');
    expect(said(line?.querySelector('.time'))).toBe('6 h 45');
    expect(said(line?.querySelector('.customer'))).toBe('Transfert → Le Village');
    expect(said(line?.querySelector('[data-transfer-contents]'))).toBe('3 commandes · 4 sacs');
    expect(said(line?.querySelector('[data-transfer-state]'))).toBe('En attente du départ');
    expect(said(el.querySelector('[data-slot="d06:45"] .slot-count'))).toBe('1 transfert');
  });

  it('un transfert à l’heure d’une livraison partage sa tranche, sans changer son compte', async () => {
    const { el } = await mount([{ ...VILLAGE, plannedDepartureAt: at('07:30') }]);
    expect(el.querySelectorAll('[data-slot]')).toHaveLength(1);
    expect(said(el.querySelector('[data-slot="d07:30"] .slot-count'))).toBe('1 attendue');
    expect(el.querySelector('[data-transfer-row="tr_vv"]')).not.toBeNull();
  });

  it('parti, il le dit', async () => {
    const { el } = await mount([{ ...VILLAGE, departedAt: at('06:52') }]);
    expect(said(el.querySelector('[data-transfer-state]'))).toBe('Parti à 6 h 52');
  });

  it('« Voir le manifeste » ouvre le dialogue de la livraison sur CE transfert', async () => {
    const { el, panels } = await mount([
      VILLAGE,
      { ...VILLAGE, transferId: 'tr_hh', siteId: 'hh', siteLabel: 'Le Haut' },
    ]);
    el.querySelector<HTMLElement>('[data-transfer-row="tr_hh"] [data-transfer-manifest]')?.click();
    expect(panels.opened).toEqual([
      { component: TransferManifestDialog, data: { transferId: 'tr_hh', siteLabel: 'Le Haut' } },
    ]);
  });

  it('sans transfert, aucune ligne ; et jamais dans l’onglet Retrait', async () => {
    const none = await mount(null);
    expect(none.el.querySelector('[data-transfer-row]')).toBeNull();
    expect(none.el.querySelectorAll('[data-slot]')).toHaveLength(1);

    TestBed.resetTestingModule();
    const { el, fixture } = await mount([VILLAGE]);
    fixture.componentRef.setInput('method', 'pickup');
    fixture.detectChanges();
    expect(el.querySelector('[data-transfer-row]')).toBeNull();
  });
});
