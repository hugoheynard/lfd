import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { AllergenEntry, AllergenReference, IngredientView } from '@lfd/pim-contracts';
import { FoldMultiselectComponent, FoldPanelRef, isFoldSelectOptionGroup } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { ReferenceApi } from '../../catalogue/reference-api';
import { API_BASE_URL } from '../../data/api';
import { IngredientPanel } from '../ingredient-panel/ingredient-panel';
import { IngredientsPage } from '../ingredients-page/ingredients-page';
import { ProvenanceStore } from '../provenance.store';

/**
 * Un extrait FIDÈLE du catalogue `world` : deux catégories qui groupent (le
 * gluten et ses céréales, les fruits à coque), deux qui n'ont qu'une entrée, et
 * le seau hors obligation UE. C'est exactement la forme sur laquelle la règle
 * de groupement se décide.
 */
const WORLD: readonly AllergenEntry[] = [
  { code: 'UW', label: 'Blé', incoCategory: 'gluten', incoLabel: 'Céréales contenant du gluten' },
  {
    code: 'NR',
    label: 'Seigle',
    incoCategory: 'gluten',
    incoLabel: 'Céréales contenant du gluten',
  },
  { code: 'SA', label: 'Amandes', incoCategory: 'tree_nuts', incoLabel: 'Fruits à coque' },
  { code: 'SH', label: 'Noisettes', incoCategory: 'tree_nuts', incoLabel: 'Fruits à coque' },
  { code: 'AM', label: 'Lait', incoCategory: 'milk', incoLabel: 'Lait' },
  {
    code: 'AU',
    label: 'Sulfites',
    incoCategory: 'sulphites',
    incoLabel: 'Anhydride sulfureux et sulfites',
  },
  { code: 'BWD', label: 'Sarrasin', incoCategory: null, incoLabel: null },
  { code: 'NM', label: 'Maïs', incoCategory: null, incoLabel: null },
];

const FARINE: IngredientView = {
  key: 'farine-de-sarrasin',
  name: { fr: 'Farine de sarrasin' },
  description: null,
  origin: 'Bretagne, France',
  appellation: null,
  allergens: ['BWD'],
  usedBy: 1,
};

/** Le périmètre demandé au serveur, capté à travers un vrai `ReferenceApi` doublé. */
let asked: string[] = [];

function setupPanel(entries: readonly AllergenEntry[] = WORLD): void {
  asked = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: FoldPanelRef, useValue: { close: () => undefined } },
      {
        provide: ReferenceApi,
        useValue: {
          allergens: (scope: string): Promise<AllergenReference> => {
            asked.push(scope);
            return Promise.resolve({ scope: 'world', entries });
          },
        },
      },
    ],
  });
}

async function openPanel(
  ingredient: IngredientView | undefined,
): Promise<FoldMultiselectComponent<string>> {
  const fixture = TestBed.createComponent(IngredientPanel);
  if (ingredient !== undefined) {
    fixture.componentRef.setInput('data', { ingredient });
  }
  fixture.detectChanges();
  // Le référentiel arrive par une promesse que `whenStable()` ne suit pas : en
  // zoneless, la stabilité du rendu n'attend pas une requête. On attend donc
  // que le contrôle REMPLACE l'état de chargement — ce que l'écran fait aussi.
  const found = await vi.waitFor(() => {
    fixture.detectChanges();
    const control = fixture.debugElement.query(By.directive(FoldMultiselectComponent));
    if (control === null) {
      throw new Error('sélecteur d’allergènes introuvable');
    }
    return control;
  });
  return found.componentInstance as FoldMultiselectComponent<string>;
}

describe('IngredientPanel — le sélecteur d’allergènes', () => {
  /**
   * Le périmètre est `world`, jamais `eu` (D4). Servir `eu` rendrait `BWD`,
   * `NM` et `SO` impossibles à poser sur une matière — c'est-à-dire
   * interdirait de consigner un fait parce que l'Europe ne l'exige pas.
   */
  it('demande le catalogue MONDIAL, jamais le catalogue légal', async () => {
    setupPanel();

    await openPanel(FARINE);

    expect(asked).toEqual(['world']);
  });

  /**
   * La règle : on groupe une catégorie qui a plus d'une entrée, on aplatit
   * celle qui n'en a qu'une. Les catégories à entrée unique portent un libellé
   * identique à leur entrée — « Lait » sous « Lait » — et le groupe y serait
   * une redondance visible.
   */
  it('groupe au-delà d’une entrée et aplatit en dessous', async () => {
    setupPanel();

    const control = await openPanel(FARINE);
    const items = control.options() ?? [];

    const groups = items.filter((item) => isFoldSelectOptionGroup(item));
    expect(groups.map((group) => group.label)).toEqual([
      'Céréales contenant du gluten',
      'Fruits à coque',
      'Hors obligation UE',
    ]);
    // Dans un groupe, le libellé GRANULAIRE : la légende porte déjà la catégorie.
    expect(groups[0]?.options.map((option) => option.label)).toEqual(['Blé', 'Seigle']);

    // Aplaties, les deux catégories à entrée unique — sous leur libellé
    // RÉGLEMENTAIRE, celui qui figure sur l'étiquette.
    const loose = items.filter((item) => !isFoldSelectOptionGroup(item));
    expect(loose.map((option) => option.label)).toEqual([
      'Lait',
      'Anhydride sulfureux et sulfites',
    ]);
  });

  /**
   * 🔴 Un groupe ne se FERME pas : fold rend les options d'un groupe SOUS son
   * libellé, donc une option simple placée après un en-tête se dessine au même
   * niveau que ses membres et se lit comme l'un d'eux — « Crustacés » passait
   * pour une céréale contenant du gluten. Rien dans `[options]` ne permet de
   * refermer un groupe ; l'ordre est la seule parade.
   *
   * L'invariant est écrit en RELATIF — « aucune simple après un groupe » — et
   * non en figeant la liste : il survivra à un tri différent comme à l'ajout
   * d'une entrée maison, là où une liste exacte casserait au premier des deux.
   */
  it('ne place JAMAIS une option simple après un groupe', async () => {
    setupPanel();

    const control = await openPanel(FARINE);
    const items = control.options() ?? [];

    const firstGroup = items.findIndex((item) => isFoldSelectOptionGroup(item));
    const looseAfter = items
      .slice(firstGroup)
      .filter((item) => !isFoldSelectOptionGroup(item))
      .map((option) => option.label);

    expect(firstGroup).toBeGreaterThan(-1);
    expect(looseAfter).toEqual([]);
  });

  /**
   * Une entrée archivée sort de ce qu'on PROPOSE, jamais de ce qu'on RECONNAÎT
   * (D2 bis). Sans ce rattrapage, le code coché resterait dans la valeur sans
   * apparaître nulle part : le résumé mentirait, et personne ne pourrait le
   * décocher.
   */
  it('montre encore un code coché que le référentiel ne propose plus', async () => {
    setupPanel(WORLD.filter((entry) => entry.code !== 'BWD'));

    const control = await openPanel(FARINE);
    const items = control.options() ?? [];

    const withdrawn = items
      .filter((item) => isFoldSelectOptionGroup(item))
      .find((group) => group.label === 'Retiré du référentiel');
    expect(withdrawn?.options.map((option) => option.value)).toEqual(['BWD']);
    // En dernier : ce n'est pas une catégorie, et ce qui n'est plus proposé n'a
    // pas à couper la liste de ce qui l'est.
    expect(items.at(-1)).toBe(withdrawn);
  });

  it('part de ce que la matière porte déjà', async () => {
    setupPanel();

    const control = await openPanel(FARINE);

    expect(control.value()).toEqual(['BWD']);
  });

  /**
   * L'écriture est une route à part (`PUT …/allergens`), et elle porte la liste
   * ENTIÈRE — le serveur remplace, il ne fusionne pas.
   */
  it('envoie la liste entière sur sa propre route', async () => {
    setupPanel();
    const store = TestBed.inject(ProvenanceStore);
    const http = TestBed.inject(HttpTestingController);
    const base = TestBed.inject(API_BASE_URL);
    // Le magasin lit ses deux listes à la construction : on les solde d'abord,
    // sinon le rechargement d'après l'écriture ne se distinguerait pas d'elles.
    for (const pending of http.match(() => true)) {
      pending.flush([]);
    }

    const done = store.setIngredientAllergens('farine-de-sarrasin', ['BWD', 'UW']);
    const put = http.expectOne(`${base}/ingredients/farine-de-sarrasin/allergens`);

    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ codes: ['BWD', 'UW'] });
    put.flush({ key: 'farine-de-sarrasin' });
    // L'écriture relit la liste : c'est ce qui fait remonter le nouveau compte.
    const reload = await vi.waitFor(() => http.expectOne(`${base}/ingredients`));
    reload.flush([]);
    await done;
  });
});

describe('IngredientsPage — les allergènes dans la liste', () => {
  function renderList(ingredient: IngredientView): HTMLElement {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: PermissionsStore, useValue: { can: () => true } },
        {
          provide: ProvenanceStore,
          useValue: {
            appellations: () => [],
            ingredients: () => [ingredient],
            offeredAppellations: () => [],
            appellationError: () => null,
            ingredientError: () => null,
            reload: () => Promise.resolve(),
            reloadIngredients: () => Promise.resolve(),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(IngredientsPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('compte les allergènes portés', () => {
    const element = renderList(FARINE);

    expect(element.textContent).toContain('1 allergène');
  });

  /**
   * 🔴 Le silence ne s'affirme pas. Une matière sans code n'est pas une matière
   * « sans allergène » : c'est une matière dont personne n'a rien dit. Écrire
   * « aucun allergène » ferait dire à la liste ce que le référentiel n'atteste
   * pas — et sur ce sujet-là, le raccourci se paie ailleurs.
   */
  it('ne déclare JAMAIS « aucun allergène » sur une matière muette', () => {
    const element = renderList({ ...FARINE, allergens: [] });

    expect(element.textContent).toContain('Non renseigné');
    expect(element.textContent?.toLowerCase()).not.toContain('aucun allergène');
    expect(element.textContent?.toLowerCase()).not.toContain('sans allergène');
  });
});
