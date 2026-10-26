import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PublishedLegalDocumentView } from '@lfd/contracts';
import type { CustomerAudience } from '@lfd/contracts/shop-values';
import { describe, expect, it } from 'vitest';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { ClientAudience } from '../client-audience.service';
import { SalesTermsConsent } from './sales-terms-consent.service';

function boot(audience: CustomerAudience = 'b2c') {
  const shown = signal<CustomerAudience>(audience);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: ClientAudience, useValue: { shown } },
    ],
  });
  return {
    consent: TestBed.inject(SalesTermsConsent),
    http: TestBed.inject(HttpTestingController),
    shown,
  };
}

function view(revision: number): PublishedLegalDocumentView {
  return {
    content: { title: { fr: 'CGV', en: 'Terms', it: 'CGV' }, paragraphs: [] },
    revision,
    updatedAt: '1970-01-01T00:00:00.000Z',
    updatedBy: null,
    pdf: null,
  };
}

const URL_OF = (key: string): string => `${AUTH_CONFIG.apiBaseUrl}/content/legal/${key}`;

describe('SalesTermsConsent — la case des CGV du panier', () => {
  it('retient le bouton tant que le texte se lit', () => {
    const { consent, http } = boot();

    consent.load();

    expect(consent.blocking()).toBe(true);
    http.expectOne(URL_OF('salesTerms')).flush(view(3));
    expect(consent.asked()).toBe(true);
    expect(consent.blocking()).toBe(true);
  });

  it('cochée, envoie le texte et la révision lus avec lui', () => {
    const { consent, http } = boot();
    consent.load();
    http.expectOne(URL_OF('salesTerms')).flush(view(3));

    consent.check(true);

    expect(consent.blocking()).toBe(false);
    expect(consent.accepted()).toEqual({ key: 'salesTerms', revision: 3 });
  });

  it('une clientèle pro lit et coche les CGV pro', () => {
    const { consent, http } = boot('b2b');
    consent.load();
    http.expectOne(URL_OF('salesTermsPro')).flush(view(2));

    consent.check(true);

    expect(consent.accepted()).toEqual({ key: 'salesTermsPro', revision: 2 });
    expect(consent.pageQuery()).toEqual({ pour: 'pro' });
  });

  it('sans texte publié (révision 0) : pas de case, rien de retenu, `null` envoyé', () => {
    const { consent, http } = boot('b2b');
    consent.load();
    http.expectOne(URL_OF('salesTermsPro')).flush(view(0));

    expect(consent.asked()).toBe(false);
    expect(consent.blocking()).toBe(false);
    expect(consent.accepted()).toBeNull();
  });

  it('une bascule de clientèle décoche : la case portait une AUTRE version', () => {
    const { consent, http, shown } = boot();
    consent.load();
    http.expectOne(URL_OF('salesTerms')).flush(view(3));
    consent.check(true);

    shown.set('b2b');
    consent.load();
    http.expectOne(URL_OF('salesTermsPro')).flush(view(1));

    expect(consent.checked()).toBe(false);
    expect(consent.accepted()).toBeNull();
  });

  it('au 409 : décoche, relit le texte, et le dit jusqu’à la prochaine coche', () => {
    const { consent, http } = boot();
    consent.load();
    http.expectOne(URL_OF('salesTerms')).flush(view(3));
    consent.check(true);

    consent.renew();

    expect(consent.outdated()).toBe(true);
    expect(consent.checked()).toBe(false);
    http.expectOne(URL_OF('salesTerms')).flush(view(4));
    consent.check(true);
    expect(consent.outdated()).toBe(false);
    expect(consent.accepted()).toEqual({ key: 'salesTerms', revision: 4 });
  });
});
