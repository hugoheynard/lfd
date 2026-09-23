import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { CatalogueApi } from '../../catalogue-api';
import { ProductHttpApi } from '../../product-http-api';
import { ReferenceApi } from '../../reference-api';
import { provideTestSalesContexts } from '../../../sales-contexts/sales-context-store.testing';
import type { Variant } from '../../../data/models';
import { ProductFormPage } from '../product-form-page';
import { ProductFormStore } from '../product-form-store';

/**
 * **Les quatre familles, et le filtre qui range la fiche** (décision Hugo,
 * 2026-09-23).
 *
 * Le cas qui tient ce fichier est le dernier : une section NON ENREGISTRÉE
 * d'une famille qu'on ne regarde pas **ne disparaît pas**. C'est la reprise du
 * défaut des visuels par un autre chemin — des modifications qu'on ne voit
 * plus, donc qu'on quitte sans les avoir vues.
 */

const EMPTY_NUTRITION = {
  energyKcal: null,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  sugarsG: null,
  proteinG: null,
  saltG: null,
  glycemicIndex: null,
};

const DEFAULT_VARIANT: Variant = {
  id: 'var_1',
  sku: 'CHO-001-1',
  name: { fr: 'Gros florentin lait' },
  isDefault: true,
  isDiscontinued: false,
  position: 0,
  priceCents: 250,
  weightGrams: 100,
  regulatoryFollowsDefault: false,
  nutritionFollowsDefault: false,
  pricingFollowsDefault: false,
  allergens: ['AM'],
  mayContain: [],
  nutrition: EMPTY_NUTRITION,
};

class FakeApi {
  getDetail() {
    return Promise.resolve({
      product: {
        id: 'prd_1',
        sku: 'CHO-001',
        name: { fr: 'Gros florentin lait' },
        slug: { fr: 'gros-florentin-lait' },
        kind: 'daily',
        categoryId: 'cat_1',
        status: 'draft',
        variants: [DEFAULT_VARIANT],
        vatByContext: {},
        channelsOverride: null,
        priceEur: 2.5,
        weightGrams: 100,
      },
      editorial: {
        descriptionShort: null,
        descriptionLong: null,
        story: null,
        pairing: null,
        brand: '',
        seoTitle: null,
        seoDescription: null,
      },
      allergens: ['AM'],
      mayContain: [],
      nutrition: EMPTY_NUTRITION,
      media: [],
      readiness: null,
      readinessStale: false,
    });
  }

  citedAllergens() {
    return Promise.resolve([]);
  }
}

interface Rendered {
  readonly fixture: ComponentFixture<ProductFormPage>;
  readonly store: ProductFormStore;
  readonly root: HTMLElement;
}

/**
 * La page, sur une fiche EXISTANTE et hydratée.
 *
 * La route de test ne porte pas d'identifiant : on laisse le chargement de
 * création se terminer, puis on rejoue `init` avec un identifiant — c'est le
 * seul moyen d'obtenir une ligne de base, sans laquelle aucune section ne peut
 * être « modifiée ».
 */
async function render(): Promise<Rendered> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTestSalesContexts(),
      { provide: ProductHttpApi, useValue: new FakeApi() },
      {
        provide: CatalogueApi,
        useValue: {
          listCategories: () =>
            Promise.resolve([
              {
                id: 'cat_1',
                name: { fr: 'Chocolat' },
                slug: { fr: 'chocolat' },
                parentId: null,
                position: 1,
                isArchived: false,
                channelPreset: [],
                vatByContext: {},
                activeProductCount: 1,
              },
            ]),
          listVatRates: () => Promise.resolve([]),
        },
      },
      { provide: ReferenceApi, useValue: { allergens: () => Promise.resolve({ entries: [] }) } },
    ],
  });
  return mount();
}

/** Une SECONDE fiche, dans le même bac à sable — l'équivalent d'une navigation
 *  d'un produit à l'autre. */
async function mount(): Promise<Rendered> {
  const fixture = TestBed.createComponent(ProductFormPage);
  const store = fixture.debugElement.injector.get(ProductFormStore);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await store.init('prd_1');
  fixture.detectChanges();
  return { fixture, store, root: fixture.nativeElement as HTMLElement };
}

/** Les titres des sections actuellement à l'écran, dans l'ordre. */
function titles(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.sections .section-title-text')].map(
    (title) => title.textContent?.trim() ?? '',
  );
}

/** Clique un onglet du filtre, par son libellé. */
function filterOn(rendered: Rendered, label: string): void {
  const button = [...rendered.root.querySelectorAll<HTMLElement>('fold-view-nav button')].find(
    (item) => item.textContent?.trim().startsWith(label) === true,
  );
  expect(button, `Le filtre « ${label} » n'existe pas.`).toBeDefined();
  button?.click();
  rendered.fixture.detectChanges();
}

/** La pastille de famille d'une section, par le titre de la section. */
function familyBadge(root: HTMLElement, title: string): HTMLElement | null {
  const section = [...root.querySelectorAll('fold-page-section')].find(
    (candidate) => candidate.querySelector('.section-title-text')?.textContent?.trim() === title,
  );
  return section?.querySelector<HTMLElement>('.section-actions fold-badge') ?? null;
}

describe('le filtre par famille de la fiche produit', () => {
  it('propose « Tout » et les quatre familles, dans cet ordre', async () => {
    const { root } = await render();

    const items = [...root.querySelectorAll('fold-view-nav button')].map((item) =>
      item.textContent?.trim(),
    );

    expect(items).toEqual(['Tout', 'Identité', 'Commerce', 'Réglementaire', 'Communication']);
  });

  it('sur « Tout », montre tout et dit la famille de chaque section', async () => {
    const { root } = await render();

    expect(titles(root)).toContain('Allergènes');
    expect(titles(root)).toContain('Visuels');
    expect(titles(root)).toContain('Diffusion par canal');

    expect(familyBadge(root, 'Allergènes')?.textContent?.trim()).toBe('Réglementaire');
    expect(familyBadge(root, 'Visuels')?.textContent?.trim()).toBe('Communication');
    expect(familyBadge(root, 'Identité')?.textContent?.trim()).toBe('Identité');
  });

  it('ne garde que la famille choisie — et les cartes qu’elle ancre', async () => {
    const rendered = await render();

    filterOn(rendered, 'Réglementaire');

    const shown = titles(rendered.root);
    expect(shown).toContain('Allergènes');
    expect(shown).toContain('Valeurs nutritionnelles');
    // « Ingrédients » est ancré sous la nutrition : il la suit, par position.
    expect(shown).toContain('Ingrédients');
    expect(shown).not.toContain('Visuels');
    expect(shown).not.toContain('Tarif & TVA');
    // Hors familles, et donc réservée à « Tout ».
    expect(shown).not.toContain('Diffusion par canal');
  });

  it('ne répète pas le filtre en pastille sur une liste déjà homogène', async () => {
    const rendered = await render();

    filterOn(rendered, 'Communication');

    expect(familyBadge(rendered.root, 'Visuels')).toBeNull();
  });

  /**
   * 🔴 **Le cas qui compte.** Le filtre range, il ne cache jamais du travail en
   * cours : une section modifiée reste à l'écran même quand sa famille n'est
   * pas celle qu'on regarde, et sa pastille dit d'où elle vient.
   */
  it('ne fait pas disparaître une section modifiée d’une famille non choisie', async () => {
    const rendered = await render();
    rendered.store.setName('Gros florentin noir');
    rendered.fixture.detectChanges();
    expect(rendered.store.isDirty('identite')).toBe(true);

    filterOn(rendered, 'Commerce');

    expect(titles(rendered.root)).toContain('Identité');
    const badge = familyBadge(rendered.root, 'Identité');
    expect(badge?.textContent?.trim()).toBe('Identité');
    // En `warning` : elle n'est là que parce qu'elle porte une saisie en
    // attente, et l'écran le dit plutôt que de la laisser passer pour un
    // membre de la famille filtrée.
    expect(badge?.classList.contains('warning')).toBe(true);
  });

  it('compte les sections en attente sur l’onglet de leur famille', async () => {
    const rendered = await render();
    rendered.store.setName('Gros florentin noir');
    rendered.fixture.detectChanges();

    filterOn(rendered, 'Commerce');

    const tab = [...rendered.root.querySelectorAll<HTMLElement>('fold-view-nav button')].find(
      (item) => item.textContent?.trim().startsWith('Identité') === true,
    );
    // Le compteur reste lisible depuis une AUTRE famille : c'est lui qui nomme
    // celle qui porte des modifications non enregistrées.
    expect(tab?.textContent).toContain('1');
  });

  /**
   * Décision Hugo (2026-09-23) : le réglage suit la PERSONNE, pas la fiche.
   * Quelqu'un qui relit les textes de dix produits le choisit une fois.
   */
  it('garde la famille choisie d’une fiche à l’autre', async () => {
    const first = await render();
    filterOn(first, 'Communication');

    const second = await mount();

    expect(titles(second.root)).not.toContain('Allergènes');
    expect(titles(second.root)).toContain('Visuels');
  });
});
