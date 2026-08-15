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
import { grainBuckets } from '../../shared/stats-grain/stats-grain';
import { StatsGrainStore } from '../../shared/stats-grain/stats-grain.store';
import { StatsGrainToggle } from '../../shared/stats-grain/stats-grain-toggle/stats-grain-toggle';
import { orderMix, orderMixTotals, type OrderMixBucket } from './order-mix';
import { orderMixOption } from './order-mix.chart';

type LoadState = 'loading' | 'ready' | 'error';

/** Combien de commandes on ramène pour bâtir la série. Plafond serveur = 200. */
const ORDERS_WINDOW = 200;

/** Combien de produits la liste « les plus repris » montre. */
const TOP_SKUS = 10;

/**
 * **Statistiques** d'un compte : ce qu'il pèse, à quel rythme, et sur quoi.
 *
 * Trois lectures qui ne se recoupent pas — les quatre chiffres de la fiche
 * commerciale, la série temporelle bâtie depuis les commandes, et les SKU les
 * plus repris (la même route que celle qui nourrit l'écran de saisie : c'est la
 * même question, « qu'est-ce que ce client achète »).
 *
 * La **temporalité n'appartient pas à cet écran** : elle vient du réglage
 * partagé ({@link StatsGrainStore}), pour qu'une lecture « à la semaine »
 * survive au passage sur un autre tableau.
 *
 * **Rien n'est calculé ici que la série**, et elle l'est à partir des commandes
 * elles-mêmes, faute d'agrégat serveur par compte. La conséquence est dite à
 * l'écran : au-delà de {@link ORDERS_WINDOW} commandes, les périodes les plus
 * anciennes sont incomplètes. Le jour où ce plafond mordra pour de vrai, c'est
 * une agrégation SQL qu'il faudra, pas un plafond plus haut.
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
    StatsGrainToggle,
  ],
  templateUrl: './stats-page.html',
  styleUrl: './stats-page.scss',
})
export class ClientStatsPage {
  readonly id = input.required<string>();

  private readonly sheets = inject(CustomerSheetService);
  private readonly orders = inject(AdminOrdersService);
  private readonly catalog = inject(AdminCatalogService);
  private readonly grainStore = inject(StatsGrainStore);

  protected readonly state = signal<LoadState>('loading');
  private readonly sheet = signal<CustomerSheetView | null>(null);
  private readonly rows = signal<readonly AdminOrderRow[]>([]);
  protected readonly habits = signal<readonly CustomerSkuStat[]>([]);

  protected readonly stats = computed(() => this.sheet()?.stats ?? null);

  /** Vrai quand la fenêtre est pleine : les périodes anciennes sont incomplètes. */
  protected readonly maybeTruncated = computed(() => this.rows().length === ORDERS_WINDOW);

  /** La fenêtre de périodes, dictée par le réglage partagé. */
  private readonly buckets = computed(() => grainBuckets(this.grainStore.grain(), new Date()));

  protected readonly mix = computed<readonly OrderMixBucket[]>(() =>
    orderMix(this.rows(), this.buckets()),
  );

  protected readonly totals = computed(() => orderMixTotals(this.mix()));

  protected readonly chartOption = computed<ChartOption>(() => orderMixOption(this.mix()));

  /** La meilleure période de la fenêtre — `null` quand rien n'a été commandé. */
  protected readonly bestPeriod = computed<OrderMixBucket | null>(() => {
    const best = [...this.mix()].sort((a, b) => b.totalCents - a.totalCents)[0];
    return best === undefined || best.totalCents === 0 ? null : best;
  });

  /**
   * La part du récurrent sur la fenêtre, en pourcentage entier — `null` quand
   * rien n'a été commandé, parce qu'on ne divise pas par rien.
   */
  protected readonly recurringShare = computed<number | null>(() => {
    const { totalCents, recurringCents } = this.totals();
    return totalCents === 0 ? null : Math.round((recurringCents / totalCents) * 100);
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
