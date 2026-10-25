import { TestBed } from '@angular/core/testing';
import type { SendReserveToShopPayload } from '@lfd/contracts';
import { By } from '@angular/platform-browser';
import { FoldListboxComponent, FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { NotifyService } from '../../notify.service';
import { ReserveShopService } from '../reserve-shop.service';
import { initialRows, linesToSend, overFree } from './reserve-shop-draft';
import { ReserveShopPanel, type ReserveShopPanelData } from './reserve-shop-panel';

/** Plan A1, lot A1.4. Le jour est recopié, jamais comparé à l'horloge. */
const DATA: ReserveShopPanelData = {
  serviceDay: '2030-03-12',
  reference: 'CMD-9',
  released: [
    { sku: 'CRO', productName: 'Croissant', quantity: 3, free: 5 },
    { sku: 'BAG', productName: 'Baguette', quantity: 4, free: 2 },
  ],
};

async function mount(refusal: unknown = null) {
  const sent: { day: string; payload: SendReserveToShopPayload }[] = [];
  const closed: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ReserveShopService,
        useValue: {
          send: (day: string, payload: SendReserveToShopPayload) => {
            sent.push({ day, payload });
            return refusal === null
              ? Promise.resolve({ id: payload.key })
              : Promise.reject(refusal);
          },
        },
      },
      {
        provide: PickupAddressesService,
        useValue: { list: () => Promise.resolve([{ id: 'site_1', label: 'Village' }]) },
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
      { provide: FoldPanelRef, useValue: { close: (result?: unknown) => closed.push(result) } },
    ],
  });
  const fixture = TestBed.createComponent(ReserveShopPanel);
  fixture.componentRef.setInput('data', DATA);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  return { fixture, element, sent, closed };
}

describe('reserve-shop-draft', () => {
  it('pré-remplit avec ce qui a été rendu, borné au libre', () => {
    expect(initialRows(DATA.released).map((row) => row.chosen)).toEqual([3, 2]);
  });

  it('n’envoie que les quantités positives, et voit un dépassement du libre', () => {
    const rows = initialRows(DATA.released).map((row) =>
      row.sku === 'BAG' ? { ...row, chosen: 0 } : row,
    );
    expect(linesToSend(rows)).toEqual([{ sku: 'CRO', quantity: 3 }]);
    expect(overFree(rows)).toBe(false);
    expect(overFree([{ ...rows[0]!, chosen: 6 }])).toBe(true);
  });
});

describe('ReserveShopPanel', () => {
  it('n’envoie rien tant qu’aucune boutique n’est choisie', async () => {
    const { element } = await mount();

    expect(element.querySelector<HTMLButtonElement>('[data-reserve-send]')?.disabled).toBe(true);
    expect(element.querySelector('[data-reserve-transport]')?.textContent).toContain(
      'prochain passage vers la boutique',
    );
  });

  it('envoie la boutique, la clé de l’ouverture et les lignes, puis se ferme', async () => {
    const { fixture, element, sent, closed } = await mount();
    const listbox: FoldListboxComponent<string> = fixture.debugElement.query(
      By.directive(FoldListboxComponent),
    ).componentInstance;
    listbox.value.set('site_1');
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('[data-reserve-send]')?.click();
    await fixture.whenStable();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      day: '2030-03-12',
      payload: {
        siteId: 'site_1',
        lines: [
          { sku: 'CRO', quantity: 3 },
          { sku: 'BAG', quantity: 2 },
        ],
      },
    });
    expect(sent[0]?.payload.key).toMatch(/^[0-9A-Z]{26}$/u);
    expect(closed).toEqual([true]);
  });
});
