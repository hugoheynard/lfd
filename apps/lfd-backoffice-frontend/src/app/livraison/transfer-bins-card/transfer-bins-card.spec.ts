import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type {
  BinTypesView,
  DeclareTransferBinsPayload,
  DeliveryLoadingTransferStopView,
} from '@lfd/contracts';

import { DeliveryBinsService } from '../delivery-bins.service';
import { DeliveryLoadingService } from '../delivery-loading.service';
import { TransferBinsCard } from './transfer-bins-card';

/**
 * Déclarer les bacs d'un transfert : rien sans format choisi, la déclaration
 * part entière, et les étiquettes qui suivent sont celles des bacs déclarés.
 */

const STOP: DeliveryLoadingTransferStopView = {
  stopId: 'ts_1',
  transferId: 'tr_1',
  siteLabel: 'Val Village',
  position: 2,
  state: 'unlabelled',
  bins: [],
};

const TYPES: BinTypesView = { types: [] };

class FakeLoading {
  calls: { transferId: string; payload: DeclareTransferBinsPayload }[] = [];
  declareTransferBins(transferId: string, payload: DeclareTransferBinsPayload) {
    this.calls.push({ transferId, payload });
    return Promise.resolve({ binIds: ['b1', 'b2'] });
  }
}

async function render(loading: FakeLoading, stop: DeliveryLoadingTransferStopView = STOP) {
  TestBed.configureTestingModule({
    imports: [TransferBinsCard],
    providers: [
      provideRouter([]),
      { provide: DeliveryLoadingService, useValue: loading },
      { provide: DeliveryBinsService, useValue: { binTypes: () => Promise.resolve(TYPES) } },
    ],
  });
  const fixture = TestBed.createComponent(TransferBinsCard);
  fixture.componentRef.setInput('stop', stop);
  fixture.componentRef.setInput('canWrite', true);
  await fixture.whenStable();
  return fixture;
}

describe('TransferBinsCard', () => {
  it('dit qu’un transfert sans bac ne partira pas', async () => {
    const host = (await render(new FakeLoading())).nativeElement as HTMLElement;
    expect(host.textContent).toContain('« Partir » le refuse');
  });

  it('ouvre le formulaire, Déclarer éteint tant qu’aucun format n’est choisi', async () => {
    const fixture = await render(new FakeLoading());
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[data-open-transfer-bins]')?.click();
    await fixture.whenStable();
    const submit = host.querySelector<HTMLButtonElement>('[data-declare-transfer-bins]');
    expect(submit?.disabled).toBe(true);
    expect(host.querySelector('[data-transfer-labels]')?.getAttribute('href')).toBe(
      '/livraison/etiquettes/transfert/tr_1',
    );
  });

  it('dit qu’un réassort au plus tôt arrivé après le chargement demande un bac de plus', async () => {
    const late = { ...STOP, state: 'loaded' as const, resuppliesAfterLoading: 1 };
    const host = (await render(new FakeLoading(), late)).nativeElement as HTMLElement;
    expect(host.querySelector('[data-late-resupplies]')?.textContent).toContain(
      'Un réassort « au plus tôt » a rejoint ce transfert après son chargement',
    );
  });

  it('ne dit rien sans réassort tardif', async () => {
    const host = (await render(new FakeLoading())).nativeElement as HTMLElement;
    expect(host.querySelector('[data-late-resupplies]')).toBeNull();
  });
});
