import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { NO_MAIL_SEND_FILTERS } from '../rules/mail-send-labels';
import { MailSendsService } from './mail-sends.service';

const BASE = `${B2B_API_BASE}/admin/mail/sends`;

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { api: TestBed.inject(MailSendsService), http: TestBed.inject(HttpTestingController) };
}

/** Laisse la promesse précédente se résoudre avant d'attendre la requête suivante. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('MailSendsService — le suivi des e-mails', () => {
  it('liste avec les critères et le curseur en paramètres', async () => {
    const { api, http } = setup();
    const done = api.list({ ...NO_MAIL_SEND_FILTERS, space: 'lfc', scope: 'probes' }, 'c1');
    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('space')).toBe('lfc');
    expect(req.request.params.get('scope')).toBe('probes');
    expect(req.request.params.get('cursor')).toBe('c1');
    req.flush({ items: [], nextCursor: null });
    expect(await done).toEqual({ items: [], nextCursor: null });
  });

  it('cherche une adresse dans le CORPS, jamais dans l’URL, puis relit par l’identifiant', async () => {
    const { api, http } = setup();
    const done = api.searchByRecipient('claire@halles.fr', 'cle-1');
    const post = http.expectOne(`${BASE}/searches`);
    expect(post.request.method).toBe('POST');
    expect(post.request.headers.get('Idempotency-Key')).toBe('cle-1');
    expect(post.request.body).toEqual({ address: 'claire@halles.fr' });
    expect(post.request.urlWithParams).not.toContain('halles');
    post.flush({ id: 's1' });
    await tick();
    http
      .expectOne(`${BASE}/searches/s1`)
      .flush({ id: 's1', searchedAt: 'x', readableUntil: 'y', items: [] });
    expect((await done).id).toBe('s1');
  });

  it('révèle puis lit l’adresse ; un refus de la révélation ne lit rien', async () => {
    const { api, http } = setup();
    const done = api.revealRecipient('m1', 'cle-2');
    const reveal = http.expectOne(`${BASE}/m1/recipient-reveal`);
    expect(reveal.request.headers.get('Idempotency-Key')).toBe('cle-2');
    reveal.flush(null, { status: 204, statusText: 'No Content' });
    await tick();
    http
      .expectOne(`${BASE}/m1/recipient`)
      .flush({ id: 'm1', recipient: 'a@b.fr', failureReason: null, revealedUntil: 'z' });
    expect((await done).recipient).toBe('a@b.fr');

    const refused = api.revealRecipient('m2', 'cle-3');
    http
      .expectOne(`${BASE}/m2/recipient-reveal`)
      .flush({ message: 'Plafond atteint.' }, { status: 409, statusText: 'Conflict' });
    await expect(refused).rejects.toBeTruthy();
    http.expectNone(`${BASE}/m2/recipient`);
  });
});
