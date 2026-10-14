import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, it } from 'vitest';

import { B2B_API_BASE } from '../api/api-config';
import { DeliveryRoundsService } from './delivery-rounds.service';

/**
 * Régression (Hugo, 2026-10-14) : « Cannot POST …/stops/…/deplacement ». Le
 * serveur avait renommé ses routes en anglais (`move`, `removal`), l'écran
 * appelait encore les anciennes : retirer ou déplacer un arrêt rendait 404.
 */
describe('DeliveryRoundsService — les adresses des gestes sur un arrêt', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function service(): DeliveryRoundsService {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    return TestBed.inject(DeliveryRoundsService);
  }

  it('déplace un arrêt par `move`, et le retire par `removal`', async () => {
    const rounds = service();
    const http = TestBed.inject(HttpTestingController);
    const base = `${B2B_API_BASE}/admin/delivery/rounds/r1/stops/s1`;

    const moved = rounds.move('r1', 's1', { toRoundId: 'r2', fromVersion: 1, toVersion: 1 });
    http.expectOne({ method: 'POST', url: `${base}/move` }).flush(null);
    await moved;

    const removed = rounds.remove('r1', 's1', { version: 1 });
    http.expectOne({ method: 'POST', url: `${base}/removal` }).flush(null);
    await removed;
  });
});
