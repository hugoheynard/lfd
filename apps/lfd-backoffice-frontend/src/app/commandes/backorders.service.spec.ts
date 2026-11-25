import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../api/api-config';
import { INTENT_KEY_HEADER } from '../shared/gesture-intents';
import { AdminBackordersService } from './backorders.service';

function setup(): { api: AdminBackordersService; http: HttpTestingController } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return {
    api: TestBed.inject(AdminBackordersService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('AdminBackordersService', () => {
  it('lit les reliquats ouverts', async () => {
    const { api, http } = setup();
    const listed = api.list('open');
    http.expectOne(`${B2B_API_BASE}/admin/backorders?state=open`).flush([]);
    expect(await listed).toEqual([]);
  });

  it('transforme sur la route du reliquat, avec la clé d’intention en en-tête', async () => {
    const { api, http } = setup();
    const placed = api.convert(
      'bo_1',
      {
        buyerUserId: 'u_1',
        settlement: 'account',
        fulfillmentMethod: 'pickup',
        deliveryAddress: null,
        pickupAddressId: 'p_1',
        deliveryAddressId: null,
        requestedDeliveryDate: '2030-01-10',
        requestedWindow: { start: '08:00', end: '09:00' },
        note: '',
        expectedTotalCents: 380,
      },
      'cle-1',
    );
    const request = http.expectOne(`${B2B_API_BASE}/admin/backorders/bo_1/convert`);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get(INTENT_KEY_HEADER)).toBe('cle-1');
    request.flush({ id: 'ord_2', orderNumber: 'ORD-0099', settlement: 'account', totalCents: 380 });
    expect((await placed).orderNumber).toBe('ORD-0099');
    http.verify();
  });
});
