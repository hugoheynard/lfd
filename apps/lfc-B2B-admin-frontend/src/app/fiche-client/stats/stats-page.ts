import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableComponent,
  FoldDataTableCellDirective,
  FoldEmptyStateComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';
import type { AdminOrderRow, CustomerSheetView, CustomerSkuStat } from '@lfd/contracts';
import { formatCents, formatOrderDate } from '@lfd/b2b-ui/order';

import { Chart, type ChartOption } from '../../shared/chart/chart';
import { AdminCatalogService } from '../../commandes/catalog.service';
import { AdminOrdersService } from '../../commandes/orders.service';
import { CustomerSheetService } from '../../commercial/calendrier/customer-sheet/customer-sheet.service';
import { monthlyRevenue, type MonthlyRevenue } from './monthly-revenue';
import { monthlyRevenueOption } from './monthly-revenue.chart';

type LoadState = 'loading' | 'ready' | 'error';

/** Combien de mois la courbe couvre. Un an : la saisonnalité d'une boulangerie. */
const MONTHS = 12;

/** Combien de commandes on ramène pour bâtir la série. Plafond serveur = 200. */
const ORDERS_WINDOW = 200;

/** Combien de produits la liste « les plus repris » montre. */
const TOP_SKUS = 10;

/**
 * **Statistiques** d'un compte : ce qu'il pèse, à quel rythme, et sur quoi.
 *
 * Trois lectures qui ne se recoupent pas — les quatre chiffres de la fiche
 * commerciale, la série mensuelle bâtie depuis les commandes, et les SKU les
 * plus repris (la même route que celle qui nourrit l'écran de saisie : c'est la
 * même question, « qu'est-ce que ce client achète »).
 *
 * **Rien n'est calculé ici que la série mensuelle**, et elle l'est à partir des
 * commandes elles-mêmes, faute d'agrégat serveur par compte. La conséquence est
 * dite à l'écran : au-delà de {@link ORDERS_WINDOW} commandes, les mois les plus
 * anciens sont incomplets. Le jour où ce plafond mordra pour de vrai, c'est une
 * agrégation SQL qu'il faudra, pas un plafond plus haut.
 */
@Component({
  selector: 'app-client-stats-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chart,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldEmptyStateComponent,
  ],
  templateUrl: './stats-page.html',
  styleUrl: './stats-page.scss',
})
export class ClientStatsPage {
  readonly id = input.required<string>();

  private readonly sheets = inject(CustomerSheetService);
  private readonly orders = inject(AdminOrdersService);
  private readonly catalog = inject(AdminCatalogService);

  protected readonly state = signal<LoadState>('loading');
  private readonly sheet = signal<CustomerSheetView | null>(null);
  private readonly rows = signal<readonly AdminOrderRow[]>([]);
  protected readonly habits = signal<readonly CustomerSkuStat[]>([]);

  protected readonly stats = computed(() => this.sheet()?.stats ?? null);

  /** Vrai quand la fenêtre est pleine : les mois anciens sont alors incomplets. */
  protected readonly maybeTruncated = computed(() => this.rows().length === ORDERS_WINDOW);

  protected readonly months = computed<readonly MonthlyRevenue[]>(() =>
    monthlyRevenue(this.rows(), MONTHS, new Date()),
  );

  protected readonly chartOption = computed<ChartOption>(() => monthlyRevenueOption(this.months()));

  /** Le meilleur mois de la fenêtre — `null` quand rien n'a été commandé. */
  protected readonly bestMonth = computed<MonthlyRevenue | null>(() => {
    const best = [...this.months()].sort((a, b) => b.totalCents - a.totalCents)[0];
    return best === undefined || best.totalCents === 0 ? null : best;
  });

  protected readonly topSkus = computed(() => this.habits().slice(0, TOP_SKUS));

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'productName', label: 'Produit' },
    { key: 'orderCount', label: 'Commandes', width: '7rem', align: 'right' },
    { key: 'totalQuantity', label: 'Quantité', width: '7rem', align: 'right' },
    { key: 'totalCents', label: 'Total HT', width: '8rem', align: 'right' },
    { key: 'lastOrderedAt', label: 'Dernière fois', width: '9rem' },
  ];

  protected readonly emptyState: FoldTableEmpty = {
    title: 'Aucun achat sur douze mois',
    subtitle: "Ce compte n'a rien commandé sur la période.",
  };

  protected readonly rowKey = (row: CustomerSkuStat): string => row.sku;

  protected euros(cents: number): string {
    return formatCents(cents);
  }

  protected day(iso: string): string {
    return formatOrderDate(iso);
  }

  /** « +12 % » / « −8 % », ou `null` quand la période précédente était à zéro. */
  protected readonly trendLabel = computed<string | null>(() => {
    const trend = this.stats()?.trend;
    if (trend === undefined || trend.percent === null) {
      return null;
    }
    const sign = trend.percent > 0 ? '+' : '';
    return `${sign}${Math.round(trend.percent)} %`;
  });

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(id: string = this.id()): Promise<void> {
    this.state.set('loading');
    try {
      const [sheet, rows, habits] = await Promise.all([
        this.sheets.sheet(id),
        this.orders.list({ companyId: id, limit: ORDERS_WINDOW }),
        this.catalog.habitsOf(id),
      ]);
      this.sheet.set(sheet);
      this.rows.set(rows);
      this.habits.set(habits);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
