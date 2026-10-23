import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { AdminOrderRow } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldDateComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPaginatorComponent,
  FoldSearchComponent,
  type FoldPaginatorLabels,
  type FoldTableEmpty,
} from 'fold-ng';

import { FROM_ORDER_LIST } from '../order-list-return';
import {
  ANY,
  CLIENTELE_CHOICES,
  METHOD_CHOICES,
  NO_FILTERS,
  PAYMENT_CHOICES,
  STATUS_CHOICES,
  filtersFromParams,
  filtersToParams,
  filtersToQuery,
  hasFilters,
  type Choice,
  type OrderListFilterKey,
  type OrderListFilters,
} from '../order-list-filters';
import { SitePaletteStore } from '../../shared/logistics-colors/site-palette.store';
import { AdminOrdersService } from '../orders.service';
import { OrdersTable } from '../orders-table/orders-table';

type LoadState = 'loading' | 'ready' | 'error';

/** Une page de la liste : assez pour une semaine ordinaire, pas toute la table. */
export const ORDER_LIST_PAGE_SIZE = 50;

/** Le paginator parle anglais par défaut ; cet écran, non. */
const PAGINATOR_LABELS: FoldPaginatorLabels = {
  pageSize: 'Commandes par page',
  perPage: 'par page',
  nav: 'Pagination des commandes',
  previous: 'Page précédente',
  next: 'Page suivante',
  empty: 'Aucune commande',
  page: (page) => `Page ${page}`,
  range: (start, end, total) => `${start}–${end} sur ${total}`,
};

/** Le numéro de page de l'adresse ; tout ce qui n'est pas un entier ≥ 1 vaut 1. */
function pageOf(raw: string | undefined): number {
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/** Les filtres-jours, ceux que porte un `fold-date`. */
type DayKey = 'placedFrom' | 'placedTo' | 'fulfillmentFrom' | 'fulfillmentTo';
/** Les filtres-choix, ceux que porte un `fold-listbox`. */
type ChoiceKey = 'clientele' | 'method' | 'status' | 'paymentStatus';

function sameFilters(left: OrderListFilters, right: OrderListFilters): boolean {
  return (Object.keys(NO_FILTERS) as OrderListFilterKey[]).every((key) => left[key] === right[key]);
}

/**
 * **Toutes les commandes** — pro et particuliers, retrait et livraison, la plus
 * récente en tête (plan-page-commandes.md, lot C2).
 *
 * Le même tableau que l'onglet Commandes d'un compte (`app-orders-table`),
 * élargi au client et au jour de retrait ou de livraison. Les filtres vivent
 * dans l'URL — liés en `input()` par `withComponentInputBinding`, comme un
 * segment de route : l'adresse est la seule source, la page la relit et
 * recharge. Un filtre changé RÉÉCRIT l'adresse (`replaceUrl`) au lieu d'empiler
 * une entrée d'historique par frappe.
 *
 * Pages **numérotées** de 50 (2026-10-23, comme Comptes clients) : le numéro
 * vit dans l'adresse (`page`, absent = 1), à côté des filtres, pour qu'un
 * retour depuis le détail retombe sur la même page. Un filtre réécrit
 * l'adresse sans `page` : il ramène donc à la première. Le total vient du
 * serveur, qui ne compte que ce que les filtres laissent passer.
 */
@Component({
  selector: 'app-orders-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldDateComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPaginatorComponent,
    FoldSearchComponent,
    OrdersTable,
  ],
  templateUrl: './orders-list-page.html',
  styleUrl: './orders-list-page.scss',
})
export class OrdersListPage {
  // Les paramètres d'URL, sous les noms mêmes de `GET /admin/orders`.
  readonly clientele = input<string>();
  readonly method = input<string>();
  readonly status = input<string>();
  readonly paymentStatus = input<string>();
  readonly placedFrom = input<string>();
  readonly placedTo = input<string>();
  readonly fulfillmentFrom = input<string>();
  readonly fulfillmentTo = input<string>();
  readonly q = input<string>();
  /** Le numéro de page, `1` quand il est absent ou illisible. */
  readonly page = input<string>();

  private readonly orders = inject(AdminOrdersService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  /** La couleur de la colonne « Mode » — relue à chaque ouverture, cf. `SitePaletteStore`. */
  protected readonly palette = inject(SitePaletteStore);

  protected readonly filters = computed<OrderListFilters>(
    () =>
      filtersFromParams({
        clientele: this.clientele(),
        method: this.method(),
        status: this.status(),
        paymentStatus: this.paymentStatus(),
        placedFrom: this.placedFrom(),
        placedTo: this.placedTo(),
        fulfillmentFrom: this.fulfillmentFrom(),
        fulfillmentTo: this.fulfillmentTo(),
        q: this.q(),
      }),
    { equal: sameFilters },
  );

  protected readonly currentPage = computed(() => pageOf(this.page()));

  protected readonly state = signal<LoadState>('loading');
  protected readonly rows = signal<readonly AdminOrderRow[]>([]);
  /** Combien de commandes répondent aux filtres, toutes pages confondues. */
  protected readonly total = signal(0);

  protected readonly pageSize = ORDER_LIST_PAGE_SIZE;
  /** Taille fixe : pas de sélecteur. */
  protected readonly pageSizes: readonly number[] = [];
  protected readonly paginatorLabels = PAGINATOR_LABELS;

  protected readonly ANY = ANY;
  protected readonly clienteleChoices = CLIENTELE_CHOICES;
  protected readonly methodChoices = METHOD_CHOICES;
  protected readonly statusChoices = STATUS_CHOICES;
  protected readonly paymentChoices = PAYMENT_CHOICES;

  protected readonly filtered = computed(() => hasFilters(this.filters()));

  /** Le vide d'un filtre n'est pas le vide de la maison : il ne dit pas la même chose. */
  protected readonly empty = computed<FoldTableEmpty>(() =>
    this.filtered()
      ? {
          title: 'Aucune commande ne correspond',
          subtitle: 'Élargissez la période ou retirez un filtre.',
        }
      : { title: 'Aucune commande', subtitle: "Rien n'a encore été commandé." },
  );

  /**
   * Chaque chargement porte son numéro : une réponse arrivée après qu'un autre
   * filtre a été posé est jetée, sans quoi une recherche lente écraserait la
   * liste de la suivante.
   */
  private generation = 0;

  constructor() {
    void this.palette.refresh();
    effect(() => {
      const filters = this.filters();
      const page = this.currentPage();
      untracked(() => void this.load(filters, page));
    });
  }

  protected async load(
    filters: OrderListFilters = this.filters(),
    page: number = this.currentPage(),
  ): Promise<void> {
    const generation = ++this.generation;
    this.state.set('loading');
    try {
      const result = await this.orders.list({
        ...filtersToQuery(filters),
        page,
        limit: ORDER_LIST_PAGE_SIZE,
      });
      if (generation !== this.generation) {
        return;
      }
      const lastPage = Math.max(1, Math.ceil(result.total / ORDER_LIST_PAGE_SIZE));
      // Une adresse gardée après que la liste a rétréci : on recale sur la
      // dernière page plutôt que d'afficher un vide qui n'en est pas un.
      if (result.rows.length === 0 && page > lastPage) {
        this.goToPage(lastPage);
        return;
      }
      this.rows.set(result.rows);
      this.total.set(result.total);
      this.state.set('ready');
    } catch {
      if (generation === this.generation) {
        this.state.set('error');
      }
    }
  }

  /** Écrit la page dans l'adresse, filtres conservés ; la page 1 n'y figure pas. */
  protected goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...filtersToParams(this.filters()), page: page > 1 ? page : null },
      replaceUrl: true,
    });
  }

  protected choice<K extends ChoiceKey>(key: K): Choice<NonNullable<OrderListFilters[K]>> {
    return this.filters()[key] ?? ANY;
  }

  protected setChoice<K extends ChoiceKey>(
    key: K,
    value: Choice<NonNullable<OrderListFilters[K]>>,
  ): void {
    this.apply({ [key]: value === ANY ? null : value });
  }

  protected setDay(key: DayKey, value: string): void {
    this.apply({ [key]: value === '' ? null : value });
  }

  protected setSearch(term: string): void {
    this.apply({ q: term === '' ? null : term });
  }

  protected clearFilters(): void {
    this.apply(NO_FILTERS);
  }

  /**
   * Écrit les filtres dans l'adresse ; la page se recharge en la relisant.
   * Sans `page` : un autre filtre, c'est repartir de la première.
   */
  private apply(change: Partial<OrderListFilters>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: filtersToParams({ ...this.filters(), ...change }),
      replaceUrl: true,
    });
  }

  /**
   * Ouvrir une commande, en disant au détail qu'on vient d'ICI : son retour
   * revient alors en arrière dans l'historique, sur cette adresse et ses
   * filtres, au lieu d'une liste remise à zéro.
   */
  protected openOrder(row: AdminOrderRow): void {
    void this.router.navigate(['/commandes', row.id], { state: { [FROM_ORDER_LIST]: true } });
  }
}
