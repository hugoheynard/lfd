import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { DeliveryRoundTransferStopView } from '@lfd/contracts';

import { TransferStopCard } from './transfer-stop-card';

/** L'arrêt de transfert d'une colonne : le manifeste toujours, retirer et déplacer si l'on écrit. */

const STOP: DeliveryRoundTransferStopView = {
  stopId: 'ts_1',
  transferId: 'tr_1',
  siteLabel: 'Val Village',
  position: 3,
  orderCount: 2,
};

async function render(movable: boolean) {
  TestBed.configureTestingModule({ imports: [TransferStopCard] });
  const fixture = TestBed.createComponent(TransferStopCard);
  fixture.componentRef.setInput('stop', STOP);
  fixture.componentRef.setInput('movable', movable);
  fixture.componentRef.setInput('targets', [{ value: 'r2', label: 'Master' }]);
  await fixture.whenStable();
  return fixture;
}

describe('TransferStopCard', () => {
  it('nomme le site, le rang et les commandes, sans client', async () => {
    const host = (await render(false)).nativeElement as HTMLElement;
    expect(host.textContent).toContain('→ Val Village');
    expect(host.textContent).toContain('Arrêt 3 · transfert · 2 commandes');
    expect(host.querySelector('[data-transfer-remove]')).toBeNull();
    expect(host.querySelector('fold-listbox')).toBeNull();
  });

  it('retire par son arrêt, et déplace vers la tournée choisie', async () => {
    const fixture = await render(true);
    const removed: string[] = [];
    const moved: unknown[] = [];
    fixture.componentInstance.removed.subscribe((id) => removed.push(id));
    fixture.componentInstance.moved.subscribe((move) => moved.push(move));
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[data-transfer-remove]')?.click();
    expect(removed).toEqual(['ts_1']);
    expect(host.querySelector('fold-listbox')).not.toBeNull();
  });
});
