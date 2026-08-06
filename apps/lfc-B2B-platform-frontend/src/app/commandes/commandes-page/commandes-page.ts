import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import type { OrderView } from '@lfd/contracts';
import {
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldSpinnerComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { CommerceNav } from '../../commerce/commerce-nav/commerce-nav';
import { CommerceContextService } from '../../commerce/commerce-context.service';
import { NotifyService } from '../../notify.service';
import { type BillingPeriod, groupIntoPeriods } from '../billing-periods';
import { BillingPeriodsView } from '../billing-periods-view/billing-periods-view';
import { downloadBon as downloadBonFile } from '../download-bon';
import { MyOrders } from '../my-orders/my-orders';
import { OccurrenceOverridePanel } from '../occurrence-override-panel/occurrence-override-panel';
import { OrdersService } from '../orders.service';
import { OrdersTable } from '../orders-table/orders-table';
import { RecurringOrderPanel } from '../recurring-order-panel/recurring-order-panel';
import { SubscriptionsList } from '../subscriptions-list/subscriptions-list';
import { SubscriptionsService } from '../subscriptions.service';
import { buildDemoOrders, type CommandeRow } from '../orders-demo-seed';
import { buildDemoRegimeChanges, type PaymentRegimeChange } from '../payment-regime-changes';

/** Délai de règlement (jours après clôture). `0` = 1er du mois suivant (front-only). */
const MONTHLY_DUE_DAYS = 0;

/** Les deux représentations du carnet, choisies par le view-toggle. */
type OrdersView = 'periods' | 'all';

/**
 * **Mes commandes** — un `fold-view-toggle` bascule entre deux lectures :
 *
 * - **Par périodes** (cards) : la vue **de base** — relevés mensuels + payé à la
 *   commande, pour l'établissement choisi dans la nav commerce ;
 * - **Toutes les commandes** (list) : la table exhaustive, **par entreprise
 *   gérée** (composant `OrdersTable`).
 *
 * **Zéro friction** : sans entreprise, la page ne bloque plus — elle affiche les
 * **vraies** commandes personnelles (`GET /orders/mine`, via `OrdersService`).
 * Les relevés par période restent la vue riche des personnes rattachées à une
 * entreprise (seed démo `orders-demo-seed` pour l'instant).
 */
@Component({
  selector: 'app-commandes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldSpinnerComponent,
    FoldViewToggleComponent,
    FoldButtonIconComponent,
    CommerceNav,
    BillingPeriodsView,
    OrdersTable,
    MyOrders,
    SubscriptionsList,
  ],
  templateUrl: './commandes-page.html',
  styleUrl: './commandes-page.scss',
})
export class CommandesPage {
  private readonly context = inject(CommerceContextService);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  protected readonly subscriptions = inject(SubscriptionsService);
  protected readonly orders = inject(OrdersService);

  constructor() {
    // Charge les commandes personnelles réelles + les paniers récurrents.
    this.orders.load();
    this.subscriptions.loadMine();
  }

  /** Ouvre le formulaire « transformer en panier récurrent » pour cette commande. */
  protected openRecurring(order: OrderView): void {
    const ref = this.panelHost.open(RecurringOrderPanel, { data: order });
    void ref.closed.then((created) => {
      if (created === true) {
        this.subscriptions.loadMine();
      }
    });
  }

  /** Règlement d'une commande — endpoint de settle par commande à câbler (à venir). */
  protected onSettle(order: OrderView): void {
    this.notify.info(`Le règlement en ligne de ${order.orderNumber} arrive bientôt.`);
  }

  /** Ouvre le panneau « modifier cette commande » pour une échéance précise. */
  protected onEditOccurrence(event: { subscriptionId: string; date: string }): void {
    const subscription = this.subscriptions
      .list()
      .find((entry) => entry.id === event.subscriptionId);
    if (subscription === undefined) {
      return;
    }
    const ref = this.panelHost.open(OccurrenceOverridePanel, {
      data: { subscription, date: event.date },
    });
    void ref.closed.then((saved) => {
      if (saved === true) {
        this.subscriptions.loadMine();
      }
    });
  }

  /** Instant de référence, figé (une lecture ⇒ un `computed` pur). */
  private readonly now = new Date();

  protected readonly hasCompany = this.context.hasCompany;
  protected readonly selected = this.context.selected;

  /** Vue active — « par périodes » par défaut (la vue de base). */
  protected readonly view = signal<OrdersView>('periods');

  protected readonly viewOptions: readonly FoldViewToggleOption[] = [
    { value: 'periods', icon: 'grid', label: 'Par périodes' },
    { value: 'all', icon: 'list', label: 'Toutes les commandes' },
  ];

  protected setView(value: string): void {
    this.view.set(value === 'all' ? 'all' : 'periods');
  }

  /** Année courante — borne haute du navigateur (pas de commandes futures). */
  protected readonly currentYear = this.now.getFullYear();

  /** Année affichée — sert de filtre de pagination naturel. Défaut : année en cours. */
  protected readonly year = signal<number>(this.currentYear);

  protected prevYear(): void {
    this.year.update((y) => y - 1);
  }

  protected nextYear(): void {
    this.year.update((y) => Math.min(y + 1, this.currentYear));
  }

  private readonly rows = computed<readonly CommandeRow[]>(() => {
    const company = this.selected();
    return company === null ? [] : buildDemoOrders(company);
  });

  /** Commandes de l'établissement filtrées sur l'année affichée. */
  private readonly yearRows = computed<readonly CommandeRow[]>(() =>
    this.rows().filter((row) => new Date(row.date).getFullYear() === this.year()),
  );

  /** Commandes payées à la commande (hors relevé) — colonne de droite. */
  protected readonly immediateOrders = computed<readonly CommandeRow[]>(() =>
    this.yearRows().filter((row) => row.paid),
  );

  /** Changements de régime de règlement (frise) — seed démo front-only. */
  protected readonly regimeChanges: readonly PaymentRegimeChange[] = buildDemoRegimeChanges(
    this.now,
  );

  /** Clés de périodes réglées (relevés mensuels, stub front-only). */
  protected readonly settledPeriods = signal<ReadonlySet<string>>(new Set());

  /** Relevés mensuels : seules les commandes **non** payées immédiatement entrent au relevé. */
  protected readonly periods = computed<readonly BillingPeriod[]>(() => {
    const settled = this.settledPeriods();
    const releve = this.yearRows().filter((row) => !row.paid);
    return groupIntoPeriods(releve, MONTHLY_DUE_DAYS, this.now).map((period) =>
      settled.has(period.key) ? { ...period, status: 'paid' } : period,
    );
  });

  /** Règle un relevé mensuel — stub front-only : la période passe « Réglé ». */
  protected settlePeriod(period: BillingPeriod): void {
    this.settledPeriods.update((set) => new Set(set).add(period.key));
  }

  /** Télécharge le bon de commande (util partagé, côté navigateur). */
  protected downloadBon(row: CommandeRow): void {
    downloadBonFile(row);
  }
}
