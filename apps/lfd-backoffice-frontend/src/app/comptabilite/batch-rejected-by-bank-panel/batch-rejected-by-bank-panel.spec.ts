import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { collectionBatch } from '../__tests__/collection-batch-fixture';
import { CollectionBatchesService } from '../collection-batches.service';
import { BatchRejectedByBankPanel } from './batch-rejected-by-bank-panel';

/**
 * Le panneau « La banque a rejeté ce fichier » (plan
 * `plan-lot-rejete-par-la-banque.md` § 7) : rien ne part sans l'attestation
 * cochée ET un motif.
 */
class RecordingApi {
  readonly calls: { batchId: string; reason: string }[] = [];
  rejectedByBank(batchId: string, reason: string): Promise<void> {
    this.calls.push({ batchId, reason });
    return Promise.resolve();
  }
}

class RecordingRef {
  closedWith: unknown = 'open';
  close(value?: unknown): void {
    this.closedWith = value;
  }
}

async function render(): Promise<{
  fixture: ComponentFixture<BatchRejectedByBankPanel>;
  api: RecordingApi;
  ref: RecordingRef;
}> {
  const api = new RecordingApi();
  const ref = new RecordingRef();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BatchRejectedByBankPanel],
    providers: [
      { provide: CollectionBatchesService, useValue: api },
      { provide: FoldPanelRef, useValue: ref },
    ],
  });
  const fixture = TestBed.createComponent(BatchRejectedByBankPanel);
  fixture.componentRef.setInput('data', collectionBatch({ id: 'b1', status: 'deposited' }));
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, api, ref };
}

const host = (fixture: ComponentFixture<BatchRejectedByBankPanel>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function confirm(fixture: ComponentFixture<BatchRejectedByBankPanel>): HTMLButtonElement | null {
  return host(fixture).querySelector<HTMLButtonElement>('[data-confirm]');
}

async function type(fixture: ComponentFixture<BatchRejectedByBankPanel>, text: string) {
  const input = host(fixture).querySelector<HTMLInputElement>('fold-input input');
  if (input !== null) {
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }
  fixture.detectChanges();
  await fixture.whenStable();
}

async function check(fixture: ComponentFixture<BatchRejectedByBankPanel>) {
  host(fixture).querySelector<HTMLInputElement>('[data-attested] input')?.click();
  fixture.detectChanges();
  await fixture.whenStable();
}

describe('le panneau « La banque a rejeté ce fichier »', () => {
  it('reste fermé sans l’attestation, même avec un motif', async () => {
    const { fixture } = await render();

    await type(fixture, 'PSR1 : schéma invalide');

    expect(confirm(fixture)?.disabled).toBe(true);
  });

  it('reste fermé sans motif, même attesté', async () => {
    const { fixture } = await render();

    await check(fixture);

    expect(confirm(fixture)?.disabled).toBe(true);
  });

  it('attesté et motivé : déclare le rejet, puis se ferme', async () => {
    const { fixture, api, ref } = await render();
    await check(fixture);
    await type(fixture, '  PSR1 : schéma invalide ');

    confirm(fixture)?.click();
    await fixture.whenStable();

    expect(api.calls).toEqual([{ batchId: 'b1', reason: 'PSR1 : schéma invalide' }]);
    expect(ref.closedWith).toBe(true);
  });
});
