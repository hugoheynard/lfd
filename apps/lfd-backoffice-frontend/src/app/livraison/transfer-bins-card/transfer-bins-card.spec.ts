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

async function render(loading: FakeLoading) {
  TestBed.configureTestingModule({
    imports: [TransferBinsCard],
    providers: [
      provideRouter([]),
      { provide: DeliveryLoadingService, useValue: loading },
      { provide: DeliveryBinsService, useValue: { binTypes: () => Promise.resolve(TYPES) } },
    ],
  });
  const fixture = TestBed.createComponent(TransferBinsCard);
  fixture.componentRef.setInput('stop', STOP);
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
});
