import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { PurchaseBinCandidatePayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PurchaseLibraryService } from '../purchase-library.service';
import { PurchaseBinCandidateDialog } from './purchase-bin-candidate-dialog';

let adds: PurchaseBinCandidatePayload[];
let closes: unknown[];

async function boot(): Promise<ComponentFixture<PurchaseBinCandidateDialog>> {
  adds = [];
  closes = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PurchaseBinCandidateDialog],
    providers: [
      {
        provide: PurchaseLibraryService,
        useValue: {
          addBinCandidate: (payload: PurchaseBinCandidatePayload) => {
            adds.push(payload);
            return Promise.resolve();
          },
          updateBinCandidate: () => Promise.resolve(),
        } satisfies Pick<PurchaseLibraryService, 'addBinCandidate' | 'updateBinCandidate'>,
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(PurchaseBinCandidateDialog);
  fixture.componentRef.setInput('data', {});
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function type(
  fixture: ComponentFixture<PurchaseBinCandidateDialog>,
  selector: string,
  value: string,
): void {
  const input = (fixture.nativeElement as HTMLElement).querySelector(`${selector} input`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`${selector} absent.`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('PurchaseBinCandidateDialog', () => {
  it('envoie la géométrie, le fournisseur et le prix unitaire en centimes', async () => {
    const fixture = await boot();
    const host = fixture.nativeElement as HTMLElement;
    const submit = host.querySelector<HTMLButtonElement>('button.pbc-submit');
    type(fixture, '[data-name]', 'Caisse Dupont 50');
    for (const [selector, value] of [
      ['[data-outer-length]', '60'],
      ['[data-outer-width]', '40'],
      ['[data-outer-height]', '30'],
      ['[data-inner-length]', '56'],
      ['[data-inner-width]', '36'],
      ['[data-inner-height]', '28'],
    ] as const) {
      type(fixture, selector, value);
    }
    expect(submit?.disabled).toBe(true);
    type(fixture, '[data-max-stack]', '5');
    type(fixture, '[data-supplier]', 'Dupont');
    type(fixture, '[data-price]', '12,5');
    expect(submit?.disabled).toBe(false);

    submit?.click();
    await fixture.whenStable();

    expect(adds).toEqual([
      {
        name: 'Caisse Dupont 50',
        outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
        inner: { lengthCm: 56, widthCm: 36, heightCm: 28 },
        isotherm: false,
        maxStack: 5,
        supplier: 'Dupont',
        reference: null,
        purchaseUrl: null,
        unitPriceCentsExclVat: 1250,
      },
    ]);
    expect(closes).toEqual([true]);
  });
});
