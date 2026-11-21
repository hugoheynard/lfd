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
import type { AccountAlertView, AdminOrderRow } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDateComponent,
  FoldEmptyStateComponent,
  FoldCheckboxComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPaginatorComponent,
  FoldPanelHostService,
  FoldSearchComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldPaginatorLabels,
  type FoldTabItem,
  type FoldTableEmpty,
} from 'fold-ng';

import { FROM_ORDER_LIST } from '../order-list-return';
import { AccountAlertRulesService } from '../../fiche-client/alertes/account-alert-rules.service';
import { PermissionsStore } from '../../auth/permissions.store';
import { parisToday } from '../../shared/paris-today';
import { NewOrderDialog } from '../new-order-dialog/new-order-dialog';
import { OrdersListMasthead } from '../orders-list-masthead/orders-list-masthead';
import { scopeDays, scopeOf, type OrdersScope } from '../orders-scope';
import { watchGlobalSubjects } from '../../shared/version/watch-global-subjects';
import {
  ANY,
  CANCELLED_SHOWN,
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
  type OrderListTab,
} from '../order-list-filters';
import { SitePaletteStore } from '../../shared/logistics-colors/site-palette.store';
import { AdminOrdersService } from '../orders.service';
import { OrderDraftsList } from '../order-drafts-list/order-drafts-list';
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

/**
 * Les listes. Une tentative de règlement par carte abandonnée garde son
 * numéro, mais n'est pas une commande : elle se consulte à part (décidé par
 * Hugo le 2026-11-13).
 */
const TABS: readonly FoldTabItem<OrdersPageTab>[] = [
  { key: 'orders', label: 'Commandes', icon: 'shopping-cart' },
  { key: 'abandoned_attempts', label: 'Tentatives abandonnées', icon: 'credit-card' },
  { key: 'drafts', label: 'Brouillons', icon: 'edit' },
];

/**
 * « À vérifier » (plan du visa des commandes, V3) : les commandes qu'un client
 * pro a passées seul, que le commercial relit. Seulement sous
 * `b2b_order_review:read` — le serveur refuse la vue sans.
 */
const TO_REVIEW_TAB = {
  key: 'to_review',
  label: 'À vérifier',
  icon: 'check',
} as const satisfies FoldTabItem<OrdersPageTab>;

/**
 * Les onglets de la page. « Brouillons » n'est pas une liste de commandes —
 * une saisie mise de côté n'en est pas une (Hugo, 2026-11-21) : il ne passe
 * ni par les filtres ni par `GET /admin/orders`.
 */
type OrdersPageTab = OrderListTab | typeof DRAFTS_TAB;
const DRAFTS_TAB = 'drafts';

/** Le vide de chaque liste, sans filtre puis avec. */
const EMPTY: Readonly<
  Record<OrderListTab, { readonly bare: FoldTableEmpty; readonly filtered: FoldTableEmpty }>
> = {
  orders: {
    bare: { title: 'Aucune commande', subtitle: "Rien n'a encore été commandé." },
    filtered: {
      title: 'Aucune commande ne correspond',
      subtitle: 'Élargissez la période ou retirez un filtre.',
    },
  },
  to_review: {
    bare: {
      title: 'Rien à vérifier',
      subtitle: 'Toutes les commandes passées par les clients pro ont été vérifiées.',
    },
    filtered: {
      title: 'Aucune commande à vérifier ne correspond',
      subtitle: 'Élargissez la période ou retirez un filtre.',
    },
  },
  abandoned_attempts: {
    bare: {
      title: 'Aucune tentative abandonnée',
      subtitle: "Aucun règlement par carte n'a été abandonné sans avoir été payé.",
    },
    filtered: {
      title: 'Aucune tentative ne correspond',
      subtitle: 'Élargissez la période ou retirez un filtre.',
    },
  },
};

/** Le nom de chaque liste, pour les lecteurs d'écran. */
const CAPTIONS: Readonly<Record<OrderListTab, string>> = {
  orders: 'Toutes les commandes',
  to_review: 'Commandes à vérifier',
  abandoned_attempts: 'Tentatives abandonnées',
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
 * récente en tête (page-commandes.md, lot C2).
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
    FoldCalloutComponent,
    FoldDateComponent,
    FoldEmptyStateComponent,
    FoldCheckboxComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPaginatorComponent,
    FoldSearchComponent,
    FoldTabPanelComponent,
    OrderDraftsList,
    FoldTabsComponent,
    OrdersListMasthead,
    OrdersTable,
  ],
  templateUrl: './orders-list-page.html',
  styleUrl: './orders-list-page.scss',
})
export class OrdersListPage {
  // Les paramètres d'URL, sous les noms mêmes de `GET /admin/orders`.
  readonly view = input<string>();
  readonly clientele = input<string>();
  readonly method = input<string>();
  readonly status = input<string>();
  readonly paymentStatus = input<string>();
  readonly placedFrom = input<string>();
  readonly placedTo = input<string>();
  readonly fulfillmentFrom = input<string>();
  readonly fulfillmentTo = input<string>();
  readonly q = input<string>();
  /** `shown` : les annulées aussi ; absent, elles sont masquées (le défaut). */
  readonly cancelled = input<string>();
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
        view: this.view(),
        clientele: this.clientele(),
        method: this.method(),
        status: this.status(),
        paymentStatus: this.paymentStatus(),
        placedFrom: this.placedFrom(),
        placedTo: this.placedTo(),
        fulfillmentFrom: this.fulfillmentFrom(),
        fulfillmentTo: this.fulfillmentTo(),
        q: this.q(),
        cancelled: this.cancelled(),
      }),
    { equal: sameFilters },
  );

  protected readonly currentPage = computed(() => pageOf(this.page()));

  /** Le jour de Paris à l'ouverture : le cadrage « aujourd'hui » s'y lit. */
  protected readonly today = parisToday();
  protected readonly scope = computed(() => scopeOf(this.filters(), this.today));
  /** Saisir une commande demande la caisse et la passation, comme la route. */
  private readonly permissions = inject(PermissionsStore);
  protected readonly canPlace =
    this.permissions.can('b2b_counter:read') && this.permissions.can('b2b_place_order:write');
  private readonly panels = inject(FoldPanelHostService);

  /** Le choix pro ou particulier, en dialogue centré : la liste reste derrière. */
  protected openNewOrder(): void {
    this.panels.open(NewOrderDialog, {
      side: 'center',
      width: 'sm',
      data: { origin: '/commandes', point: null },
    });
  }

  private readonly alertsApi = inject(AccountAlertRulesService);
  /**
   * Les alertes des commandes de la page, sous l'onglet « À vérifier » (V4) ;
   * `null` ailleurs — le tableau n'a alors pas de tiroir.
   */
  protected readonly alerts = signal<ReadonlyMap<string, readonly AccountAlertView[]> | null>(null);
  /** La lecture des alertes a échoué : la liste reste, un encadré le dit. */
  protected readonly alertsFailed = signal(false);
  /** L'alerte dont l'acquittement est en vol. */
  protected readonly acknowledging = signal<string | null>(null);
  protected readonly acknowledgeError = signal<string | null>(null);

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

  /**
   * Un filtre posé EN PLUS du cadrage : sous « aujourd'hui » ou « demain », le
   * jour est le cadrage, pas un filtre à retirer.
   */
  protected readonly filtered = computed(() => {
    const filters = this.filters();
    return this.dayScoped()
      ? hasFilters({ ...filters, fulfillmentFrom: null, fulfillmentTo: null })
      : hasFilters(filters);
  });

  /** Le panneau des filtres, déplié sur mobile et tablette. */
  protected readonly filtersOpen = signal(false);

  /** Le nombre de filtres posés en plus du cadrage et de la recherche : le bouton l'affiche. */
  protected readonly activeCount = computed(() => {
    const { view, q, ...rest } = this.filters();
    const counted = this.dayScoped()
      ? { ...rest, fulfillmentFrom: null, fulfillmentTo: null }
      : rest;
    return Object.values(counted).filter((value) => value !== null).length;
  });

  /** Aujourd'hui ou demain : le cadrage tient la date, et les champs de dates se taisent. */
  protected readonly dayScoped = computed(() => {
    const scope = this.scope();
    return scope === 'today' || scope === 'tomorrow';
  });

  /** Vérifier : l'onglet, et son compte dans la pastille. */
  protected readonly canReview = this.permissions.can('b2b_order_review:read');
  /** Combien de commandes attendent leur vérification ; `null` tant qu'on ne le sait pas. */
  protected readonly toReviewCount = signal<number | null>(null);
  protected readonly tabs = computed<readonly FoldTabItem<OrdersPageTab>[]>(() =>
    this.canReview
      ? TABS.flatMap((tab) =>
          tab.key === 'orders'
            ? [tab, { ...TO_REVIEW_TAB, badge: this.toReviewCount() || null }]
            : [tab],
        )
      : TABS,
  );
  /** L'onglet des brouillons : ni filtres, ni tableau des commandes. */
  protected readonly draftsTab = computed(() => this.view() === DRAFTS_TAB);
  /** La liste de commandes affichée — celle des filtres, hors brouillons. */
  private readonly listTab = computed<OrderListTab>(() => this.filters().view ?? 'orders');
  protected readonly tab = computed<OrdersPageTab>(() =>
    this.draftsTab() ? DRAFTS_TAB : this.listTab(),
  );

  protected readonly caption = computed(() => CAPTIONS[this.listTab()]);

  /** Le vide d'un filtre n'est pas le vide de la maison : il ne dit pas la même chose. */
  protected readonly empty = computed<FoldTableEmpty>(() =>
    // Le cadrage compte : une journée vide n'est pas une maison vide.
    hasFilters(this.filters()) ? EMPTY[this.listTab()].filtered : EMPTY[this.listTab()].bare,
  );

  /**
   * Chaque chargement porte son numéro : une réponse arrivée après qu'un autre
   * filtre a été posé est jetée, sans quoi une recherche lente écraserait la
   * liste de la suivante.
   */
  private generation = 0;

  constructor() {
    void this.palette.refresh();
    void this.countToReview();
    effect(() => {
      const filters = this.filters();
      const page = this.currentPage();
      if (this.draftsTab()) {
        return;
      }
      untracked(() => void this.load(filters, page));
    });
    // Une commande passée ou changée ailleurs : la page se relit, filtres gardés.
    watchGlobalSubjects(['orders-all'], async () => {
      await Promise.all([
        this.load(this.filters(), this.currentPage(), { quiet: true }),
        this.countToReview(),
      ]);
    });
  }

  /**
   * `quiet` : relecture de fond (le veilleur) — la liste reste à l'écran
   * pendant la lecture, et un échec la laisse telle quelle.
   */
  protected async load(
    filters: OrderListFilters = this.filters(),
    page: number = this.currentPage(),
    { quiet = false }: { readonly quiet?: boolean } = {},
  ): Promise<void> {
    const generation = ++this.generation;
    const background = quiet && this.state() === 'ready';
    if (!background) {
      this.state.set('loading');
    }
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
      if (filters.view === 'to_review') {
        this.toReviewCount.set(result.total);
      }
      this.state.set('ready');
      void this.loadAlerts(filters, result.rows);
    } catch {
      if (generation === this.generation && !background) {
        this.state.set('error');
      }
    }
  }

  /**
   * Le compte de la pastille « À vérifier » : une page d'une ligne, dont seul
   * le total sert. Un échec laisse la pastille vide — l'onglet, lui, reste.
   */
  private async countToReview(): Promise<void> {
    if (!this.canReview) {
      return;
    }
    try {
      const result = await this.orders.list({ view: 'to_review', page: 1, limit: 1 });
      this.toReviewCount.set(result.total);
    } catch {
      this.toReviewCount.set(null);
    }
  }

  /** Les alertes de la page, en une lecture — sous l'onglet « À vérifier » seulement. */
  private async loadAlerts(
    filters: OrderListFilters,
    rows: readonly AdminOrderRow[],
  ): Promise<void> {
    if (filters.view !== 'to_review' || rows.length === 0) {
      this.alerts.set(null);
      this.alertsFailed.set(false);
      return;
    }
    const generation = this.generation;
    try {
      const alerts = await this.alertsApi.listOrderAlerts(rows.map((row) => row.id));
      if (generation !== this.generation) {
        return;
      }
      const byOrder = new Map<string, AccountAlertView[]>();
      for (const alert of alerts) {
        byOrder.set(alert.orderId, [...(byOrder.get(alert.orderId) ?? []), alert]);
      }
      this.alerts.set(byOrder);
      this.alertsFailed.set(false);
    } catch {
      if (generation === this.generation) {
        this.alerts.set(new Map());
        this.alertsFailed.set(true);
      }
    }
  }

  /** « Acquitter » une alerte du tiroir, puis relire les alertes de la page. */
  protected async acknowledge(alertId: string): Promise<void> {
    this.acknowledging.set(alertId);
    this.acknowledgeError.set(null);
    try {
      await this.alertsApi.acknowledge(alertId);
      await this.loadAlerts(this.filters(), this.rows());
    } catch {
      this.acknowledgeError.set("L'alerte n'a pas pu être acquittée. Réessayez.");
    } finally {
      this.acknowledging.set(null);
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

  /** « Masquer les annulées », cochée par défaut : décochée, l'adresse le dit. */
  protected setHideCancelled(hide: boolean): void {
    this.apply({ cancelled: hide ? null : CANCELLED_SHOWN });
  }

  /** Change de liste ; les filtres suivent, la page repart de la première. */
  protected selectTab(tab: OrdersPageTab): void {
    if (tab === DRAFTS_TAB) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { view: DRAFTS_TAB },
        replaceUrl: true,
      });
      return;
    }
    this.apply({ view: tab === 'orders' ? null : tab });
  }

  /** Le cadrage réécrit les bornes du jour de service ; le reste des filtres tient. */
  protected selectScope(scope: OrdersScope): void {
    this.apply(scopeDays(scope, this.today));
  }

  /** Une carte du masthead : ses filtres remplacent tous les autres, onglet compris. */
  protected showCard(filters: OrderListFilters): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: filtersToParams(filters),
      replaceUrl: true,
    });
  }

  /** Les filtres tombent ; l'onglet reste. */
  protected clearFilters(): void {
    const { view, fulfillmentFrom, fulfillmentTo } = this.filters();
    this.apply(
      this.dayScoped()
        ? { ...NO_FILTERS, view, fulfillmentFrom, fulfillmentTo }
        : { ...NO_FILTERS, view },
    );
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
