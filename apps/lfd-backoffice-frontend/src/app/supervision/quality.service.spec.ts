import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { QualityService } from './quality.service';

/** Les routes de `production-quality.controller.ts` — le champ multipart s'appelle `photo`. */
function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { service: TestBed.inject(QualityService), http: TestBed.inject(HttpTestingController) };
}

describe('QualityService', () => {
  it('dépose une photo sous le champ `photo` et rend son uploadId', async () => {
    const { service, http } = setup();
    const photo = new Blob(['x'], { type: 'image/jpeg' });

    const uploaded = service.deposit(photo);
    const request = http.expectOne((req) => req.url.endsWith('/admin/supervision/quality/photos'));
    expect(request.request.method).toBe('POST');
    expect((request.request.body as FormData).get('photo')).toBeInstanceOf(Blob);
    request.flush({ uploadId: 'up-1' });

    await expect(uploaded).resolves.toBe('up-1');
  });

  it('lit les pastilles, le détail et une photo à leurs routes', () => {
    const { service, http } = setup();

    void service.board('2026-09-25');
    void service.checks('2026-09-25');
    void service.photo('c-1', 2);

    http.expectOne((req) => req.url.endsWith('/admin/supervision/quality?date=2026-09-25'));
    http.expectOne((req) => req.url.endsWith('/admin/supervision/quality/checks?date=2026-09-25'));
    const photo = http.expectOne((req) => req.url.endsWith('/quality/checks/c-1/photos/2'));
    expect(photo.request.responseType).toBe('blob');
  });

  it('rend un verdict en POST et rend son id', async () => {
    const { service, http } = setup();
    const payload = {
      id: '01J9V1AAAAAAAAAAAAAAAAAAAA',
      serviceDay: '2026-09-25',
      target: { kind: 'order', orderId: 'o-1' },
      verdict: 'ok',
      note: null,
      uploadIds: [],
    } as const;

    const rendered = service.render({ ...payload, uploadIds: [] });
    const request = http.expectOne((req) => req.url.endsWith('/admin/supervision/quality/checks'));
    expect(request.request.body).toEqual(payload);
    request.flush({ id: payload.id });

    await expect(rendered).resolves.toBe(payload.id);
  });
});
