import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { NO_MAIL_PREFERENCE_FILTERS } from '../rules/mail-preference-labels';
import { MailPreferencesService } from './mail-preferences.service';

const BASE = `${B2B_API_BASE}/admin/mail/preferences`;

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return {
    api: TestBed.inject(MailPreferencesService),
    http: TestBed.inject(HttpTestingController),
  };
}

/** Laisse la promesse précédente se résoudre avant d'attendre la requête suivante. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('MailPreferencesService — les désinscriptions et accords (C4)', () => {
  it('liste avec les critères et le curseur en paramètres', async () => {
    const { api, http } = setup();
    const done = api.list({ ...NO_MAIL_PREFERENCE_FILTERS, status: 'unsubscribed' }, 'pref_2');
    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('status')).toBe('unsubscribed');
    expect(req.request.params.get('cursor')).toBe('pref_2');
    req.flush({ items: [], nextCursor: null });
    expect(await done).toEqual({ items: [], nextCursor: null });
  });

  it('cherche une adresse dans le CORPS, jamais dans l’URL, puis relit par l’identifiant', async () => {
    const { api, http } = setup();
    const done = api.searchByAddress('claire@halles.fr');
    const post = http.expectOne(`${BASE}/searches`);
    expect(post.request.body).toEqual({ address: 'claire@halles.fr' });
    expect(post.request.urlWithParams).not.toContain('halles');
    post.flush({ id: 's1' });
    await tick();
    http
      .expectOne(`${BASE}/searches/s1`)
      .flush({ id: 's1', searchedAt: 'x', readableUntil: 'y', items: [] });
    expect((await done).id).toBe('s1');
  });

  it('révèle puis lit l’adresse', async () => {
    const { api, http } = setup();
    const done = api.revealRecipient('pref_1');
    const post = http.expectOne(`${BASE}/pref_1/recipient-reveal`);
    expect(post.request.method).toBe('POST');
    post.flush(null);
    await tick();
    http
      .expectOne(`${BASE}/pref_1/recipient`)
      .flush({ id: 'pref_1', recipient: 'claire@halles.fr', revealedUntil: 'x' });
    expect((await done).recipient).toBe('claire@halles.fr');
  });

  it('désinscrit une ligne, et une adresse donnée dans le CORPS, jamais dans l’URL', async () => {
    const { api, http } = setup();
    const line = api.unsubscribe('pref_1');
    const first = http.expectOne(`${BASE}/pref_1/unsubscription`);
    expect(first.request.method).toBe('POST');
    first.flush(null);
    await line;

    const address = api.unsubscribeAddress('lfc', 'claire@halles.fr');
    const post = http.expectOne(`${BASE}/unsubscriptions`);
    expect(post.request.body).toEqual({ space: 'lfc', address: 'claire@halles.fr' });
    expect(post.request.urlWithParams).not.toContain('halles');
    post.flush(null);
    await address;
    http.verify();
  });
});
