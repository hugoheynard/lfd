import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowDetailDirective,
  type FoldTableColumn,
} from 'fold-ng';

import { formatEuro } from '../../cart-total';
import { ClientCopyService } from '../../copy/client-copy.service';
import type { HistoryOrder, OrderPayment, OrderStatus } from '../../mock-orders';

/** Une note de 1 à 5. Zéro veut dire « pas encore notée », pas « zéro étoile ». */
const STARS = [1, 2, 3, 4, 5] as const;

/**
 * L'historique — un TABLEAU, parce qu'ici on compare.
 *
 * C'est la raison que donne le back-office pour sa propre liste de commandes, et
 * elle vaut pour le client : on ne vient pas lire une commande, on vient
 * retrouver laquelle. Les colonnes sont les siennes, plus « passée par » — un
 * compte multi-espaces doit pouvoir dire *qui* a commandé et *pour quelle
 * maison*.
 *
 * Le tableau lui-même est celui du système. Il l'a remplacé au moment où
 * `fold-data-table` a su ouvrir un tiroir de ligne : jusque-là il manquait LA
 * décision de cet écran — déplier dans la liste plutôt que naviguer — et une
 * table sans elle n'aurait pas été la même table. Ce composant ne garde donc
 * que ce qui lui appartient : ses colonnes, ses pastilles, sa note.
 *
 * Ce qu'on gagne au change et qu'on ne réécrit plus : l'en-tête collant, la
 * première colonne en `<th scope="row">`, la navigation aux flèches entre les
 * lignes, et le repli en cartes sur écran étroit.
 */
@Component({
  selector: 'app-history-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldDataTableRowDetailDirective,
  ],
  templateUrl: './history-table.html',
  styleUrl: './history-table.scss',
})
export class HistoryTable {
  readonly orders = input.required<readonly HistoryOrder[]>();

  /** Le signalement — l'écran décide de la surface qui l'accueille. */
  readonly problemRaised = output<HistoryOrder>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly stars = STARS;

  /** La note donnée, par commande — la maquette la garde le temps de la visite. */
  private readonly rated = signal<Readonly<Record<string, number>>>({});

  protected readonly columns = computed<readonly FoldTableColumn[]>(() => {
    const copy = this.t().orders;
    return [
      { key: 'reference', label: copy.colOrder },
      { key: 'by', label: copy.colBy },
      { key: 'mode', label: copy.colMode },
      { key: 'date', label: copy.colDate },
      { key: 'status', label: copy.colStatus },
      { key: 'payment', label: copy.colPayment },
      { key: 'total', label: copy.colTotal, align: 'right' },
    ];
  });

  /** Les libellés du châssis, dans la langue de l'app — pas ceux de fold. */
  protected readonly labels = computed(() => ({
    expandRow: this.t().orders.expand,
    collapseRow: this.t().orders.collapse,
  }));

  protected readonly key = (order: HistoryOrder): string => order.reference;

  protected pieces(order: HistoryOrder): string {
    return this.t().orders.pieces.replace('{n}', String(order.pieces));
  }

  protected total(order: HistoryOrder): string {
    return formatEuro(order.total);
  }

  protected rate(reference: string, value: number): void {
    this.rated.update((all) => ({ ...all, [reference]: value }));
  }

  protected rating(reference: string): number {
    return this.rated()[reference] ?? 0;
  }

  /**
   * Le libellé de la note — il RÉPOND au geste, et il répond différemment.
   *
   * Au-dessus de 4 on remercie ; en dessous on annonce qu'on regarde. Jamais une
   * pop-up : la note se donne là où la commande vit.
   */
  protected rateLabel(value: number): string {
    const copy = this.t().orders;
    if (value === 0) {
      return copy.rateIdle;
    }
    return value >= 4 ? copy.rateHigh : copy.rateLow;
  }

  protected starLabel(value: number): string {
    return this.t().orders.rateStar.replace('{n}', String(value));
  }

  protected statusLabel(status: OrderStatus): string {
    const copy = this.t().orders;
    const labels: Record<OrderStatus, string> = {
      ready: copy.statusReady,
      route: copy.statusRoute,
      done: copy.statusDone,
      delivered: copy.statusDelivered,
    };
    return labels[status];
  }

  protected paymentLabel(payment: OrderPayment): string {
    const copy = this.t().orders;
    const labels: Record<OrderPayment, string> = {
      account: copy.payAccount,
      card: copy.payCard,
      due: copy.payDue,
    };
    return labels[payment];
  }

  protected paymentNote(payment: OrderPayment): string {
    const copy = this.t().orders;
    const notes: Record<OrderPayment, string> = {
      account: copy.payAccountNote,
      card: copy.payCardNote,
      due: copy.payDueNote,
    };
    return notes[payment];
  }
}
