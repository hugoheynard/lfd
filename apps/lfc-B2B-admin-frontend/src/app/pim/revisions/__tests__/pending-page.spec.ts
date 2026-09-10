import { provideHttpClient } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CatalogPendingDiffView, CatalogRevisionSummaryView } from '@lfd/pim-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PendingDiffPage } from '../pending-page/pending-page';
import { RevisionsHttpApi } from '../revisions-http-api';
import { RevisionsStore } from '../revisions.store';

/**
 * Ce que cet écran promet, et qu'un coup d'œil ne suffit pas à vérifier :
 *
 * - les **comptes des segments sont les totaux**, pas ceux du filtre courant.
 *   Un chiffre qui bougerait sous les doigts ne dirait plus combien il y a, il
 *   dirait combien il en reste — la réponse à une autre question ;
 * - filtrer par auteur réduit un article à ses SEULES lignes de cet auteur.
 *   Garder les autres afficherait, sous « ce qu'a changé Hugo », des lignes que
 *   quelqu'un d'autre a écrites ;
 * - `from` à `null` n'est pas « rien n'a changé ».
 *
 * L'API est doublée ; le store est le vrai — c'est lui qui charge, et le
 * doubler ferait tester le doublon.
 */
const REFERENCE: CatalogRevisionSummaryView = {
  id: 'rev_1',
  reference: 'R-PUBLIE',
  label: 'rentrée',
  hash: 'h1',
  takenAt: '2026-08-31T09:00:00.000Z',
  takenBy: 'staff_hugo',
  articles: 12,
};

function field(over: Partial<{ field: string; by: string | null }> = {}) {
  return {
    field: 'priceCents',
    before: '600',
    after: '700',
    attributed: true,
    by: 'Hugo Heynard',
    at: '2026-08-31T10:00:00.000Z',
    cause: null,
    ...over,
  };
}

const DIFF: CatalogPendingDiffView = {
  from: REFERENCE,
  at: '2026-08-31T11:00:00.000Z',
  header: [],
  causes: [],
  added: ['NEW-001-1'],
  removed: [],
  changed: [
    { sku: 'CRO-001-1', fields: [field()] },
    { sku: 'PAI-002-1', fields: [field({ field: 'name', by: 'Cécile Martin' })] },
  ],
};

async function render(pending: CatalogPendingDiffView): Promise<ComponentFixture<PendingDiffPage>> {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideRouter([]),
      {
        provide: RevisionsHttpApi,
        useValue: {
          list: vi.fn().mockResolvedValue([]),
          take: vi.fn(),
          diff: vi.fn(),
          sinceLast: vi.fn().mockResolvedValue(pending),
        },
      },
    ],
  });
  // Le store est `providedIn: 'root'` : il survit d'un test à l'autre dans le
  // même fichier si on ne le redemande pas au TestBed courant.
  TestBed.inject(RevisionsStore);
  const fixture = TestBed.createComponent(PendingDiffPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<PendingDiffPage>): string =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/gu, ' ');

const skus = (fixture: ComponentFixture<PendingDiffPage>): readonly string[] =>
  [...(fixture.nativeElement as HTMLElement).querySelectorAll('.rd-sku')].map(
    (node) => node.textContent?.trim() ?? '',
  );

function pick(fixture: ComponentFixture<PendingDiffPage>, label: string): void {
  const found = [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      '[role="radio"], [role="option"]',
    ),
  ].find((candidate) => (candidate.textContent ?? '').includes(label));
  if (found === undefined) {
    throw new Error(`choix « ${label} » absent de l'écran`);
  }
  found.click();
}

describe('PendingDiffPage', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('dit contre quelle ancre publiée on compare', async () => {
    const shown = text(await render(DIFF));

    expect(shown).toContain('Depuis la dernière publication');
    expect(shown).toContain('R-PUBLIE');
    expect(shown).toContain('rentrée');
  });

  it('porte les comptes TOTAUX dans ses segments', async () => {
    const shown = text(await render(DIFF));

    expect(shown).toContain('Tout (3)');
    expect(shown).toContain('Modifiés (2)');
    expect(shown).toContain('Entrés (1)');
    expect(shown).toContain('Retirés (0)');
  });

  it("ne garde qu'une nature quand on choisit un segment", async () => {
    const fixture = await render(DIFF);

    pick(fixture, 'Entrés (1)');
    fixture.detectChanges();

    expect(skus(fixture)).toEqual([]);
    expect(text(fixture)).toContain('NEW-001-1');
    // Le compte du segment n'a PAS bougé : il dit combien il y en a.
    expect(text(fixture)).toContain('Modifiés (2)');
  });

  /**
   * 🔴 Le filtre d'auteur réduit l'article à ses SEULES lignes de cet auteur.
   * Garder les autres afficherait, sous « ce qu'a changé Hugo », des lignes que
   * quelqu'un d'autre a écrites — exactement ce qu'on vient chercher ici quand
   * on veut nommer une intention.
   */
  it("ne montre que les lignes de l'auteur choisi", async () => {
    const fixture = await render(DIFF);

    pick(fixture, 'Cécile Martin');
    fixture.detectChanges();

    expect(skus(fixture)).toEqual(['PAI-002-1']);
    expect(text(fixture)).not.toContain('CRO-001-1');
  });

  it("dit que le filtre a tout mangé, sans dire que rien n'a changé", async () => {
    const fixture = await render(DIFF);

    pick(fixture, 'Retirés (0)');
    fixture.detectChanges();

    const shown = text(fixture);
    expect(shown).toContain('Aucun changement ne correspond');
    // 🔴 Et surtout PAS la phrase du composant de rendu, qui parle de deux
    // révisions et contredirait celle-ci.
    expect(shown).not.toContain("Aucun article n'a changé entre ces deux révisions");
  });

  /**
   * `from` à `null` ne veut pas dire « rien n'a changé » : il n'y a rien à quoi
   * comparer. Les confondre ferait lire « catalogue à jour » d'un catalogue qui
   * n'est jamais parti.
   */
  it("distingue « rien à quoi comparer » de « rien n'a changé »", async () => {
    const shown = text(
      await render({
        from: null,
        at: '2026-08-31T11:00:00.000Z',
        header: [],
        causes: [],
        added: [],
        removed: [],
        changed: [],
      }),
    );

    expect(shown).toContain("il n'y a rien à quoi comparer");
    expect(shown).not.toContain("Le catalogue n'a pas bougé");
  });
});
