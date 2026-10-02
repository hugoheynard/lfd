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

  /** Le journal de la livraison a sa porte, celle de `DeliveryDayVersionController`. */
  it('lit la journée de la livraison sur sa route', async () => {
    const asked = TestBed.inject(DayVersionService).version('delivery', '2026-10-02');
    http
      .expectOne(`${B2B_API_BASE}/admin/livraison/version?date=2026-10-02`)
      .flush({ date: '2026-10-02', version: 7 });
    expect(await asked).toBe(7);
  });
});
