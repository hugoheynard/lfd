import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { LegalDocumentView } from '@lfd/contracts';
import type { SalesTermsDocument } from '@lfd/contracts/content-values';
import type { CustomerAudience } from '@lfd/contracts/shop-values';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { ClientAudience } from '../client-audience.service';
import { SalesTermsPage } from './sales-terms-page';

const textUrl = (document: SalesTermsDocument): string =>
  `${AUTH_CONFIG.apiBaseUrl}/content/legal/${document}`;

const EMPTY: LegalDocumentView = {
  content: { title: { fr: 'CGV', en: 'CGV', it: 'CGV' }, paragraphs: [] },
  revision: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: null,
};

describe('la page /cgv', () => {
  let audience: ReturnType<typeof signal<CustomerAudience | null>>;
  let http: HttpTestingController;

  const open = async (url: string): Promise<RouterTestingHarness> => {
    const harness = await RouterTestingHarness.create(url);
    harness.detectChanges();
    return harness;
  };

  /** Le texte que la page a demandé — c'est le côté qu'elle montre. */
  const requested = (): SalesTermsDocument => {
    const reads = http.match((req) => req.method === 'GET' && req.url.includes('/content/legal/'));
    expect(reads).toHaveLength(1);
    const read = reads[0];
    read?.flush(EMPTY);
    return read?.request.url === textUrl('salesTermsPro') ? 'salesTermsPro' : 'salesTerms';
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    audience = signal<CustomerAudience | null>('b2c');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'cgv', component: SalesTermsPage }]),
        { provide: ClientAudience, useValue: { current: audience } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Les sondes du PDF ne sont pas le sujet ici.
    http.match((req) => req.method === 'HEAD');
    http.verify();
  });

  it('sans paramètre, un visiteur ou un particulier lit les CGV particuliers', async () => {
    await open('/cgv');
    expect(requested()).toBe('salesTerms');
  });

  it('sans paramètre, une clientèle pro lit les CGV pro', async () => {
    audience.set('b2b');
    await open('/cgv');
    expect(requested()).toBe('salesTermsPro');
  });

  /** Le lien d'une landing pro : sans connexion, il ouvre le texte pro. */
  it('`?pour=pro` ouvre le texte pro, quelle que soit la clientèle', async () => {
    await open('/cgv?pour=pro');
    expect(requested()).toBe('salesTermsPro');
  });

  it('`?pour=particulier` l’emporte sur une clientèle pro', async () => {
    audience.set('b2b');
    await open('/cgv?pour=particulier');
    expect(requested()).toBe('salesTerms');
  });

  it('un paramètre inconnu retombe sur le défaut', async () => {
    await open('/cgv?pour=grossiste');
    expect(requested()).toBe('salesTerms');
  });

  it('basculer écrit le côté dans l’adresse, pour qu’un lien copié l’ouvre', async () => {
    const harness = await open('/cgv');
    requested();

    const segments = [
      ...(harness.routeNativeElement?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []),
    ];
    expect(segments).toHaveLength(2);
    segments[1]?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/cgv?pour=pro');
    expect(requested()).toBe('salesTermsPro');
  });
});
