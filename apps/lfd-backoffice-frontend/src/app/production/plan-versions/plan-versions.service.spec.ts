import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { PlanVersionsService } from './plan-versions.service';

/** Les trois routes des versions du plan : forme des URL et des paramètres. */

const VERSIONS = `${B2B_API_BASE}/admin/production/batch/2026-11-27/plan-versions`;

describe('PlanVersionsService', () => {
  let service: PlanVersionsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlanVersionsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('lit la liste des versions de la journée', async () => {
    const pending = service.list('2026-11-27');
    http.expectOne(VERSIONS).flush([]);
    expect(await pending).toEqual([]);
  });

  it('compare deux versions par ?from=&to=', async () => {
    const pending = service.compare('2026-11-27', 2, 4);
    const request = http.expectOne((req) => req.url === `${VERSIONS}/compare`);
    expect(request.request.params.get('from')).toBe('2');
    expect(request.request.params.get('to')).toBe('4');
    request.flush({ changes: [] });
    expect(await pending).toEqual({ changes: [] });
  });

  it('lit les envois du dossier', async () => {
    const pending = service.dispatches('2026-11-27');
    http.expectOne(`${VERSIONS}/dispatches`).flush([]);
    expect(await pending).toEqual([]);
  });
});
