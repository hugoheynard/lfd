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

import type { FoldProduct, FoldProductOrder } from '../../../../shared';
import { type CatalogueCategory } from '../../data/catalogue-seed';
import { FavoritesService } from '../../data/favorites.service';
import { CardCatalog } from '../card-catalog/card-catalog';
import { CategoryCatalog } from '../category-catalog/category-catalog';
import { CategoryShelves } from '../category-shelves/category-shelves';
import { CatalogueFilters } from '../catalogue-filters/catalogue-filters';
import { type CatalogueView } from '../catalogue-view';

/**
 * **Orchestrateur** du catalogue : il possède les filtres + la pagination et
 * délègue l'affichage — la barre de filtres ({@link CatalogueFilters}), puis l'une
 * des trois vues **au choix du client** : **grille** de cartes ({@link CardCatalog}),
 * **rayons** par catégorie ({@link CategoryShelves}) ou **liste** order-pad
 * ({@link CategoryCatalog}). Grille = paginée ; rayons/liste = tout le filtré.
 *
 * La **vue** est **contrôlée par la page** (input `view`) : c'est elle qui possède
 * l'état + persiste la préférence utilisateur, et qui pose le `fold-view-toggle`
 * dans le slot `[sectionActions]` de la `fold-page-section`.
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
    CategoryShelves,
    CategoryCatalog,
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

  /** Vue courante (grille / rayons / liste) — **contrôlée par le parent** (la page
   *  possède l'état + la persistance de la préférence utilisateur, et le sélecteur
   *  de vue vit dans son slot `sectionActions`). */
  readonly view = input<CatalogueView>('cards');

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
