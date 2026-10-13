import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { DriverTransferStopView } from '@lfd/contracts';

import { MyRoundTransferStop } from './my-round-transfer-stop';

/**
 * L'arrêt de transfert de « Ma tournée » : ce qu'on décharge, et « Remis au
 * site » seulement en route et sur un arrêt encore ouvert.
 */

const STOP: DriverTransferStopView = {
  stopId: 'ts_1',
  transferId: 'tr_1',
  position: 2,
  closedAt: null,
  siteLabel: 'Val Village',
  orderCount: 2,
  receivedAt: null,
  totals: [{ sku: 'PAIN-1', productName: 'Pain de campagne', quantity: 6 }],
};

async function render(stop: DriverTransferStopView, gestures: boolean): Promise<HTMLElement> {
  TestBed.configureTestingModule({ imports: [MyRoundTransferStop] });
  const fixture = TestBed.createComponent(MyRoundTransferStop);
  fixture.componentRef.setInput('stop', stop);
  fixture.componentRef.setInput('gestures', gestures);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('MyRoundTransferStop', () => {
  it('montre le site, les totaux par article et « Remis au site » en route', async () => {
    const host = await render(STOP, true);
    expect(host.textContent).toContain('→ Val Village');
    expect(host.textContent).toContain('2 commandes · 6 pièces');
    expect(host.textContent).toContain('Pain de campagne');
    expect(host.querySelector('[data-site-drop]')).not.toBeNull();
  });

  it('au dépôt, aucun geste', async () => {
    expect((await render(STOP, false)).querySelector('[data-site-drop]')).toBeNull();
  });

  it('clos, le dit et n’offre plus rien', async () => {
    const host = await render({ ...STOP, closedAt: '2026-09-10T07:40:00.000Z' }, true);
    expect(host.querySelector('[data-site-drop]')).toBeNull();
    expect(host.querySelector('[data-transfer-status]')).not.toBeNull();
  });
});
