import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { CommerceNav } from '../../commerce/commerce-nav/commerce-nav';
import { CommerceContextService } from '../../commerce/commerce-context.service';
import { type BillingPeriod, groupIntoPeriods } from '../billing-periods';
import { BillingPeriodsView } from '../billing-periods-view/billing-periods-view';
import { downloadBon as downloadBonFile } from '../download-bon';
import { OrdersTable } from '../orders-table/orders-table';
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
 * Front-only à ce stade : les lignes viennent d'un seed démo (`orders-demo-seed`).
 */
@Component({
  selector: 'app-commandes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldCalloutComponent,
    FoldViewToggleComponent,
    FoldButtonIconComponent,
    CommerceNav,
    BillingPeriodsView,
    OrdersTable,
  ],
  templateUrl: './commandes-page.html',
  styleUrl: './commandes-page.scss',
})
export class CommandesPage {
  private readonly context = inject(CommerceContextService);

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
