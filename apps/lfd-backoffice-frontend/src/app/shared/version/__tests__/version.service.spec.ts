import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../../api/api-config';
import { VersionService } from '../version.service';

describe('VersionService', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lit sujets journaliers et globaux en UNE requête sur la porte unique', async () => {
    const asked = TestBed.inject(VersionService).versions('2026-10-02', [
      'orders',
      'production',
      'companies',
    ]);
    const request = http.expectOne(
      `${B2B_API_BASE}/admin/versions?date=2026-10-02&subjects=orders,production,companies`,
    );
    expect(request.request.method).toBe('GET');
    request.flush({ date: '2026-10-02', versions: { orders: 7 } });

    expect(await asked).toEqual({ orders: 7 });
  });

  it('ne nomme pas de date quand la question ne porte que des sujets globaux', async () => {
    const asked = TestBed.inject(VersionService).versions(null, ['orders-all']);
    http
      .expectOne(`${B2B_API_BASE}/admin/versions?subjects=orders-all`)
      .flush({ date: null, versions: { 'orders-all': 3 } });

    expect(await asked).toEqual({ 'orders-all': 3 });
  });
});
