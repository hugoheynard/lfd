import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../../api/api-config';
import { INTENT_KEY_HEADER } from '../../../shared/gesture-intents';
import { CompanyPricingService } from '../company-pricing.service';

const BASE = `${B2B_API_BASE}/admin/pricing/companies/co_1`;
const KEY = '0b7f6f0e-8a52-4c1e-9d43-0d8e5f0a1b2c';

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return {
    api: TestBed.inject(CompanyPricingService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('CompanyPricingService — les trois écritures portent leur clé d’intention', () => {
  it('la pose envoie la clé dans l’en-tête Idempotency-Key', async () => {
    const { api, http } = setup();
    const done = api.pose(
      'co_1',
      { label: 'Été', validFrom: '2026-06-01T00:00:00.000Z', validTo: null, lines: [] },
      KEY,
    );
    const req = http.expectOne(`${BASE}/mercuriale`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get(INTENT_KEY_HEADER)).toBe(KEY);
    req.flush({ affectedRules: 0 });
    expect(await done).toEqual({ affectedRules: 0 });
  });

  it('l’avenant envoie la clé', async () => {
    const { api, http } = setup();
    const done = api.amend(
      'co_1',
      'merc_1',
      { validTo: null, reason: 'Renégociation', lines: [], endedSkus: [] },
      KEY,
    );
    const req = http.expectOne(`${BASE}/mercuriale/merc_1/amendments`);
    expect(req.request.headers.get(INTENT_KEY_HEADER)).toBe(KEY);
    req.flush({ amendmentId: 'amd_1' });
    expect(await done).toEqual({ amendmentId: 'amd_1' });
  });

  it('la correction de dates envoie la clé', async () => {
    const { api, http } = setup();
    const done = api.correctWindow(
      'co_1',
      'merc_1',
      {
        validFrom: '2026-06-01T00:00:00.000Z',
        validTo: null,
        reason: 'Erreur de saisie',
        basedOnAmendmentId: null,
      },
      KEY,
    );
    const req = http.expectOne(`${BASE}/mercuriale/merc_1/window`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.headers.get(INTENT_KEY_HEADER)).toBe(KEY);
    req.flush(null);
    await done;
  });

  it('l’aperçu d’un avenant, une lecture, ne porte pas de clé', async () => {
    const { api, http } = setup();
    void api.previewAmendment('co_1', 'merc_1', {
      validTo: null,
      reason: 'Aperçu',
      lines: [],
      endedSkus: [],
    });
    const req = http.expectOne(`${BASE}/mercuriale/merc_1/amendments/preview`);
    expect(req.request.headers.has(INTENT_KEY_HEADER)).toBe(false);
  });
});
