import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldPaginatorComponent,
  type FoldSelectOption,
} from 'fold-ng';

import type { FoldProduct, FoldProductOrder } from '../../../shared';
import { type CatalogueCategory } from '../../data/catalogue-seed';
import { FavoritesService } from '../../data/favorites.service';
import { CardCatalog } from '../card-catalog/card-catalog';
import { CatalogueFilters } from '../catalogue-filters/catalogue-filters';
import { type CatalogueView, toCatalogueView } from '../catalogue-view';
import { TableCatalog } from '../table-catalog/table-catalog';

/**
 * **Orchestrateur** du catalogue : il possède l'état partagé (filtres, vue
 * courante, pagination) et délègue l'affichage — la barre de filtres
 * ({@link CatalogueFilters}), puis la vue **cartes** ({@link CardCatalog}) ou
 * **tableau/order-pad** ({@link TableCatalog}). Il ne dessine plus rien lui-même.
 *
 * Le **switch cartes ↔ tableau** est posé par le parent dans le slot
 * `[sectionActions]` de la `fold-page-section` (via un `fold-view-toggle` lié à
 * `view`/`setView`) — l'orchestrateur reste la source de vérité de la vue.
 *
 * Pas de layout propre : posé dans une `fold-page-section` (`stack`), c'est elle
 * qui espace filtres / vue / pagination (`:host { display: contents }`).
 */
@Component({
  selector: 'app-product-catalogue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CatalogueFilters,
    CardCatalog,
    TableCatalog,
    FoldButtonComponent,
    FoldPaginatorComponent,
    FoldEmptyStateComponent,
  ],
  templateUrl: './product-catalogue.html',
  styleUrl: './product-catalogue.scss',
})
export class ProductCatalogue {
  readonly products = input.required<readonly FoldProduct[]>();
  readonly categories = input.required<readonly CatalogueCategory[]>();

  /** Paliers de taille de page ; « Voir plus » passe au cran supérieur. */
  readonly pageSizeSteps = input<readonly number[]>([12, 24, 48]);

  /** Émis quand une carte/ligne est ajoutée, avec la quantité choisie. */
  readonly add = output<FoldProductOrder>();
  /** Émis quand « Me prévenir » est cliqué sur un produit en rupture. */
  readonly notify = output<FoldProduct>();

  protected readonly favorites = inject(FavoritesService);

  /** Vue courante (cartes / tableau) — l'orchestrateur en est la source de vérité. */
  readonly view = signal<CatalogueView>('cards');
  /** Appliqué par le `fold-view-toggle` du parent (valeur brute → union). */
  setView(value: string): void {
    this.view.set(toCatalogueView(value));
  }

  protected readonly categoryOptions = computed<readonly FoldSelectOption<string>[]>(() =>
    this.categories().map((c) => ({ value: c.id, label: c.label })),
  );

  protected readonly selectedCategories = signal<string[]>([]);
  protected readonly query = signal('');
  protected readonly favoritesOnly = signal(false);

  protected readonly filtered = computed<readonly FoldProduct[]>(() => {
    const cats = this.selectedCategories();
    const q = this.query().trim().toLowerCase();
    const favOnly = this.favoritesOnly();
    return this.products().filter((p) => {
      if (cats.length > 0 && (p.category === undefined || !cats.includes(p.category))) {
        return false;
      }
      if (favOnly && !this.favorites.has(p.id)) {
        return false;
      }
      if (q.length > 0 && !p.name.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  });

  protected readonly total = computed(() => this.filtered().length);

  /** Palier courant (index dans {@link pageSizeSteps}). */
  protected readonly stepIndex = signal(0);

  /** Taille de page effective = le palier courant. */
  protected readonly pageSize = computed(() => {
    const steps = this.pageSizeSteps();
    const i = Math.min(this.stepIndex(), steps.length - 1);
    return steps[i] ?? 12;
  });

  /** « Voir plus » : reste des paliers ET encore des produits à révéler. */
  protected readonly canSeeMore = computed(
    () => this.stepIndex() < this.pageSizeSteps().length - 1 && this.total() > this.pageSize(),
  );

  /** Page courante — revient à 1 dès que le résultat filtré change. */
  protected readonly page = linkedSignal<readonly FoldProduct[], number>({
    source: () => this.filtered(),
    computation: () => 1,
  });

  protected readonly paged = computed<readonly FoldProduct[]>(() => {
    const size = this.pageSize();
    const start = (this.page() - 1) * size;
    return this.filtered().slice(start, start + size);
  });

  /** Monte d'un cran l'échelle de pagination et repart en page 1. */
  protected seeMore(): void {
    this.stepIndex.update((i) => Math.min(i + 1, this.pageSizeSteps().length - 1));
    this.page.set(1);
  }

  protected onAdd(order: FoldProductOrder): void {
    this.add.emit(order);
  }

  protected onNotify(product: FoldProduct): void {
    this.notify.emit(product);
  }
}
