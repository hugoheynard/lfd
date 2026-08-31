import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CatalogOverviewView } from '@lfd/pim-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogueOverviewHttpApi } from '../catalogue-overview-http-api';
import { CatalogueOverviewPage } from '../overview-page/overview-page';

/**
 * Ce que la synthèse PROMET, et qu'un coup d'œil ne vérifie pas : elle dit
 * quand le catalogue a bougé depuis la dernière ancre, et elle distingue « il
 * n'a pas bougé » de « il n'y a aucune ancre ». Les confondre annoncerait
 * « rien n'a changé » sur un catalogue jamais figé.
 */
function overview(over: Partial<CatalogOverviewView> = {}): CatalogOverviewView {
  return {
    products: 10,
    published: 7,
    drafts: 3,
    signed: 6,
    articles: 12,
    lastRevision: {
      id: 'rev_1',
      version: 4,
      label: 'rentrée',
      hash: 'h',
      takenAt: '2026-08-31T09:00:00.000Z',
      takenBy: 'staff_hugo',
      articles: 12,
    },
    sinceLastRevision: { added: 0, removed: 0, changed: 0 },
    ...over,
  };
}

function setup(view: CatalogOverviewView) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideRouter([]),
      { provide: CatalogueOverviewHttpApi, useValue: { read: vi.fn().mockResolvedValue(view) } },
    ],
  });
}

async function render(): Promise<HTMLElement> {
  const fixture = TestBed.createComponent(CatalogueOverviewPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function text(host: HTMLElement): string {
  return (host.textContent ?? '').replace(/\s+/gu, ' ');
}

describe('CatalogueOverviewPage', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('rend les chiffres du catalogue', async () => {
    setup(overview());

    const host = await render();
    expect(text(host)).toContain('Fiches');
    expect(text(host)).toContain('Révision 4');
    expect(text(host)).toContain('rentrée');
  });

  it('dit combien de fiches ne sont pas validées', async () => {
    setup(overview({ products: 10, signed: 6 }));

    expect(text(await render())).toContain('4 fiche(s) sans validation');
  });

  it('annonce que le catalogue a bougé, et de combien', async () => {
    setup(overview({ sinceLastRevision: { added: 1, removed: 0, changed: 2 } }));

    const rendu = text(await render());
    expect(rendu).toContain('Le catalogue a bougé depuis');
    expect(rendu).toContain('1 entré(s)');
    expect(rendu).toContain('2 modifié(s)');
  });

  it('dit qu’un push ne poserait rien quand rien n’a bougé', async () => {
    setup(overview({ sinceLastRevision: { added: 0, removed: 0, changed: 0 } }));

    expect(text(await render())).toContain("n'a pas bougé depuis");
  });

  /**
   * Sans ancre, il n'y a rien à soustraire : annoncer « rien n'a changé »
   * serait faux sur un catalogue jamais figé.
   */
  it('distingue « aucune ancre » de « rien n’a bougé »', async () => {
    setup(overview({ lastRevision: null, sinceLastRevision: null }));

    const rendu = text(await render());
    expect(rendu).toContain('Aucune révision posée');
    expect(rendu).not.toContain("n'a pas bougé depuis");
  });
});
