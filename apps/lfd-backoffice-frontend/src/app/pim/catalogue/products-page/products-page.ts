import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldElementTitleComponent,
  FoldLinkComponent,
  FoldPageLayoutComponent,
  FoldPaginatorComponent,
  FoldPopoverTriggerDirective,
  FoldSearchComponent,
  FoldViewToggleComponent,
  type FoldBadgeVariant,
  type FoldTableColumn,
  type FoldTableSort,
} from 'fold-ng';

import { CatalogueApi, type Category, type Product, type VatRate } from '../catalogue-api';
import { productStatusLabel, productStatusVariant } from '../product-status';
import type { ProductStatus } from '../../data/models';
import {
  ALL_STATUSES,
  familyOptions,
  filterFromParams,
  filterProducts,
  filterToParams,
  maskApplies,
  type ProductsFilter,
  type StatusFilter,
} from './products-filter';
import { httpErrorMessage } from '@lfd/endpoints';

import { nextSort, sortRows } from './products-sort';

@Component({
  selector: 'app-products-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldPageLayoutComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
    FoldSearchComponent,
    FoldPaginatorComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldPopoverTriggerDirective,
    FoldElementTitleComponent,
    FoldLinkComponent,
    FoldButtonIconComponent,
    FoldViewToggleComponent,
    FoldCheckboxComponent,
  ],
  templateUrl: './products-page.html',
  styleUrl: './products-page.scss',
})
export class ProductsPage {
  private readonly api = inject(CatalogueApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly products = signal<Product[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly rates = signal<VatRate[]>([]);
  protected readonly query = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);

  /** Sélection multi-lignes (clés = ids produit) pour les actions groupées. */
  protected readonly selection = signal<ReadonlySet<string | number>>(new Set());
  protected readonly selectedCount = computed(() => this.selection().size);
  private readonly selectedIds = computed(() => [...this.selection()].map((key) => String(key)));

  /** Famille, état et masque des archivées — relus de l'URL au chargement. */
  protected readonly filter = signal<ProductsFilter>(
    filterFromParams(this.route.snapshot.queryParamMap),
  );
  protected readonly familyOptions = computed(() =>
    familyOptions(this.categories(), this.products()),
  );
  protected readonly statusOptions: readonly { value: StatusFilter; label: string }[] = [
    { value: ALL_STATUSES, label: 'Toutes' },
    { value: 'published', label: 'Actives' },
    { value: 'draft', label: 'Inactives' },
    { value: 'archived', label: 'Archivées' },
  ];
  /** Le masque est sans effet hors de « Toutes » : la case se grise alors. */
  protected readonly maskDisabled = computed(() => this.filter().status !== ALL_STATUSES);
  protected readonly maskChecked = computed(() => maskApplies(this.filter()));

  /**
   * Filtre du tableau : par nom, par référence **ou par famille**.
   *
   * La famille se cherche sur son NOM et non sur son identifiant, pour la même
   * raison que le tri : c'est ce que la colonne affiche. Taper « viennoiserie »
   * doit ramener la ligne qu'on voit, pas rien.
   *
   * ⚠️ `categoryName` rend `—` pour une famille inconnue. Ce tiret est écarté
   * plutôt que comparé : sinon une recherche contenant « — » ramasserait tous
   * les produits orphelins, ce qui n'est ni cherché ni compréhensible.
   */
  protected readonly visibleProducts = computed<Product[]>(() => {
    const q = this.query().trim().toLowerCase();
    const products = filterProducts(this.products(), this.filter());
    if (q === '') {
      return products;
    }
    return products.filter((p) => {
      const family = this.categoryName(p.categoryId);
      return (
        p.name.fr.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (family !== '—' && family.toLowerCase().includes(q))
      );
    });
  });

  /**
   * Le tri courant, ou `null` quand la liste garde l'ordre du serveur.
   *
   * ⚠️ La table `fold-data-table` **n'trie rien** : elle rend l'en-tête, émet la
   * colonne cliquée et affiche la flèche. C'est le parent qui possède l'ordre,
   * et c'est ce qui permet de trier la liste ENTIÈRE avant de la paginer —
   * trier la page affichée ne trierait que vingt-cinq lignes sur deux cents.
   */
  protected readonly sort = signal<FoldTableSort | null>(null);

  /**
   * Les valeurs sur lesquelles une colonne triable se compare.
   *
   * Le tri porte sur ce que la personne LIT, pas sur ce que la ligne porte : la
   * colonne Famille affiche le nom de la famille et non son identifiant, donc
   * trier par `categoryId` rangerait des ULID sous une en-tête qui promet des
   * noms.
   */
  private readonly sortValues: Readonly<Record<string, (product: Product) => string>> = {
    name: (product) => product.name.fr,
    category: (product) => this.categoryName(product.categoryId),
  };

  /**
   * La liste filtrée, puis ordonnée.
   *
   * `localeCompare` en français plutôt qu'une comparaison de chaînes : `<` range
   * « Éclair » après « Zeste », parce qu'il compare des points de code. Une
   * boulangerie dont la moitié des noms portent un accent en aurait souffert à
   * la première page.
   */
  private readonly sortedProducts = computed<readonly Product[]>(() => {
    const active = this.sort();
    const valueOf = active === null ? undefined : this.sortValues[active.key];
    // Une colonne sans lecteur déclaré ne trie pas — elle ne se plante pas non
    // plus. `sortable` et `sortValues` se posent à deux endroits ; le jour où
    // l'un gagne une colonne sans l'autre, la liste garde son ordre.
    if (active === null || valueOf === undefined) {
      return this.visibleProducts();
    }
    return sortRows(this.visibleProducts(), active, valueOf);
  });

  /** Nombre de pages, page courante bornée, et la tranche affichée. */
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.visibleProducts().length / this.pageSize())),
  );

  protected readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));

  protected readonly pagedProducts = computed<Product[]>(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.sortedProducts().slice(start, start + this.pageSize());
  });

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'sku', label: 'Référence', width: '9rem' },
    { key: 'name', label: 'Nom', sortable: true },
    { key: 'category', label: 'Famille', sortable: true },
    { key: 'status', label: 'État' },
    { key: 'actions', label: '', align: 'right', width: '8rem' },
  ];

  // Pas de variante « illisible » ici : cette page tient sa propre liste et son
  // propre `error`, qu'elle AFFICHE au-dessus du tableau. L'état vide ne ment
  // donc pas — contrairement aux écrans qui lisent un store en silence.
  // Un catalogue rempli que les filtres vident ne doit pas inviter à créer.
  protected readonly emptyState = computed(() =>
    this.products().length === 0
      ? {
          title: 'Aucun produit',
          subtitle: 'Créez votre premier produit pour démarrer le catalogue.',
        }
      : {
          title: 'Aucune fiche ne correspond',
          subtitle: "Élargissez la famille, l'état ou la recherche.",
        },
  );

  protected readonly rowKey = (product: Product): string => product.id;

  private readonly byId = computed(
    () => new Map(this.categories().map((category) => [category.id, category])),
  );

  constructor() {
    void this.reload();
  }

  /**
   * Un clic sur une ligne ouvre la page produit.
   *
   * La phrase était là AVANT que la table soit cliquable : seul le nom l'était,
   * et le commentaire décrivait une intention plutôt que l'écran. C'est
   * `clickable` + `(rowClick)` qui la rendent vraie, et le menu d'actions arrête
   * la propagation pour que ⋮ n'ouvre pas la fiche (cf. le gabarit).
   */
  protected openProduct(product: Product): void {
    void this.router.navigate(['/pim/produits', product.id]);
  }

  /**
   * Un clic sur une en-tête triable : croissant, puis décroissant, puis plus de
   * tri du tout.
   *
   * Le troisième état n'est pas une coquetterie — sans lui, l'ordre d'origine
   * du serveur devient **inatteignable** une fois qu'on a trié, et il n'y a plus
   * de retour en arrière qu'en rechargeant la page.
   *
   * ⚠️ On revient à la première page. Trier en restant à la page trois
   * afficherait une tranche du milieu d'un ordre neuf, ce qui se lit comme une
   * liste qui a perdu des lignes.
   */
  protected onSortChange(key: string): void {
    this.sort.set(nextSort(this.sort(), key));
    this.page.set(1);
  }

  /** Filtrer remet en page 1 pour ne pas rester sur une page vide. */
  protected onSearch(query: string): void {
    this.query.set(query);
    this.afterFilter();
  }

  protected chooseFamily(family: string): void {
    this.setFilter({ ...this.filter(), family });
  }

  protected chooseStatus(value: string): void {
    const status = this.statusOptions.find((option) => option.value === value)?.value;
    this.setFilter({ ...this.filter(), status: status ?? ALL_STATUSES });
  }

  protected toggleMask(hideArchived: boolean): void {
    this.setFilter({ ...this.filter(), hideArchived });
  }

  /** Le filtre change, et l'URL le retient : un rechargement garde la vue. */
  private setFilter(filter: ProductsFilter): void {
    this.filter.set(filter);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: filterToParams(filter),
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.afterFilter();
  }

  /**
   * Retour en page 1, et la sélection perd les lignes devenues invisibles :
   * « Actions (N) » archiverait sinon des fiches qu'on ne voit plus.
   */
  private afterFilter(): void {
    this.page.set(1);
    const visible = new Set(this.visibleProducts().map((p) => p.id));
    const kept = [...this.selection()].filter((key) => visible.has(String(key)));
    if (kept.length !== this.selection().size) {
      this.selection.set(new Set(kept));
    }
  }

  protected onPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  /**
   * Le statut, tel que la fiche produit le montre déjà. Deux passe-plats plutôt
   * qu'une seconde table : la liste peignait la valeur d'enum brute, en anglais,
   * et donnait le vert au brouillon comme au produit en ligne.
   */
  protected statusLabel(status: ProductStatus): string {
    return productStatusLabel(status);
  }

  protected statusVariant(status: ProductStatus): FoldBadgeVariant {
    return productStatusVariant(status);
  }

  /** Un produit précis — le bouton de la ligne. */
  protected categoryName(id: string): string {
    return this.byId().get(id)?.name.fr ?? '—';
  }

  protected inputValue(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement || target instanceof HTMLSelectElement
      ? target.value
      : '';
  }

  protected async publish(product: Product): Promise<void> {
    await this.run(() => this.api.publishProduct(product.id));
  }

  protected async unpublish(product: Product): Promise<void> {
    await this.run(() => this.api.unpublishProduct(product.id));
  }

  protected async archive(product: Product): Promise<void> {
    await this.run(() => this.api.archiveProduct(product.id));
  }

  // ── Actions groupées (sur la sélection) ──────────────────────────────────

  /**
   * Active la sélection **une fiche à la fois** : un refus n'arrête pas la
   * suite, il entre au bilan avec le message du serveur. Un 429 ou un serveur
   * muet l'arrête — insister aggraverait le blocage de la passerelle.
   */
  protected async activateSelected(): Promise<void> {
    const chosen = this.products().filter((p) => this.selection().has(p.id));
    if (chosen.length === 0) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    let activated = 0;
    const refusals: string[] = [];
    for (const product of chosen) {
      try {
        await this.api.publishProduct(product.id);
        activated += 1;
      } catch (caught) {
        refusals.push(`${product.sku} — ${failureMessageOf(caught)}`);
        if (caught instanceof HttpErrorResponse && (caught.status === 429 || caught.status === 0)) {
          refusals.push('Série arrêtée : les fiches suivantes n’ont pas été tentées.');
          break;
        }
      }
    }
    await this.reload();
    this.selection.set(new Set());
    if (refusals.length > 0) {
      this.error.set(`${activated} fiche(s) activée(s). ${refusals.join(' · ')}`);
    }
    this.busy.set(false);
  }

  protected async archiveSelected(): Promise<void> {
    await this.batch((id) => this.api.archiveProduct(id));
  }

  private async batch(action: (id: string) => Promise<void>): Promise<void> {
    const ids = this.selectedIds();
    if (ids.length === 0) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      for (const id of ids) {
        await action(id);
      }
      await this.reload();
      this.selection.set(new Set());
    } catch (caught) {
      this.error.set(failureMessageOf(caught));
    } finally {
      this.busy.set(false);
    }
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      await this.reload();
    } catch (caught) {
      this.error.set(failureMessageOf(caught));
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      const [products, categories, rates] = await Promise.all([
        this.api.listProducts(),
        this.api.listCategories(),
        this.api.listVatRates(),
      ]);
      this.products.set(products);
      this.rates.set(rates);
      this.categories.set(categories.filter((category) => !category.isArchived));
    } catch (caught) {
      this.error.set(failureMessageOf(caught));
    }
  }
}

/**
 * Le message à montrer pour un geste refusé : celui du serveur d'abord.
 *
 * Une `HttpErrorResponse` n'est pas une `Error` : le test `instanceof Error`
 * rendait « Erreur inattendue. » sur le refus `catalogue.product.not_activatable`,
 * dont le message nomme pourtant chaque déclinaison et ce qui lui manque
 * (constaté le 2026-10-26).
 */
function failureMessageOf(caught: unknown): string {
  const fallback = caught instanceof Error ? caught.message : 'Erreur inattendue.';
  return httpErrorMessage(caught, fallback);
}
