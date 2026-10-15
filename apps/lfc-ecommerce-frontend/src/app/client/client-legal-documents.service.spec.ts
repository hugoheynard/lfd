import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { LegalDocumentView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AUTH_CONFIG } from '../auth/auth.config';
import { ClientLegalDocuments } from './client-legal-documents.service';

function boot(): { documents: ClientLegalDocuments; http: HttpTestingController } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: 'browser' },
    ],
  });
  return {
    documents: TestBed.inject(ClientLegalDocuments),
    http: TestBed.inject(HttpTestingController),
  };
}

/**
 * Plan `legal/plan-cgv-par-audience.md` : les CGV pro sont publiques, à leur
 * propre adresse, et leur PDF aussi. Les pages qui les montrent viendront au
 * lot de la boutique ; le service, lui, sait déjà les lire.
 */
describe('ClientLegalDocuments — les CGV professionnelles', () => {
  it('lit les CGV pro par la route publique, à leur clé', () => {
    const { documents, http } = boot();

    documents.ensureLoaded('salesTermsPro');

    const request = http.expectOne(`${AUTH_CONFIG.apiBaseUrl}/content/legal/salesTermsPro`);
    const view: LegalDocumentView = {
      content: {
        title: { fr: 'CGV pro', en: 'Pro terms', it: 'CGV pro' },
        paragraphs: [],
      },
      revision: 0,
      updatedAt: '1970-01-01T00:00:00.000Z',
      updatedBy: null,
    };
    request.flush(view);
    expect(documents.statusOf('salesTermsPro')).toBe('ready');
    // Jamais rédigées : leur titre, aucun article — « en cours de rédaction ».
    expect(documents.articlesOf('salesTermsPro')).toEqual([]);
    http.verify();
  });

  it('a un titre avant toute réponse, distinct de celui des CGV particuliers', () => {
    const { documents } = boot();

    expect(documents.titleOf('salesTermsPro')).not.toBe(documents.titleOf('salesTerms'));
  });

  it('donne l’adresse publique du PDF en vigueur de chaque texte', () => {
    const { documents } = boot();

    expect(documents.pdfUrlOf('salesTerms')).toBe(
      `${AUTH_CONFIG.apiBaseUrl}/content/legal/salesTerms/pdf`,
    );
    expect(documents.pdfUrlOf('salesTermsPro')).toBe(
      `${AUTH_CONFIG.apiBaseUrl}/content/legal/salesTermsPro/pdf`,
    );
  });
});
