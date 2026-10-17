import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CatalogOverviewView } from '@lfd/pim-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogueOverviewHttpApi } from '../catalogue-overview-http-api';
import { CatalogueOverviewPage } from '../overview-page/overview-page';

/**
 * Ce que la synthèse PROMET : les chiffres du catalogue, et rien sur « la
 * dernière publication » — ce repère est parti le 2026-10-17.
 */
function overview(over: Partial<CatalogOverviewView> = {}): CatalogOverviewView {
  return {
    products: 10,
    published: 7,
    drafts: 3,
    signed: 6,
    articles: 12,
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
    expect(text(host)).toContain('Articles');
  });

  it('dit combien de fiches ne sont pas validées', async () => {
    setup(overview({ products: 10, signed: 6 }));

    expect(text(await render())).toContain('4 fiche(s) sans validation');
  });

  /**
   * Régression : l'écran comptait « depuis la dernière publication » ce que le
   * push n'avait pas encore envoyé ; le push parti, ce compte était figé sur le
   * dernier push (retiré le 2026-10-17).
   */
  it('ne parle plus de la dernière publication', async () => {
    setup(overview());

    const rendu = text(await render());
    expect(rendu).not.toContain('dernière publication');
    expect(rendu).not.toContain('a bougé');
  });
});
