import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../api/api-config';
import {
  CounterDeliveryNoteService,
  isNotYet,
  NOTE_NOT_YET_CODE,
  retryWhileNotYet,
} from './counter-delivery-note.service';

/** Lot L6 : le BL naît après la remise ; « pas encore » se réessaie, le reste remonte. */

function refusal(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: new Blob([JSON.stringify({ code, message: 'm' })], { type: 'application/json' }),
  });
}

describe('isNotYet', () => {
  it('reconnaît le 404 « pas encore », corps en Blob', async () => {
    expect(await isNotYet(refusal(404, NOTE_NOT_YET_CODE))).toBe(true);
  });

  it('écarte un autre 404 et un autre statut', async () => {
    expect(await isNotYet(refusal(404, 'delivery_notes.counter.out_of_reach'))).toBe(false);
    expect(await isNotYet(refusal(403, NOTE_NOT_YET_CODE))).toBe(false);
  });
});

describe('retryWhileNotYet', () => {
  it('réessaie tant que le bon n’est pas écrit, puis le rend', async () => {
    let calls = 0;
    const result = await retryWhileNotYet(
      () => {
        calls += 1;
        return calls < 3 ? Promise.reject(refusal(404, NOTE_NOT_YET_CODE)) : Promise.resolve('pdf');
      },
      5,
      0,
    );
    expect(result).toBe('pdf');
    expect(calls).toBe(3);
  });

  it('ne réessaie pas un autre refus', async () => {
    let calls = 0;
    await expect(
      retryWhileNotYet(
        () => {
          calls += 1;
          return Promise.reject(refusal(404, 'delivery_notes.counter.out_of_reach'));
        },
        5,
        0,
      ),
    ).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(calls).toBe(1);
  });

  it('abandonne après le nombre d’essais', async () => {
    let calls = 0;
    await expect(
      retryWhileNotYet(
        () => {
          calls += 1;
          return Promise.reject(refusal(404, NOTE_NOT_YET_CODE));
        },
        3,
        0,
      ),
    ).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(calls).toBe(3);
  });
});

/** Hugo, 2026-11-03 : au comptoir, on tend le BL de TRANSPORT, non chiffré. */
describe('CounterDeliveryNoteService', () => {
  it('lit le BL de transport du comptoir, jamais le chiffré', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(CounterDeliveryNoteService);
    const ctrl = TestBed.inject(HttpTestingController);

    const pending = service.carrierPdf('ord_1');
    ctrl
      .expectOne({
        method: 'GET',
        url: `${B2B_API_BASE}/admin/counter/orders/ord_1/delivery-note/carrier.pdf`,
      })
      .flush(new Blob(['%PDF-']));

    expect(await pending).toBeInstanceOf(Blob);
    ctrl.verify();
  });
});
