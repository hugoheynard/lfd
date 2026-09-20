import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { AllergenCategoryAdminView } from '@lfd/pim-contracts';
import { FoldInputComponent, FoldNumberInputComponent, FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { AllergenCategoryPanel } from '../allergen-category-panel/allergen-category-panel';
import { AllergenEntryPanel } from '../allergen-entry-panel/allergen-entry-panel';
import { AllergenStore } from '../allergen-store';
import { AllergensPage } from '../allergens-page/allergens-page';

/**
 * Ce que cet écran doit rendre lisible, et que rien d'autre ne vérifie :
 *
 * 1. **l'officiel ne s'édite pas, et on dit pourquoi** — un bouton absent sans
 *    mot se lit comme une panne, et un bouton qui répondrait 409 est pire ;
 * 2. **l'archivé reste visible avec son geste de retour** — c'est le seul écran
 *    d'où l'on restaure, et une ligne masquée est une ligne perdue ;
 * 3. **on n'écrit que ce qui a bougé** — sinon le journal consigne un renommage
 *    que personne n'a fait, sur une donnée qu'on relit pour comprendre une
 *    étiquette.
 */

/** « Il a été archivé il y a peu » — jamais un jour du calendrier (CLAUDE.md §5). */
const ARCHIVED_AT = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

const GLUTEN: AllergenCategoryAdminView = {
  id: 'alg_cat_gluten',
  key: 'gluten',
  name: { fr: 'Céréales contenant du gluten' },
  incoCategory: 'gluten',
  official: true,
  position: 1,
  archivedAt: null,
  entries: [
    { id: 'alg_UW', code: 'UW', name: { fr: 'Blé' }, official: true, archivedAt: null },
    { id: 'alg_UR', code: 'UR', name: { fr: 'Seigle' }, official: true, archivedAt: null },
  ],
};

const HOUSE: AllergenCategoryAdminView = {
  id: 'cat_exotiques',
  key: 'exotiques',
  name: { fr: 'Fruits à coque exotiques' },
  incoCategory: null,
  official: false,
  position: 100,
  archivedAt: null,
  entries: [
    {
      id: 'ent_macadamia',
      code: 'MACADAMIA',
      name: { fr: 'Macadamia' },
      official: false,
      archivedAt: ARCHIVED_AT,
    },
  ],
};

interface StoreDouble {
  readonly restoreEntry: ReturnType<typeof vi.fn>;
  readonly restoreCategory: ReturnType<typeof vi.fn>;
  readonly renameCategory: ReturnType<typeof vi.fn>;
  readonly moveCategory: ReturnType<typeof vi.fn>;
  readonly reviseEntry: ReturnType<typeof vi.fn>;
}

function storeDouble(options: {
  readonly categories?: readonly AllergenCategoryAdminView[];
  readonly loadError?: string | null;
  readonly firstLoad?: boolean;
}): StoreDouble & Record<string, unknown> {
  const categories = signal(options.categories ?? [GLUTEN, HOUSE]);
  return {
    categories,
    livingCategories: signal(
      (options.categories ?? [GLUTEN, HOUSE]).filter((row) => row.archivedAt === null),
    ),
    loadError: signal(options.loadError ?? null),
    firstLoad: signal(options.firstLoad ?? false),
    reload: vi.fn().mockResolvedValue(undefined),
    restoreEntry: vi.fn().mockResolvedValue(undefined),
    restoreCategory: vi.fn().mockResolvedValue(undefined),
    renameCategory: vi.fn().mockResolvedValue(undefined),
    moveCategory: vi.fn().mockResolvedValue(undefined),
    reviseEntry: vi.fn().mockResolvedValue(undefined),
  };
}

function renderPage(options: {
  readonly canWrite?: boolean;
  readonly categories?: readonly AllergenCategoryAdminView[];
  readonly loadError?: string | null;
  readonly firstLoad?: boolean;
}): { element: HTMLElement; store: StoreDouble } {
  const store = storeDouble(options);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      { provide: AllergenStore, useValue: store },
      { provide: PermissionsStore, useValue: { can: () => options.canWrite !== false } },
    ],
  });
  const fixture = TestBed.createComponent(AllergensPage);
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement, store };
}

/** Le bouton portant ce libellé — on pilote l'écran, pas ses champs privés. */
function buttons(root: HTMLElement, label: string): readonly HTMLButtonElement[] {
  return [...root.querySelectorAll('button')].filter((found) =>
    (found.textContent ?? '').includes(label),
  );
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = buttons(root, label)[0];
  if (found === undefined) {
    throw new Error(`Bouton « ${label} » introuvable.`);
  }
  return found;
}

describe('AllergensPage — les deux populations', () => {
  it('range les entrées SOUS leur catégorie, jamais à plat', () => {
    const { element } = renderPage({});

    const cards = element.querySelectorAll('fold-card');
    expect(cards).toHaveLength(2);
    // Le mapping est n:1 : les deux céréales appartiennent à la carte du gluten.
    const gluten = cards[0]?.textContent ?? '';
    expect(gluten).toContain('UW');
    expect(gluten).toContain('UR');
    expect(gluten).not.toContain('MACADAMIA');
  });

  it("signale l'officiel par un cadenas ET sa raison, pas par un bouton absent", () => {
    const { element } = renderPage({});

    expect(element.textContent).toContain('Inaltérable');
    expect(element.textContent).toContain('Officiel');
    // La raison est atteignable : le « i » de la carte officielle la porte.
    const reasons = element.querySelectorAll('fold-info');
    expect(reasons.length).toBeGreaterThan(0);
    // Et l'officiel n'offre que le rang : « Ranger », jamais « Régler ».
    expect(buttons(element, 'Ranger')).toHaveLength(1);
    expect(buttons(element, 'Régler')).toHaveLength(1);
  });

  it("n'offre aucun geste d'écriture sans le droit", () => {
    const { element } = renderPage({ canWrite: false });

    expect(buttons(element, 'Ajouter')).toHaveLength(0);
    expect(buttons(element, 'Restaurer')).toHaveLength(0);
    expect(buttons(element, 'Régler')).toHaveLength(0);
    // Le cadenas, lui, reste : l'explication ne dépend pas du droit d'écrire.
    expect(element.textContent).toContain('Inaltérable');
  });
});

describe('AllergensPage — un archivé n’est pas un supprimé', () => {
  it('le laisse visible, distingué, avec son geste de retour', async () => {
    const { element, store } = renderPage({});

    expect(element.textContent).toContain('MACADAMIA');
    expect(element.textContent).toContain('Archivé');

    button(element, 'Restaurer').click();
    await Promise.resolve();

    expect(store.restoreEntry).toHaveBeenCalledWith('ent_macadamia');
  });
});

describe('AllergensPage — les quatre états passent par fold', () => {
  it('annonce la première lecture par fold-loading, et rien d’autre', () => {
    const { element } = renderPage({ firstLoad: true, categories: [] });

    expect(element.querySelector('fold-loading')).not.toBeNull();
    expect(element.querySelector('fold-empty-state')).toBeNull();
  });

  it('distingue « illisible » de « vide » par le ton, pas par une mise en page', () => {
    const { element } = renderPage({ categories: [], loadError: 'Le service est injoignable.' });

    const empty = element.querySelector('fold-empty-state');
    expect(empty?.textContent).toContain('Référentiel illisible');
    expect(empty?.textContent).toContain('Le service est injoignable.');
  });

  it('garde le contenu à l’écran sur un échec PARTIEL, dans un callout', () => {
    const { element } = renderPage({ loadError: 'Lecture refusée.' });

    expect(element.querySelector('fold-callout[role="alert"]')?.textContent).toContain(
      'Lecture refusée.',
    );
    expect(element.querySelectorAll('fold-card')).toHaveLength(2);
  });
});

function renderCategoryPanel(category: AllergenCategoryAdminView): {
  element: HTMLElement;
  store: StoreDouble;
  numberInput: FoldNumberInputComponent;
  detect: () => void;
} {
  const store = storeDouble({});
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      { provide: AllergenStore, useValue: store },
      { provide: FoldPanelRef, useValue: { close: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(AllergenCategoryPanel);
  fixture.componentRef.setInput('data', { category });
  fixture.detectChanges();
  const found = fixture.debugElement.query(By.directive(FoldNumberInputComponent));
  return {
    element: fixture.nativeElement as HTMLElement,
    store,
    numberInput: found.componentInstance as FoldNumberInputComponent,
    detect: () => {
      fixture.detectChanges();
    },
  };
}

describe('AllergenCategoryPanel — le droit ne se renomme pas', () => {
  it("n'ouvre que le rang d'une catégorie officielle", async () => {
    const { element, store, numberInput, detect } = renderCategoryPanel(GLUTEN);

    // Le libellé est une mention légale : le champ est lu, et la raison est là.
    const labelInput = [...element.querySelectorAll('input')].find(
      (found) => found.value === 'Céréales contenant du gluten',
    );
    expect(labelInput?.disabled).toBe(true);
    expect(element.textContent).toContain('Catégorie officielle');
    // Archiver du droit, ce serait le supprimer : le geste n'existe pas ici.
    expect(buttons(element, 'Archiver')).toHaveLength(0);

    numberInput.value.set(4);
    detect();
    button(element, 'Enregistrer').click();
    await Promise.resolve();

    expect(store.moveCategory).toHaveBeenCalledWith('alg_cat_gluten', 4);
    expect(store.renameCategory).not.toHaveBeenCalled();
  });

  it("n'enregistre rien tant que rien n'a bougé", () => {
    const { element } = renderCategoryPanel(HOUSE);

    expect(button(element, 'Enregistrer').disabled).toBe(true);
  });
});

function renderEntryPanel(
  category: AllergenCategoryAdminView,
  index: number,
): { element: HTMLElement; store: StoreDouble; nameInput: FoldInputComponent; detect: () => void } {
  const store = storeDouble({});
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      { provide: AllergenStore, useValue: store },
      { provide: FoldPanelRef, useValue: { close: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(AllergenEntryPanel);
  fixture.componentRef.setInput('data', {
    categoryId: category.id,
    entry: category.entries[index],
  });
  fixture.detectChanges();
  const inputs = fixture.debugElement.queryAll(By.directive(FoldInputComponent));
  return {
    element: fixture.nativeElement as HTMLElement,
    store,
    // [0] = le code (identité, lue), [1] = le libellé.
    nameInput: inputs[1]?.componentInstance as FoldInputComponent,
    detect: () => {
      fixture.detectChanges();
    },
  };
}

describe('AllergenEntryPanel — le maison se révise, le GS1 se lit', () => {
  it("n'offre pas d'enregistrement sur un code officiel, et dit pourquoi", () => {
    const { element } = renderEntryPanel(GLUTEN, 0);

    expect(buttons(element, 'Enregistrer')).toHaveLength(0);
    expect(buttons(element, 'Fermer')).toHaveLength(1);
    expect(element.textContent).toContain('Code GS1 officiel');
  });

  it("n'envoie que ce qui a bougé — un champ absent vaut « ne touche pas à ça »", async () => {
    const { element, store, nameInput, detect } = renderEntryPanel(HOUSE, 0);

    nameInput.value.set('Noix de Macadamia');
    detect();
    button(element, 'Enregistrer').click();
    await Promise.resolve();

    expect(store.reviseEntry).toHaveBeenCalledWith('ent_macadamia', {
      name: { fr: 'Noix de Macadamia' },
    });
  });
});
