import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { DeliveryRoundTransferStopView } from '@lfd/contracts';

import { TransferStopCard, carriedLabel } from './transfer-stop-card';

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

describe('carriedLabel', () => {
  /** Régression (R3c) : un transfert de réassort seul se lisait « 0 commande ». */
  it('dit les réassorts seuls, sans « 0 commande »', () => {
    expect(carriedLabel({ ...STOP, orderCount: 0, resupplyCount: 3 })).toBe('3 réassorts');
  });

  it('dit les deux quand le transfert porte commandes et réassorts', () => {
    expect(carriedLabel({ ...STOP, orderCount: 1, resupplyCount: 1 })).toBe(
      '1 commande · 1 réassort',
    );
  });

  it('garde le compte des commandes sans réassort, ou sans le champ', () => {
    expect(carriedLabel({ ...STOP, resupplyCount: 0 })).toBe('2 commandes');
    expect(carriedLabel(STOP)).toBe('2 commandes');
  });
});
