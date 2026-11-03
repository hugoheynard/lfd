import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CounterPackingSheetView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../api/api-config';
import { CounterPackingSheetService, SHEET_NOT_FOUND_CODE } from './counter-packing-sheet.service';

/** 2026-11-03 : le rail lit la fiche de SA commande, sous le droit du comptoir. */

const URL = `${B2B_API_BASE}/admin/counter/orders/ord_1/packing-sheet`;

const SHEET: CounterPackingSheetView = {
  orderId: 'ord_1',
  reference: 'CMD-1042',
  lineCount: 1,
  packedLines: 0,
  packedPieces: 0,
  packedAt: null,
  lines: [{ sku: 'a', quantity: 2, packed: false, awaitingProduction: true, allocated: 0 }],
};

describe('CounterPackingSheetService', () => {
  let service: CounterPackingSheetService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CounterPackingSheetService);
    http = TestBed.inject(HttpTestingController);
  });

  it('lit la fiche de la commande à la route du comptoir', async () => {
    const pending = service.sheet('ord_1');
    http.expectOne(URL).flush(SHEET);

    expect(await pending).toEqual(SHEET);
    http.verify();
  });

  it('le « pas de fiche » nommé se lit `null`', async () => {
    const pending = service.sheet('ord_1');
    http
      .expectOne(URL)
      .flush(
        { code: SHEET_NOT_FOUND_CODE, message: 'm' },
        { status: 404, statusText: 'Not Found' },
      );

    expect(await pending).toBeNull();
  });

  it('un autre refus remonte', async () => {
    const pending = service.sheet('ord_1');
    http.expectOne(URL).flush({ code: 'x' }, { status: 403, statusText: 'Forbidden' });

    await expect(pending).rejects.toMatchObject({ status: 403 });
  });
});
