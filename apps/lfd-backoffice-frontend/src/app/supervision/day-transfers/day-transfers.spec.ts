import { TestBed } from '@angular/core/testing';
import type { DayInternalTransfersView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { DeliveryTransfersService } from '../../livraison/delivery-transfers.service';
import { TransferManifestDialog } from '../../livraison/transfer-manifest-dialog/transfer-manifest-dialog';
import { DayTransfers } from './day-transfers';

/** Les transferts du jour dans la colonne Colisage : une ligne chacun, et le manifeste. */

const DAY = '2030-03-12';

class FakeTransfers {
  readonly asked: string[] = [];
  constructor(private readonly answer: () => Promise<DayInternalTransfersView>) {}
  ofDay(day: string): Promise<DayInternalTransfersView> {
    this.asked.push(day);
    return this.answer();
  }
}

class FakePanels {
  readonly opened: { component: unknown; data: unknown }[] = [];
  open(component: unknown, options: { data: unknown }): void {
    this.opened.push({ component, data: options.data });
  }
}

const VIEW: DayInternalTransfersView = {
  day: DAY,
  transfers: [
    { transferId: 'tr_1', siteId: 'vv', siteLabel: 'Le Village', departedAt: null },
    { transferId: 'tr_2', siteId: 'hh', siteLabel: 'Le Haut', departedAt: '2030-03-12T05:00:00Z' },
  ],
};

async function render(api: FakeTransfers, panels = new FakePanels(), date: string | null = DAY) {
  TestBed.configureTestingModule({
    imports: [DayTransfers],
    providers: [
      { provide: DeliveryTransfersService, useValue: api },
      { provide: FoldPanelHostService, useValue: panels },
    ],
  });
  const fixture = TestBed.createComponent(DayTransfers);
  fixture.componentRef.setInput('date', date);
  await fixture.whenStable();
  fixture.detectChanges();
  return { host: fixture.nativeElement as HTMLElement, fixture, panels };
}

function said(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

describe('DayTransfers — le transfert et son manifeste dans la Supervision', () => {
  it('une ligne par transfert du jour, « parti » quand il l’est', async () => {
    const api = new FakeTransfers(() => Promise.resolve(VIEW));
    const { host } = await render(api);
    const rows = host.querySelectorAll('[data-day-transfer]');
    expect(api.asked).toEqual([DAY]);
    expect(rows).toHaveLength(2);
    expect(said(rows[0])).toBe('Transfert → Le Village Voir le manifeste');
    expect(said(rows[1])).toBe('Transfert → Le Haut · parti Voir le manifeste');
  });

  it('« Voir le manifeste » ouvre le dialogue de la livraison sur CE transfert', async () => {
    const { host, panels } = await render(new FakeTransfers(() => Promise.resolve(VIEW)));
    host.querySelectorAll<HTMLElement>('[data-transfer-manifest]')[1]?.click();
    expect(panels.opened).toEqual([
      { component: TransferManifestDialog, data: { transferId: 'tr_2', siteLabel: 'Le Haut' } },
    ]);
  });

  it('se relit quand la colonne est relue', async () => {
    const api = new FakeTransfers(() => Promise.resolve(VIEW));
    const { fixture } = await render(api);
    fixture.componentRef.setInput('revision', { again: true });
    await fixture.whenStable();
    expect(api.asked).toEqual([DAY, DAY]);
  });

  it('sans jour connu, ne lit rien ; une lecture en échec n’affiche rien', async () => {
    const silent = new FakeTransfers(() => Promise.resolve(VIEW));
    await render(silent, new FakePanels(), null);
    expect(silent.asked).toEqual([]);

    TestBed.resetTestingModule();
    const { host } = await render(new FakeTransfers(() => Promise.reject(new Error('403'))));
    expect(host.querySelector('[data-day-transfer]')).toBeNull();
  });
});
