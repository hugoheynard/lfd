import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { LegalDocumentView } from '@lfd/contracts';
import type { SalesTermsDocument } from '@lfd/contracts/content-values';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { FR } from '../copy/fr';
import type { SalesTermsSide } from '../sales-terms-side';
import { SalesTermsReader } from './sales-terms-reader';

const textUrl = (document: SalesTermsDocument): string =>
  `${AUTH_CONFIG.apiBaseUrl}/content/legal/${document}`;
const pdfUrl = (document: SalesTermsDocument): string => `${textUrl(document)}/pdf`;

const prose = (title: string, body: string) => ({ title, body });

/** Un texte d'un article — le corps nomme son côté, pour qu'on ne les confonde pas. */
const view = (title: string, body: string | null): LegalDocumentView => ({
  content: {
    title: { fr: title, en: title, it: title },
    paragraphs:
      body === null
        ? []
        : [{ id: 'p1', fr: prose('Objet', body), en: prose('EN', 'EN'), it: prose('IT', 'IT') }],
  },
  revision: body === null ? 0 : 2,
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: null,
});

const PARTICULIER = view('CGV particuliers', 'Le droit de rétractation de quatorze jours.');
const PRO = view('CGV professionnelles', 'Les pénalités de retard.');

describe('les CGV, d’un côté ou de l’autre', () => {
  let fixture: ComponentFixture<SalesTermsReader>;
  let http: HttpTestingController;
  let chosen: SalesTermsSide[];

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';
  const pdfLink = (): HTMLAnchorElement | null => el().querySelector('a[foldButton]');

  const mount = (side: SalesTermsSide): void => {
    fixture = TestBed.createComponent(SalesTermsReader);
    chosen = [];
    fixture.componentInstance.sideChange.subscribe((next) => chosen.push(next));
    fixture.componentRef.setInput('side', side);
    fixture.detectChanges();
  };

  /** Répond au texte et à la sonde du PDF de ce texte. */
  const serve = (
    document: SalesTermsDocument,
    content: LegalDocumentView,
    pdf: 'present' | 'absent',
  ): void => {
    http.expectOne(textUrl(document)).flush(content);
    const probe = http.expectOne(pdfUrl(document));
    expect(probe.request.method).toBe('HEAD');
    if (pdf === 'present') {
      probe.flush(null);
    } else {
      probe.flush(null, { status: 404, statusText: 'Not Found' });
    }
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SalesTermsReader],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('côté particulier, lit le texte particulier', () => {
    mount('particulier');
    serve('salesTerms', PARTICULIER, 'absent');

    expect(text()).toContain('Le droit de rétractation de quatorze jours.');
  });

  it('côté pro, lit le texte pro — et ne demande jamais le texte particulier', () => {
    mount('pro');
    serve('salesTermsPro', PRO, 'absent');

    expect(text()).toContain('Les pénalités de retard.');
    expect(text()).not.toContain('rétractation');
  });

  /**
   * 🔴 Des CGV pro sans article ne se remplacent pas par les CGV
   * particuliers : un pro y lirait un droit qu'il n'a pas (plan, C2 (b)).
   */
  it('des CGV pro pas encore rédigées disent « en cours de rédaction »', () => {
    mount('pro');
    serve('salesTermsPro', view('CGV professionnelles', null), 'absent');

    expect(el().querySelector('fold-empty-state')).not.toBeNull();
    expect(text()).toContain(FR.legalDocument.salesTerms.proDraftTitle);
    expect(text()).not.toContain(FR.legalDocument.emptyTitle);
    // Aucune lecture du texte particulier n'est partie (`verify` le tient aussi).
    expect(http.match(textUrl('salesTerms'))).toHaveLength(0);
  });

  it('un texte particulier sans article garde l’état vide des mentions', () => {
    mount('particulier');
    serve('salesTerms', view('CGV particuliers', null), 'absent');

    expect(text()).toContain(FR.legalDocument.emptyTitle);
    expect(text()).not.toContain(FR.legalDocument.salesTerms.proDraftTitle);
  });

  it('sans PDF en vigueur, ni bouton ni ligne de référence', () => {
    mount('particulier');
    serve('salesTerms', PARTICULIER, 'absent');

    expect(pdfLink()).toBeNull();
    expect(text()).not.toContain(FR.legalDocument.salesTerms.downloadPdf);
    expect(text()).not.toContain(FR.legalDocument.salesTerms.pdfReference);
  });

  it('avec un PDF, le bouton tend le PDF du côté affiché, avec sa ligne', () => {
    mount('pro');
    serve('salesTermsPro', PRO, 'present');

    expect(pdfLink()?.textContent).toContain(FR.legalDocument.salesTerms.downloadPdf);
    expect(pdfLink()?.getAttribute('href')).toBe(pdfUrl('salesTermsPro'));
    expect(text()).toContain(FR.legalDocument.salesTerms.pdfReference);
  });

  it('le switch annonce le côté choisi, sans décider où il se garde', () => {
    mount('particulier');
    serve('salesTerms', PARTICULIER, 'absent');

    const segments = [...el().querySelectorAll<HTMLElement>('fold-view-toggle [role="radio"]')];
    expect(segments.map((segment) => segment.textContent?.trim())).toEqual([
      FR.legalDocument.salesTerms.sideParticulier,
      FR.legalDocument.salesTerms.sidePro,
    ]);
    segments[1]?.click();

    expect(chosen).toEqual(['pro']);
  });

  it('change de texte quand l’hôte change de côté', () => {
    mount('particulier');
    serve('salesTerms', PARTICULIER, 'absent');

    fixture.componentRef.setInput('side', 'pro');
    fixture.detectChanges();
    serve('salesTermsPro', PRO, 'present');

    expect(text()).toContain('Les pénalités de retard.');
    expect(pdfLink()?.getAttribute('href')).toBe(pdfUrl('salesTermsPro'));
  });

  it('dit l’échec de lecture et le rejoue', () => {
    mount('particulier');
    http.expectOne(textUrl('salesTerms')).flush('nope', { status: 500, statusText: 'Error' });
    http.expectOne(pdfUrl('salesTerms')).flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(el().querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
    el().querySelector<HTMLButtonElement>('fold-empty-state button')?.click();
    fixture.detectChanges();

    http.expectOne(textUrl('salesTerms')).flush(PARTICULIER);
    fixture.detectChanges();
    expect(text()).toContain('Le droit de rétractation de quatorze jours.');
  });
});
