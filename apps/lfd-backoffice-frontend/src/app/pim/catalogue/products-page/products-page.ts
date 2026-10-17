import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { Router, RouterLink } from '@angular/router';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowNoteDirective,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldElementTitleComponent,
  FoldLinkComponent,
  FoldPageLayoutComponent,
  FoldPaginatorComponent,
  FoldPopoverTriggerDirective,
  FoldSearchComponent,
  type FoldBadgeVariant,
  type FoldTableColumn,
  type FoldTableSort,
  type FoldTableTone,
} from 'fold-ng';

import { NO_CHANNELS, pointsOfSaleSelling, resolveChannels } from '../../data/channels';
import { PointOfSaleStore } from '../../points-of-sale/point-of-sale-store';
import { SalesContextStore } from '../../sales-contexts/sales-context-store';
import { soldContexts, type SoldContext } from '../sold-contexts';
import { B2bChannelApi, type B2bMembershipView } from '../../channels/b2b-channel-api';
import { blockersOf, faultsOf, type Blocker } from '../../channels/b2b-exclusions';

import {
  CatalogueApi,
  type Category,
  type Product,
  type SalesChannels,
  type VatRate,
} from '../catalogue-api';
import { productStatusLabel, productStatusVariant } from '../product-status';
import type { ProductStatus } from '../../data/models';
import { nextSort, sortRows } from './products-sort';

/**
 * **Où en est une fiche sur la boutique professionnelle**, vue de la liste :
 * son appartenance au canal, et rien d'autre.
 *
 * La colonne disait aussi « jamais poussée » / « poussée » et « non vendue aux
 * pros », lus sur l'aperçu d'envoi. Le push et son aperçu sont partis en X2
 * (2026-10-17, `documentation/catalogue/plan-sans-interrupteurs.md`) : les
 * faits du catalogue partent d'eux-mêmes, et ce que la plateforme en a fait se
 * lit sur « Catalogue publié » et sur la frise de la fiche.
 */
type B2bChannelState = 'hors_canal' | 'sur_le_canal';

/** L'état du badge, **dérivé et rien d'autre** — donc éprouvable sans monter la page. */
export function b2bChannelState(membered: boolean): B2bChannelState {
  return membered ? 'sur_le_canal' : 'hors_canal';
}

const B2B_LABELS: Record<B2bChannelState, string> = {
  hors_canal: 'hors canal',
  sur_le_canal: 'sur le canal',
};

const B2B_VARIANTS: Record<B2bChannelState, FoldBadgeVariant> = {
  hors_canal: 'neutral',
  sur_le_canal: 'info',
};

/** Aucun refus de projection à lire : seul le brouillon vendu se signale encore. */
const NO_EXCLUSIONS: ReadonlyMap<string, string> = new Map();

@Component({
  selector: 'app-products-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldPageLayoutComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldDataTableRowNoteDirective,
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
  ],
  templateUrl: './products-page.html',
  styleUrl: './products-page.scss',
})
export class ProductsPage {
  private readonly api = inject(CatalogueApi);
  private readonly pointStore = inject(PointOfSaleStore);

  /** Les noms des points de vente — lus au référentiel, jamais codés en dur. */
  protected readonly pointsOfSale = this.pointStore.items;
  /** Le registre des contextes — même raison : la colonne « Canaux » les lit tous. */
  private readonly contexts = inject(SalesContextStore);
  private readonly b2b = inject(B2bChannelApi);
  private readonly router = inject(Router);

  protected readonly products = signal<Product[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly memberships = signal<B2bMembershipView[]>([]);
  protected readonly rates = signal<VatRate[]>([]);
  protected readonly query = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);

  /** Sélection multi-lignes (clés = ids produit) pour les actions groupées. */
  protected readonly selection = signal<ReadonlySet<string | number>>(new Set());
  protected readonly selectedCount = computed(() => this.selection().size);
  private readonly selectedIds = computed(() => [...this.selection()].map((key) => String(key)));

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
    const products = this.products();
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
    { key: 'channels', label: 'Canaux', width: '12rem' },
    { key: 'status', label: 'État' },
    // Deux canaux, deux colonnes. Celui qui FACTURE n'en avait aucune : la seule
    // information sur la plateforme professionnelle était son absence.
    { key: 'b2b', label: 'Boutique B2B' },
    { key: 'actions', label: '', align: 'right', width: '8rem' },
  ];

  // Pas de variante « illisible » ici : cette page tient sa propre liste et son
  // propre `error`, qu'elle AFFICHE au-dessus du tableau. L'état vide ne ment
  // donc pas — contrairement aux écrans qui lisent un store en silence.
  protected readonly emptyState = {
    title: 'Aucun produit',
    subtitle: 'Créez votre premier produit pour démarrer le catalogue.',
  };

  protected readonly rowKey = (product: Product): string => product.id;

  /**
   * Ce qui se signale par fiche, calculé une fois par chargement — depuis X2,
   * le seul brouillon vendu aux pros.
   *
   * Un `computed` plutôt qu'un appel par ligne : `rowNote`, `rowTone` et le
   * gabarit de la note interrogent tous les trois la même fiche, et fold les
   * appelle à chaque rendu.
   */
  private readonly blockersById = computed(() => {
    const membres = this.membershipById();
    return new Map(
      this.products().map((product) => [
        product.id,
        // L'appartenance au canal est passée : un brouillon HORS canal ne part
        // nulle part et n'a rien à signaler. C'est le couple « brouillon » ET
        // « canal ouvert » qui est l'anomalie.
        blockersOf(product, NO_EXCLUSIONS, membres.has(product.id)),
      ]),
    );
  });

  /** Ce qui manque à cette fiche — la décision de ne pas la vendre exclue. */
  protected rowFaults(product: Product): readonly Blocker[] {
    return faultsOf(this.blockersById().get(product.id) ?? []);
  }

  /**
   * Quelles lignes portent une note. **Indispensable** : sans ce prédicat, fold
   * émettrait un `<tr>` par produit — vide pour la plupart, et un lecteur
   * d'écran annonce une ligne blanche par enregistrement.
   */
  protected readonly hasFaults = (product: Product): boolean => this.rowFaults(product).length > 0;

  /**
   * ⚠️ Le ton `alert` était réservé à l'échec de synchro de l'ancien canal de vente en ligne, « une panne,
   * alors qu'un refus de projection est un état connu du catalogue ». Le canal
   * parti, il ne reste que l'état connu — et une ligne en panne n'existe plus
   * sur cet écran (2026-09-21).
   */
  protected readonly rowTone = (product: Product): FoldTableTone =>
    this.hasFaults(product) ? 'warning' : null;

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
    this.page.set(1);
  }

  protected onPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  private readonly membershipById = computed(
    () => new Map(this.memberships().map((entry) => [entry.productId, entry])),
  );

  protected b2bState(product: Product): B2bChannelState {
    return b2bChannelState(this.membershipById().has(product.id));
  }

  protected b2bLabel(product: Product): string {
    return B2B_LABELS[this.b2bState(product)];
  }

  protected b2bVariant(product: Product): FoldBadgeVariant {
    return B2B_VARIANTS[this.b2bState(product)];
  }

  /** L'**appartenance** au canal — c'est ce que le menu bascule. */
  protected onB2bChannel(productId: string): boolean {
    return this.membershipById().has(productId);
  }

  /**
   * Ouvre ou ferme le canal pour une fiche.
   *
   * 🔴 Le geste manquait ENTIÈREMENT : la projection du canal démarre sur cette
   * appartenance, et aucun écran ne l'écrivait. Une fiche neuve ne pouvait
   * atteindre la boutique professionnelle que par un appel d'API.
   */
  protected async setB2b(product: Product, published: boolean): Promise<void> {
    await this.run(() => this.b2b.setMembership(product.id, published));
  }

  protected async setB2bSelected(published: boolean): Promise<void> {
    const ids = this.selectedIds();
    if (ids.length === 0) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.b2b.setMemberships(ids, published);
      await this.reload();
      this.selection.set(new Set());
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : 'Erreur inattendue.');
    } finally {
      this.busy.set(false);
    }
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

  /**
   * Les points de vente qui vendent ce contexte pour cette fiche.
   *
   * Les deux colonnes de la liste restent « à emporter » et « sur place » —
   * une décision d'ÉCRAN, qui a le droit de choisir ce qu'elle affiche. Ce qui
   * a disparu, c'est de le savoir autrement que par la clé qu'on lui donne.
   */
  protected rowSelling(product: Product, contextKey: string): string[] {
    return pointsOfSaleSelling(this.rowChannels(product), contextKey, this.pointsOfSale());
  }

  /**
   * Tous les contextes où cette fiche se vend — la colonne « Canaux ».
   *
   * Elle interrogeait `takeaway` et `eatIn`, deux clés écrites dans le gabarit,
   * et rendait « aucun » quand les deux étaient vides. Une fiche vendue en B2B
   * s'y affichait donc « aucun ». Le registre est une donnée : c'est lui qui
   * dit quels contextes existent, comment ils s'appellent et dans quel ordre.
   */
  protected rowSoldContexts(product: Product): readonly SoldContext[] {
    return soldContexts(this.rowChannels(product), this.contexts.items(), this.pointsOfSale());
  }

  protected rowInherited(product: Product): boolean {
    return product.channelsOverride === null;
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
      this.error.set(caught instanceof Error ? caught.message : 'Erreur inattendue.');
    } finally {
      this.busy.set(false);
    }
  }

  private rowChannels(product: Product): SalesChannels {
    const category = this.byId().get(product.categoryId);
    if (category === undefined) {
      return product.channelsOverride ?? NO_CHANNELS;
    }
    return resolveChannels(product, category).channels;
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      await this.reload();
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : 'Erreur inattendue.');
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      const [products, categories, memberships, rates] = await Promise.all([
        this.api.listProducts(),
        this.api.listCategories(),
        this.b2b.memberships(),
        this.api.listVatRates(),
      ]);
      this.products.set(products);
      this.memberships.set(memberships);
      this.rates.set(rates);
      this.categories.set(categories.filter((category) => !category.isArchived));
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : 'Erreur inattendue.');
    }
  }
}
