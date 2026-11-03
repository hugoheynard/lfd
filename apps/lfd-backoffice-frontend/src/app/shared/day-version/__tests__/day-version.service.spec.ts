import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../../api/api-config';
import { DayVersionService } from '../day-version.service';

describe('DayVersionService', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** D8 (2026-11-03) : une seule porte, tous les journaux d'une journée en une requête. */
  it('lit plusieurs journaux d’une journée en UNE requête sur la porte unique', async () => {
    const asked = TestBed.inject(DayVersionService).versions('2026-10-02', [
      'orders',
      'production',
    ]);
    const request = http.expectOne(
      `${B2B_API_BASE}/admin/day-versions?date=2026-10-02&journals=orders,production`,
    );
    expect(request.request.method).toBe('GET');
    request.flush({ date: '2026-10-02', versions: { orders: 7 } });

    expect(await asked).toEqual({ orders: 7 });
  });
});
