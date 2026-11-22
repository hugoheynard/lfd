import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PayLinkGateway } from './pay-link.gateway';

const TOKEN = 'b'.repeat(43);

describe('PayLinkGateway', () => {
  let gateway: PayLinkGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    gateway = TestBed.inject(PayLinkGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function answer(path: string, body: object | null, status = 200, statusText = 'OK'): void {
    const request = http.expectOne((r) => r.url.endsWith(path));
    expect(request.request.method).toBe('POST');
    // Le jeton voyage dans le corps, jamais dans l'adresse.
    expect(request.request.body).toEqual({ token: TOKEN });
    expect(request.request.url).not.toContain(TOKEN);
    request.flush(body, { status, statusText });
  }

  it('rend la vue', async () => {
    const pending = gateway.view(TOKEN);
    answer('/pay-links/view', { payable: false, reason: 'settled' });
    expect(await pending).toEqual({
      kind: 'ready',
      view: { payable: false, reason: 'settled' },
    });
  });

  it('un 404 sur la vue est « introuvable »', async () => {
    const pending = gateway.view(TOKEN);
    answer('/pay-links/view', { code: 'pay_link.not_found' }, 404, 'Not Found');
    expect(await pending).toEqual({ kind: 'not_found' });
  });

  it('une panne sur la vue est « échec », pas « introuvable »', async () => {
    const pending = gateway.view(TOKEN);
    answer('/pay-links/view', null, 503, 'Unavailable');
    expect(await pending).toEqual({ kind: 'failed' });
  });

  it('rend l’intention', async () => {
    const intent = {
      collection: { kind: 'redirect', provider: 'banque', url: 'https://example.test' },
      amountCents: 100,
    };
    const pending = gateway.intent(TOKEN);
    answer('/pay-links/intent', intent);
    expect(await pending).toEqual({ kind: 'ready', intent });
  });

  it('un 409 « non payable » sur l’intention', async () => {
    const pending = gateway.intent(TOKEN);
    answer('/pay-links/intent', { code: 'pay_link.subject.not_payable' }, 409, 'Conflict');
    expect(await pending).toEqual({ kind: 'not_payable' });
  });

  it('un 409 « lien à refaire » sur l’intention', async () => {
    const pending = gateway.intent(TOKEN);
    answer('/pay-links/intent', { code: 'pay_link.intent.closed' }, 409, 'Conflict');
    expect(await pending).toEqual({ kind: 'closed' });
  });

  it('un 404 sur l’intention est « introuvable »', async () => {
    const pending = gateway.intent(TOKEN);
    answer('/pay-links/intent', null, 404, 'Not Found');
    expect(await pending).toEqual({ kind: 'not_found' });
  });
});
