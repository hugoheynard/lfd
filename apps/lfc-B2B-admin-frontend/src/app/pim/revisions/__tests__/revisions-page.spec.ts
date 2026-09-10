import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  CatalogPendingDiffView,
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
    reference: 'R-TEST2',
    label: 'rentrée',
    note: null,
    hash: 'h2',
    takenAt: '2026-08-31T09:00:00.000Z',
    takenBy: 'staff_hugo',
    articles: 12,
    ...over,
  };
}

const EMPTY_DIFF: CatalogRevisionDiffView = {
  from: revision({ reference: 'R-TEST1', id: 'rev_1', label: null, hash: 'h1' }),
  to: revision(),
  header: [],
  causes: [],
  added: [],
  removed: [],
  changed: [],
};

const NO_PENDING: CatalogPendingDiffView = {
  from: null,
  at: '2026-08-31T10:00:00.000Z',
  header: [],
  causes: [],
  added: [],
  removed: [],
  changed: [],
};

function setup(options: {
  readonly list?: readonly CatalogRevisionSummaryView[];
  readonly take?: CatalogRevisionTakenView;
  readonly diff?: CatalogRevisionDiffView;
  readonly pending?: CatalogPendingDiffView;
}) {
  const api = {
    list: vi.fn().mockResolvedValue(options.list ?? []),
    take: vi
      .fn()
      .mockResolvedValue(
        options.take ?? { id: 'r', reference: 'R-TEST1', hash: 'h', label: null, created: true },
      ),
    diff: vi.fn().mockResolvedValue(options.diff ?? EMPTY_DIFF),
    name: vi.fn().mockResolvedValue(undefined),
    sinceLast: vi.fn().mockResolvedValue(options.pending ?? NO_PENDING),
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
    setup({ list: [revision({ reference: 'R-TEST01' })] });

    const host = render();
    await Promise.resolve();
    expect(text(host)).toContain('Il faut deux révisions pour comparer');
  });

  it('liste les ancres avec leur nom et leur portée', async () => {
    setup({ list: [revision(), revision({ id: 'rev_1', reference: 'R-TEST1', label: null })] });
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
    setup({ take: { id: 'rev_2', reference: 'R-TEST2', hash: 'h2', label: null, created: false } });

    await TestBed.inject(RevisionsStore).take('peu importe');

    expect(TestBed.inject(RevisionsStore).lastTake()).toBe(
      "Le catalogue n'a pas bougé depuis R-TEST2 : rien n'a été préparé.",
    );
  });

  it('annonce la révision posée quand il y en a une', async () => {
    setup({ take: { id: 'rev_3', reference: 'R-TEST3', hash: 'h3', label: null, created: true } });

    await TestBed.inject(RevisionsStore).take('rentrée');

    expect(TestBed.inject(RevisionsStore).lastTake()).toBe('Révision R-TEST3 préparée.');
  });

  /** Un nom fait de blancs n'est pas un nom : il part à `null`. */
  it('envoie `null` plutôt qu’un nom vide', async () => {
    const api = setup({});

    await TestBed.inject(RevisionsStore).take('   ');

    expect(api.take).toHaveBeenCalledWith(null);
  });

  /**
   * 🔴 **Le détail se demande, il ne s'affiche pas d'office.**
   *
   * Il charge un payload par article modifié et interroge le journal produit
   * par produit ; la liste des ancres ne coûte qu'une requête. Le faire au
   * chargement ferait payer ce prix à qui vient seulement comparer deux ancres.
   */
  it("ne demande PAS le détail vivant tant qu'on ne l'a pas réclamé", async () => {
    const api = setup({ list: [revision()] });
    const fixture = TestBed.createComponent(RevisionsPage);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.sinceLast).not.toHaveBeenCalled();
    expect(text(fixture.nativeElement as HTMLElement)).toContain('Voir ce qui a changé');
  });

  /**
   * Le détail vivant a sa PROPRE page depuis qu'il porte des filtres : ici on
   * ne tient plus que le chemin qui y mène. Ce qu'il montre est éprouvé dans
   * `pending-page.spec.ts`.
   */
  it('mène au détail vivant sans le charger', async () => {
    const api = setup({ list: [revision()] });
    const fixture = TestBed.createComponent(RevisionsPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const link = [...host.querySelectorAll('a')].find((candidate) =>
      (candidate.textContent ?? '').includes('Voir ce qui a changé'),
    );
    expect(link?.getAttribute('href')).toBe('/pim/revisions/en-attente');
    expect(api.sinceLast).not.toHaveBeenCalled();
  });

  /**
   * 🔴 **Une ancre muette se répare sur sa ligne**, et rien ne lui invente un
   * nom. Le push a longtemps posé des ancres anonymes ; « sans nom » est donc
   * un fait à afficher, et le geste de réparation doit être là où on le lit.
   */
  it('offre de nommer une ancre restée muette, et pas les autres', async () => {
    setup({
      list: [
        revision({ reference: 'R-NOMMEE' }),
        revision({ id: 'rev_1', reference: 'R-MUETTE', label: null }),
      ],
    });
    const fixture = TestBed.createComponent(RevisionsPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const boutons = [...host.querySelectorAll('button')].filter((candidate) =>
      (candidate.getAttribute('aria-label') ?? '').startsWith('Nommer la révision'),
    );
    expect(boutons).toHaveLength(1);
    expect(boutons[0]?.getAttribute('aria-label')).toContain('R-MUETTE');
    expect(text(host)).toContain('sans nom');
  });

  it("envoie le nom saisi, sur l'ancre qu'on nomme", async () => {
    const api = setup({ list: [revision({ id: 'rev_1', reference: 'R-MUETTE', label: null })] });
    const fixture = TestBed.createComponent(RevisionsPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const ouvrir = [...host.querySelectorAll('button')].find((candidate) =>
      (candidate.getAttribute('aria-label') ?? '').startsWith('Nommer la révision'),
    );
    ouvrir?.click();
    fixture.detectChanges();

    const champ = host.querySelector('.rp-naming input');
    if (!(champ instanceof HTMLInputElement)) {
      throw new Error("Le champ de nom ne s'est pas ouvert.");
    }
    champ.value = 'correction des allergènes';
    champ.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const valider = [...host.querySelectorAll('.rp-naming button')].find(
      (candidate) => candidate.textContent?.trim() === 'Nommer',
    );
    (valider as HTMLButtonElement | undefined)?.click();
    await fixture.whenStable();

    expect(api.name).toHaveBeenCalledWith('R-MUETTE', 'correction des allergènes');
  });
});
