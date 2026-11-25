import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ProductionPrintOptionsView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../api/api-config';
import { DossierPrintService } from './dossier-print.service';

/** Les routes de la fenêtre d'impression du dossier : forme des URL, clé d'intention. */

const BATCH = `${B2B_API_BASE}/admin/production/batch/2026-11-26`;

describe('DossierPrintService', () => {
  let service: DossierPrintService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DossierPrintService);
    http = TestBed.inject(HttpTestingController);
  });

  it('lit l’état de la fenêtre', async () => {
    const view: ProductionPrintOptionsView = {
      arrested: false,
      grouping: 'shelf',
      groups: [],
      orders: [],
      prints: [],
      changedSinceLast: false,
      functionSheets: [],
    };
    const pending = service.printOptions('2026-11-26');
    http.expectOne(`${BATCH}/print-options`).flush(view);
    expect(await pending).toEqual(view);
  });

  it('tire une impression provisoire sous la clé d’intention, et rend son id', async () => {
    const pending = service.drawProvisional(
      '2026-11-26',
      { parts: ['cover'], groups: 'all', orders: { kind: 'since', run: 3 } },
      'key-1',
    );
    const request = http.expectOne(`${BATCH}/provisional-print`);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe('key-1');
    expect(request.request.body).toEqual({
      parts: ['cover'],
      groups: 'all',
      orders: { kind: 'since', run: 3 },
    });
    request.flush({ id: 'pp_1' });
    expect(await pending).toBe('pp_1');
  });

  it('lit le PDF d’une impression provisoire', async () => {
    const pending = service.provisionalPdf('2026-11-26', 'pp_1');
    http.expectOne(`${BATCH}/provisional-print/pp_1.pdf`).flush(new Blob(['%PDF']));
    expect(await pending).toBeInstanceOf(Blob);
  });

  it('sans sélection, demande le dossier archivé, sans paramètre', async () => {
    const pending = service.frozenPdf('2026-11-26');
    http.expectOne(`${BATCH}/dossier.pdf`).flush(new Blob(['%PDF']));
    await pending;
  });

  it('parties et commandes en liste à virgules, rayons en paramètre répété', async () => {
    const pending = service.frozenPdf('2026-11-26', {
      parts: ['recap', 'orders'],
      groups: ['Pains, levain', 'Viennoiseries'],
      orders: ['o1', 'o2'],
    });
    const request = http.expectOne((r) => r.url === `${BATCH}/dossier.pdf`);
    expect(request.request.params.get('parts')).toBe('recap,orders');
    expect(request.request.params.getAll('groups')).toEqual(['Pains, levain', 'Viennoiseries']);
    expect(request.request.params.get('orders')).toBe('o1,o2');
    request.flush(new Blob(['%PDF']));
    await pending;
  });
});
