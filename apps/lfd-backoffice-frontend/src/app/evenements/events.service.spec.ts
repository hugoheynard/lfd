import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../api/api-config';
import { INTENT_KEY_HEADER } from '../shared/gesture-intents';
import { EventsService } from './events.service';

const BASE = `${B2B_API_BASE}/admin/events`;

describe('EventsService', () => {
  let service: EventsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EventsService);
    http = TestBed.inject(HttpTestingController);
  });

  it('crée sous la clé du geste', async () => {
    const pending = service.create({ name: 'Mariage', date: '2026-12-12' }, 'k-1');
    const request = http.expectOne(BASE);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get(INTENT_KEY_HEADER)).toBe('k-1');
    expect(request.request.body).toEqual({ name: 'Mariage', date: '2026-12-12' });
    request.flush({ id: 'evt_1' });
    expect(await pending).toEqual({ id: 'evt_1' });
    http.verify();
  });

  it('dépose la fiche dans le champ `file`, sous la clé du dépôt', async () => {
    const file = new File(['%PDF'], 'fiche.pdf', { type: 'application/pdf' });
    const pending = service.depositSheet('evt 1', file, 'k-2');
    const request = http.expectOne(`${BASE}/evt%201/function-sheets`);
    expect(request.request.headers.get(INTENT_KEY_HEADER)).toBe('k-2');
    const body = request.request.body as FormData;
    expect(body.get('file')).toBeInstanceOf(File);
    request.flush({ id: 'fs_1' });
    expect(await pending).toEqual({ id: 'fs_1' });
  });

  it('retire une fiche par DELETE, et modifie par PATCH', async () => {
    const archived = service.archiveSheet('evt_1', 'fs_1');
    const del = http.expectOne(`${BASE}/evt_1/function-sheets/fs_1`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
    await archived;

    const revised = service.revise('evt_1', { name: 'Gala' });
    const patch = http.expectOne(`${BASE}/evt_1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ name: 'Gala' });
    patch.flush(null);
    await revised;
    http.verify();
  });
});
