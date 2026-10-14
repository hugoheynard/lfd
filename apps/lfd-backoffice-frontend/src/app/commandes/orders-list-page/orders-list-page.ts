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
  FoldCalloutComponent,
  FoldDateComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldSearchComponent,
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
type MoreState = 'idle' | 'loading' | 'error';

/** Une page de la liste : assez pour une semaine ordinaire, pas toute la table. */
export const ORDER_LIST_PAGE_SIZE = 50;

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
 * « Charger plus » renvoie le `nextCursor` tel quel ; son échec n'efface rien de
 * ce qui est déjà à l'écran (un `fold-callout`, pas un écran d'erreur).
 */
@Component({
  selector: 'app-orders-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDateComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
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

  protected readonly state = signal<LoadState>('loading');
  protected readonly more = signal<MoreState>('idle');
  protected readonly rows = signal<readonly AdminOrderRow[]>([]);
  protected readonly nextCursor = signal<string | null>(null);

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
      untracked(() => void this.load(filters));
    });
  }

  protected async load(filters: OrderListFilters = this.filters()): Promise<void> {
    const generation = ++this.generation;
    this.state.set('loading');
    this.more.set('idle');
    try {
      const page = await this.orders.list({
        ...filtersToQuery(filters),
        limit: ORDER_LIST_PAGE_SIZE,
      });
      if (generation !== this.generation) {
        return;
      }
      this.rows.set(page.rows);
      this.nextCursor.set(page.nextCursor);
      this.state.set('ready');
    } catch {
      if (generation === this.generation) {
        this.state.set('error');
      }
    }
  }

  /** La page suivante, ajoutée sous la précédente. Un échec laisse tout en place. */
  protected async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (cursor === null || this.more() === 'loading') {
      return;
    }
    const generation = this.generation;
    this.more.set('loading');
    try {
      const page = await this.orders.list({
        ...filtersToQuery(this.filters()),
        cursor,
        limit: ORDER_LIST_PAGE_SIZE,
      });
      if (generation !== this.generation) {
        return;
      }
      this.rows.update((rows) => [...rows, ...page.rows]);
      this.nextCursor.set(page.nextCursor);
      this.more.set('idle');
    } catch {
      if (generation === this.generation) {
        this.more.set('error');
      }
    }
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

  /** Écrit les filtres dans l'adresse ; la page se recharge en la relisant. */
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
