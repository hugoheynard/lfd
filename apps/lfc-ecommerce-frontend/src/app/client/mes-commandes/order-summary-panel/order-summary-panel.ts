import { NgTemplateOutlet } from '@angular/common';
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
import type {
  CompanyOrderSummaryView,
  OrderSummaryProductView,
  OrderSummaryTableView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  type FoldTableColumn,
} from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { formatCents } from '../../format-money';
import { panelSide } from '../../panel-side';
import { quantityLabel } from '../../shop/sale-unit';
import { downloadBlob } from '../download-blob';
import { OrderSummaryOrders } from '../order-summary-orders/order-summary-orders';
import {
  exclusionLabel,
  orderCountLabel,
  periodLabel,
  summaryBottomLines,
  type SummaryBottomLine,
} from '../order-summary-format';
import {
  type OrderSummaryFileFormat,
  OrderSummaryRefused,
  type OrderSummarySelection,
  OrderSummaryService,
} from '../order-summary.service';

/** L'état du récapitulatif à l'écran. */
type Loaded =
  | { readonly kind: 'loading' }
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'ready'; readonly summary: CompanyOrderSummaryView };

/** Une table telle que le gabarit la dessine. */
interface SummaryBlock {
  readonly key: string;
  readonly title: string;
  readonly count: string;
  readonly products: readonly OrderSummaryProductView[];
  readonly bottom: readonly SummaryBottomLine[];
}

/**
 * **Le récapitulatif des commandes cochées** (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, lot R3) —
 * une CONSULTATION, donc sur le côté (`panelSide()`), pas un dialogue.
 *
 * Tout vient du serveur, qui calcule : une table par société (le compte puis
 * ses sites), son bas comme une facture, le total général — ses produits ne
 * sont répétés que s'il y a plusieurs sociétés, comme au PDF —, puis les
 * commandes exclues et pourquoi, puis les bons de commande inclus, repliés
 * (§10). « PDF » et « Tableur » renvoient LA MÊME
 * sélection et la période affichée ; le nom du fichier est celui du serveur.
 * Un refus (un id hors du mur, le plafond) s'affiche avec SON message.
 */
@Component({
  selector: 'app-order-summary-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelHeaderComponent,
    NgTemplateOutlet,
    OrderSummaryOrders,
  ],
  templateUrl: './order-summary-panel.html',
  styleUrl: './order-summary-panel.scss',
})
export class OrderSummaryPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'lg', surface: 'solid' };

  static open(panels: FoldPanelHostService, selection: OrderSummarySelection): void {
    panels.open<OrderSummarySelection, void>(OrderSummaryPanel, {
      side: panelSide(),
      data: selection,
    });
  }

  readonly data = input.required<OrderSummarySelection>();

  private readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale);
  private readonly summaries = inject(OrderSummaryService);

  protected readonly copy = computed(() => this.t().orders.summary);
  protected readonly closeLabel = computed(() => this.t().dialog.close);

  protected readonly state = signal<Loaded>({ kind: 'loading' });
  protected readonly exporting = signal<OrderSummaryFileFormat | null>(null);
  protected readonly exportRefusal = signal<string | null>(null);

  /** Le message du refus, celui du serveur quand il en porte un. */
  protected readonly refusal = computed(() => {
    const state = this.state();
    return state.kind === 'refused' ? state.message : '';
  });

  /** La période du filtre affiché, sinon la taille de la sélection. */
  protected readonly subtitle = computed(() => {
    const selection = this.data();
    return (
      periodLabel(selection.period, this.copy(), this.locale.current()) ??
      fill(this.copy().selection, { n: String(selection.orderIds.length) })
    );
  });

  protected readonly selectionLine = computed(() =>
    fill(this.copy().selection, { n: String(this.data().orderIds.length) }),
  );

  protected readonly companies = computed<readonly SummaryBlock[]>(() => {
    const state = this.state();
    return state.kind === 'ready'
      ? state.summary.companies.map((company) =>
          this.blockOf(company.companyId, company.name, company),
        )
      : [];
  });

  /** Le total général ; une seule société, sa table EST le total : on n'en garde que le bas. */
  protected readonly total = computed<SummaryBlock | null>(() => {
    const state = this.state();
    if (state.kind !== 'ready') {
      return null;
    }
    const block = this.blockOf('total', this.copy().grandTotal, state.summary.total);
    return state.summary.companies.length > 1 ? block : { ...block, products: [] };
  });

  /** Le récapitulatif servi, pour la liste des bons ; `null` avant lui. */
  protected readonly ready = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.summary : null;
  });

  protected readonly excluded = computed(() => {
    const state = this.state();
    return state.kind === 'ready'
      ? state.summary.excluded.map((order) => ({
          orderId: order.orderId,
          text: `${order.orderNumber} — ${exclusionLabel(order.reason, this.copy())}`,
        }))
      : [];
  });

  protected readonly columns = computed<readonly FoldTableColumn<OrderSummaryProductView>[]>(() => {
    const copy = this.copy();
    return [
      // Sans `foldCell`, une colonne ne rend que ce que `value` lui donne.
      { key: 'name', label: copy.colProduct, value: (product) => product.name },
      { key: 'sku', label: copy.colSku, value: (product) => product.sku },
      {
        key: 'quantity',
        label: copy.colQuantity,
        numeric: true,
        // Au poids, des grammes dits « 1,25 kg » (`plan-vente-au-poids.md`, P5).
        value: (product) => quantityLabel(product.quantity, product.saleUnit),
      },
      {
        key: 'htCents',
        label: copy.colHt,
        numeric: true,
        value: (product) => formatCents(product.htCents),
      },
    ];
  });

  protected readonly productKey = (product: OrderSummaryProductView): string => product.sku;

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const selection = this.data();
      untracked(() => void this.load(selection));
    });
  }

  protected download(format: OrderSummaryFileFormat): void {
    void this.fetchFile(format);
  }

  private async load(selection: OrderSummarySelection): Promise<void> {
    this.state.set({ kind: 'loading' });
    try {
      this.state.set({ kind: 'ready', summary: await this.summaries.summarize(selection) });
    } catch (error) {
      this.state.set({ kind: 'refused', message: this.messageOf(error, this.copy().failed) });
    }
  }

  private async fetchFile(format: OrderSummaryFileFormat): Promise<void> {
    if (this.exporting() !== null) {
      return;
    }
    this.exporting.set(format);
    this.exportRefusal.set(null);
    try {
      const file = await this.summaries.file(this.data(), format);
      downloadBlob(file.fileName, file.blob);
    } catch (error) {
      this.exportRefusal.set(this.messageOf(error, this.copy().exportFailed));
    } finally {
      this.exporting.set(null);
    }
  }

  private messageOf(error: unknown, fallback: string): string {
    return error instanceof OrderSummaryRefused && error.serverMessage !== null
      ? error.serverMessage
      : fallback;
  }

  private blockOf(key: string, title: string, table: OrderSummaryTableView): SummaryBlock {
    return {
      key,
      title,
      count: orderCountLabel(table.orderCount, this.copy()),
      products: table.products,
      bottom: summaryBottomLines(table.bottom, this.copy()),
    };
  }
}
