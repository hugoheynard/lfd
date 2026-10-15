import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { LegalDocumentView } from '@lfd/contracts';
import type { CustomerAudience } from '@lfd/contracts/shop-values';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { ClientAudience } from '../client-audience.service';
import { SalesTermsPanel } from './sales-terms-panel';

const textUrl = (document: string): string => `${AUTH_CONFIG.apiBaseUrl}/content/legal/${document}`;

const titled = (title: string): LegalDocumentView => ({
  content: { title: { fr: title, en: title, it: title }, paragraphs: [] },
  revision: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: null,
});

describe('le dialogue des CGV', () => {
  let fixture: ComponentFixture<SalesTermsPanel>;
  let http: HttpTestingController;
  let audience: ReturnType<typeof signal<CustomerAudience | null>>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (initial: CustomerAudience | null): void => {
    TestBed.resetTestingModule();
    audience = signal(initial);
    TestBed.configureTestingModule({
      imports: [SalesTermsPanel],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ClientAudience, useValue: { current: audience } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SalesTermsPanel);
    fixture.detectChanges();
  };

  afterEach(() => {
    http.match((req) => req.method === 'HEAD');
    http.verify();
  });

  it('s’ouvre côté particulier pour un visiteur', () => {
    mount('b2c');
    http.expectOne(textUrl('salesTerms')).flush(titled('CGV particuliers'));
    fixture.detectChanges();

    expect(el().querySelector('fold-panel-header')?.textContent).toContain('CGV particuliers');
  });

  it('s’ouvre côté pro pour une clientèle pro', () => {
    mount('b2b');
    http.expectOne(textUrl('salesTermsPro')).flush(titled('CGV professionnelles'));
    fixture.detectChanges();

    expect(el().querySelector('fold-panel-header')?.textContent).toContain('CGV professionnelles');
  });

  it('passe côté pro quand la clientèle se révèle après l’ouverture', () => {
    mount(null);
    http.expectOne(textUrl('salesTerms')).flush(titled('CGV particuliers'));

    audience.set('b2b');
    fixture.detectChanges();

    http.expectOne(textUrl('salesTermsPro')).flush(titled('CGV professionnelles'));
  });

  it('le switch bascule le texte, sans quitter le dialogue', () => {
    mount('b2c');
    http.expectOne(textUrl('salesTerms')).flush(titled('CGV particuliers'));
    fixture.detectChanges();

    el().querySelectorAll<HTMLElement>('[role="radio"]')[1]?.click();
    fixture.detectChanges();

    http.expectOne(textUrl('salesTermsPro')).flush(titled('CGV professionnelles'));
    fixture.detectChanges();
    expect(el().querySelector('fold-panel-header')?.textContent).toContain('CGV professionnelles');
  });
});
