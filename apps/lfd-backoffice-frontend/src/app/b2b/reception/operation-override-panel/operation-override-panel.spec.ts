import { TestBed } from '@angular/core/testing';
import type { ReceivedOperationView, SetOperationOverridePayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { receivedOperation } from '../received-operation.testing';
import { ReceivedOperationsService } from '../received-operations.service';
import { OperationOverridePanel } from './operation-override-panel';

function setup(
  operation: ReceivedOperationView,
  write: (key: string, payload: SetOperationOverridePayload) => Promise<void>,
) {
  const closed: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: ReceivedOperationsService, useValue: { setOverride: write } },
      {
        provide: FoldPanelRef,
        useValue: { close: (result?: unknown) => closed.push(result) },
      },
    ],
  });
  const fixture = TestBed.createComponent(OperationOverridePanel);
  fixture.componentRef.setInput('data', { operation, names: new Map([['BUCHE-8', 'Bûche 8']]) });
  fixture.detectChanges();
  return { fixture, panel: fixture.componentInstance, closed };
}

describe('OperationOverridePanel', () => {
  it('rien de changé, rien à enregistrer', () => {
    const { panel } = setup(receivedOperation(), async () => undefined);
    expect(panel['canSave']()).toBe(false);
  });

  it('envoie la surcharge entière, clôture convertie en heure de Paris, puis se ferme', async () => {
    const sent: [string, SetOperationOverridePayload][] = [];
    const { panel, closed } = setup(receivedOperation(), async (key, payload) => {
      sent.push([key, payload]);
    });
    panel['setUntil']('orderUntilDay', '2026-12-20');
    panel['setUntil']('orderUntilTime', '12:00');
    panel['setAudience']('pro');
    panel['setArticleHidden']('BUCHE-8', true);
    expect(panel['canSave']()).toBe(true);
    await panel['save']();
    expect(sent).toEqual([
      [
        'noel-2026',
        {
          isHidden: false,
          orderUntil: '2026-12-20T11:00:00.000Z',
          audience: 'pro',
          hiddenSkus: ['BUCHE-8'],
        },
      ],
    ]);
    expect(closed).toEqual([true]);
  });

  it('une clôture à moitié saisie ne s’envoie pas, et dit ce qui manque', () => {
    const { panel, fixture } = setup(receivedOperation(), async () => undefined);
    panel['setUntil']('orderUntilDay', '2026-12-20');
    fixture.detectChanges();
    expect(panel['canSave']()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('le jour ET l’heure');
  });

  it('un refus reste dans le panneau, qui reste ouvert', async () => {
    const { panel, closed } = setup(receivedOperation(), async () => {
      throw new Error('refus');
    });
    panel['setHidden'](true);
    await panel['save']();
    expect(closed).toEqual([]);
    expect(panel['refusal']()).not.toBeNull();
  });

  it('« garder la clientèle reçue » renvoie null', () => {
    const { panel } = setup(
      receivedOperation({
        override: {
          isHidden: false,
          orderUntil: null,
          audience: 'pro',
          hiddenSkus: [],
          decidedBy: null,
          decidedAt: '2026-11-02T09:00:00.000Z',
        },
      }),
      async () => undefined,
    );
    panel['setAudience']('keep');
    expect(panel['draft']().audience).toBeNull();
    expect(panel['canSave']()).toBe(true);
  });
});
