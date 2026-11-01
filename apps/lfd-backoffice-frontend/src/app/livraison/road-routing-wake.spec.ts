import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../api/api-config';
import { RoadRoutingWake } from './road-routing-wake';

describe('RoadRoutingWake — le réveil du calcul routier (2026-11-01)', () => {
  function setup() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    return { wake: TestBed.inject(RoadRoutingWake), http: TestBed.inject(HttpTestingController) };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('envoie un POST à la route du réveil', () => {
    const { wake, http } = setup();
    wake.wake();
    const request = http.expectOne(`${B2B_API_BASE}/admin/delivery/road-routing/wake`);
    expect(request.request.method).toBe('POST');
    request.flush(null, { status: 202, statusText: 'Accepted' });
  });

  it('avale un échec en silence : rien ne lève, rien ne s’affiche', () => {
    const { wake, http } = setup();
    expect(() => wake.wake()).not.toThrow();
    http
      .expectOne(`${B2B_API_BASE}/admin/delivery/road-routing/wake`)
      .flush({ message: 'indisponible' }, { status: 503, statusText: 'Unavailable' });
  });
});
