import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ZONE_CLIENT_FRONT } from '@lfd/endpoints';

import { PieceHead } from '../piece-head';
import { TEST_ITEMS } from '../shop-catalogue.fixture';
import { renderMissingPieceHead, renderPieceHead } from './piece-page.render';

/**
 * L'app réécrit les balises que la Pages Function a injectées : elle doit
 * les METTRE À JOUR, pas en ajouter (Hugo, 2026-10-23).
 */
describe('PieceHead sur un en-tête déjà posé par la Function', () => {
  const croissant = TEST_ITEMS[0];
  const painAuChocolat = TEST_ITEMS[1];

  function pose(html: string): Document {
    const document = TestBed.inject(DOCUMENT);
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    document.head.innerHTML = parsed.head.innerHTML;
    return document;
  }

  function count(document: Document, selector: string): number {
    return document.head.querySelectorAll(selector).length;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PieceHead] });
  });

  it("n'en double aucune en ouvrant un autre article", () => {
    if (croissant === undefined || painAuChocolat === undefined) {
      throw new Error('fixture vide');
    }
    const origin = ZONE_CLIENT_FRONT;
    const document = pose(
      renderPieceHead(
        '<html><head><title>x</title></head><body></body></html>',
        {
          sku: croissant.sku,
          name: croissant.name,
          note: croissant.note,
          image: { url: '/a.jpg', alt: 'a', width: 10, height: 10 },
        },
        origin,
      ),
    );

    TestBed.inject(PieceHead).show(painAuChocolat);

    for (const selector of [
      'title',
      'meta[name="description"]',
      'link[rel="canonical"]',
      'meta[property="og:title"]',
      'meta[property="og:url"]',
      'meta[name="twitter:card"]',
    ]) {
      expect(count(document, selector)).toBe(1);
    }
    expect(document.title).toBe('Pain au chocolat — La Folie Coffee');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${origin}/boutique/article/VIE-002`,
    );
    // Le pain au chocolat n'a pas de visuel : l'image du croissant ne survit pas.
    expect(count(document, 'meta[property="og:image"]')).toBe(0);
    expect(count(document, 'meta[property^="og:image:"]')).toBe(0);
  });

  it('un seul noindex quand l’app constate elle aussi l’absence', () => {
    const document = pose(renderMissingPieceHead('<html><head></head><body></body></html>'));

    TestBed.inject(PieceHead).missing();

    expect(count(document, 'meta[name="robots"]')).toBe(1);
  });
});
