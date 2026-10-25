import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { NotifyService } from '../../notify.service';
import { LabelPrinter } from './label-printer';

/**
 * Les étiquettes A6 sont des PDF du serveur (2026-10-25) : l'écran les
 * demande avec le jeton (`HttpClient`), les ouvre dans un onglet, et dit le
 * refus du serveur quand il n'y a rien à imprimer.
 */

class RecordingNotify {
  readonly errors: unknown[] = [];
  error(error: unknown): void {
    this.errors.push(error);
  }
}

let http: HttpTestingController;
let notify: RecordingNotify;
let opened: string[];

beforeEach(() => {
  TestBed.resetTestingModule();
  notify = new RecordingNotify();
  opened = [];
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: NotifyService, useValue: notify },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:etiquettes');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(window, 'open').mockImplementation((url) => {
    opened.push(String(url));
    return null;
  });
});

afterEach(() => {
  http.verify();
  vi.restoreAllMocks();
});

const PDF = new Blob(['%PDF-'], { type: 'application/pdf' });

describe('LabelPrinter', () => {
  it('ouvre les étiquettes d’un sac, sur la journée du poste', async () => {
    const pending = TestBed.inject(LabelPrinter).bags('2026-10-05', 'o-1', ['c-2']);
    const request = http.expectOne(
      (one) => one.url === `${B2B_API_BASE}/admin/packing/2026-10-05/orders/o-1/bag-labels.pdf`,
    );
    expect(request.request.params.get('sacs')).toBe('c-2');
    request.flush(PDF);
    await pending;
    expect(opened).toEqual(['blob:etiquettes']);
  });

  it('sans sélection, ne pose pas de filtre : toutes les étiquettes', async () => {
    const pending = TestBed.inject(LabelPrinter).orderBins('o-1', []);
    const request = http.expectOne(
      (one) => one.url === `${B2B_API_BASE}/admin/delivery/packing/bin-labels`,
    );
    expect(request.request.params.get('order')).toBe('o-1');
    expect(request.request.params.has('bacs')).toBe(false);
    request.flush(PDF);
    await pending;
    expect(opened).toEqual(['blob:etiquettes']);
  });

  it('les bacs d’un transfert, ceux qu’on vient de déclarer', async () => {
    const pending = TestBed.inject(LabelPrinter).transferBins('tr_1', ['b1', 'b2']);
    const request = http.expectOne(
      (one) => one.url === `${B2B_API_BASE}/admin/delivery/packing/bin-labels/transfers/tr_1`,
    );
    expect(request.request.params.get('bacs')).toBe('b1,b2');
    request.flush(PDF);
    await pending;
    expect(opened).toEqual(['blob:etiquettes']);
  });

  it('un refus du serveur se dit avec son message, et rien ne s’ouvre', async () => {
    const pending = TestBed.inject(LabelPrinter).bags('2026-10-05', 'o-1', []);
    const refusal = new Blob(
      [JSON.stringify({ message: 'La commande ORD-1 n’a aucun sac au poste.' })],
      { type: 'application/json' },
    );
    http
      .expectOne((one) => one.url.endsWith('/bag-labels.pdf'))
      .flush(refusal, { status: 409, statusText: 'Conflict' });
    await pending;
    expect(opened).toEqual([]);
    expect(notify.errors).toEqual([
      { error: { message: 'La commande ORD-1 n’a aucun sac au poste.' } },
    ]);
  });
});
