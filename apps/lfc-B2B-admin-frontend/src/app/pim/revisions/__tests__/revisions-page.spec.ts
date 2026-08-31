import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  CatalogRevisionDiffView,
  CatalogRevisionSummaryView,
  CatalogRevisionTakenView,
} from '@lfd/pim-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RevisionsHttpApi } from '../revisions-http-api';
import { RevisionsStore } from '../revisions.store';
import { RevisionsPage } from '../revisions-page/revisions-page';

/**
 * Ce que l'écran promet, et qu'un coup d'œil ne suffit pas à vérifier : poser
 * une ancre sur un catalogue inchangé ne crée RIEN, et l'écran doit le dire
 * plutôt que d'afficher un succès qui ferait croire à une version de plus.
 *
 * L'API est doublée ; le store est le vrai. C'est lui qui porte la règle du
 * message, et le doubler ferait tester le doublon.
 */
function revision(over: Partial<CatalogRevisionSummaryView> = {}): CatalogRevisionSummaryView {
  return {
    id: 'rev_2',
    version: 2,
    label: 'rentrée',
    hash: 'h2',
    takenAt: '2026-08-31T09:00:00.000Z',
    takenBy: 'staff_hugo',
    articles: 12,
    ...over,
  };
}

const EMPTY_DIFF: CatalogRevisionDiffView = {
  from: revision({ version: 1, id: 'rev_1', label: null, hash: 'h1' }),
  to: revision(),
  header: [],
  added: [],
  removed: [],
  changed: [],
};

function setup(options: {
  readonly list?: readonly CatalogRevisionSummaryView[];
  readonly take?: CatalogRevisionTakenView;
  readonly diff?: CatalogRevisionDiffView;
}) {
  const api = {
    list: vi.fn().mockResolvedValue(options.list ?? []),
    take: vi
      .fn()
      .mockResolvedValue(options.take ?? { id: 'r', version: 1, hash: 'h', created: true }),
    diff: vi.fn().mockResolvedValue(options.diff ?? EMPTY_DIFF),
  };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideRouter([]),
      { provide: RevisionsHttpApi, useValue: api },
    ],
  });
  // Le store est `providedIn: 'root'` : il survit d'un test à l'autre dans le
  // même fichier si on ne le redemande pas au TestBed courant.
  TestBed.inject(RevisionsStore);
  return api;
}

function render(): HTMLElement {
  const fixture = TestBed.createComponent(RevisionsPage);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function text(host: HTMLElement): string {
  return (host.textContent ?? '').replace(/\s+/gu, ' ');
}

describe('RevisionsPage', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('dit qu’il faut deux ancres avant de pouvoir comparer', async () => {
    setup({ list: [revision({ version: 1 })] });

    const host = render();
    await Promise.resolve();
    expect(text(host)).toContain('Il faut deux révisions pour comparer');
  });

  it('liste les ancres avec leur nom et leur portée', async () => {
    setup({ list: [revision(), revision({ id: 'rev_1', version: 1, label: null })] });
    // La page charge dans son constructeur : on laisse la microtâche se vider
    // avant de peindre, sinon on rend une liste que le store n'a pas encore.
    const fixture = TestBed.createComponent(RevisionsPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(text(host)).toContain('rentrée');
    expect(text(host)).toContain('12 articles');
    // Une ancre sans nom se DIT sans nom : un blanc se lirait comme une erreur
    // d'affichage.
    expect(text(host)).toContain('sans nom');
  });

  /**
   * **Le cas qui compte.** Le serveur rend `created: false` quand le catalogue
   * n'a pas bougé ; afficher « posée » ferait croire à une version de plus.
   */
  it('dit que rien n’a été posé quand le catalogue n’a pas bougé', async () => {
    setup({ take: { id: 'rev_2', version: 2, hash: 'h2', created: false } });

    await TestBed.inject(RevisionsStore).take('peu importe');

    expect(TestBed.inject(RevisionsStore).lastTake()).toBe(
      "Le catalogue n'a pas bougé depuis la révision 2 : rien n'a été posé.",
    );
  });

  it('annonce la révision posée quand il y en a une', async () => {
    setup({ take: { id: 'rev_3', version: 3, hash: 'h3', created: true } });

    await TestBed.inject(RevisionsStore).take('rentrée');

    expect(TestBed.inject(RevisionsStore).lastTake()).toBe('Révision 3 posée.');
  });

  /** Un nom fait de blancs n'est pas un nom : il part à `null`. */
  it('envoie `null` plutôt qu’un nom vide', async () => {
    const api = setup({});

    await TestBed.inject(RevisionsStore).take('   ');

    expect(api.take).toHaveBeenCalledWith(null);
  });
});
