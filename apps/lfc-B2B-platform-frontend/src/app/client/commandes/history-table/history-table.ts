import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

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
 * Le dépli ouvre DANS le tableau. Un écran de détail à ouvrir puis à quitter
 * ferait perdre la place qu'on vient de trouver ; ici la ligne s'écarte et
 * l'historique reste sous les doigts.
 *
 * Sur un téléphone, le même tableau se replie en cartes : l'en-tête disparaît et
 * chaque cellule reprend son libellé. Un seul balisage — deux tables jumelles
 * auraient divergé au premier ajout de colonne.
 */
@Component({
  selector: 'app-history-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './history-table.html',
  styleUrl: './history-table.scss',
})
export class HistoryTable {
  readonly orders = input.required<readonly HistoryOrder[]>();

  /** Le signalement — l'écran décide de la surface qui l'accueille. */
  readonly problemRaised = output<HistoryOrder>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly stars = STARS;

  /** La commande dépliée, par sa référence. Une seule à la fois. */
  private readonly opened = signal<string | null>(null);

  /** La note donnée, par commande — la maquette la garde le temps de la visite. */
  private readonly rated = signal<Readonly<Record<string, number>>>({});

  protected readonly rows = computed(() =>
    this.orders().map((order) => ({
      order,
      total: formatEuro(order.total),
      pieces: this.t().orders.pieces.replace('{n}', String(order.pieces)),
      status: this.statusLabel(order.status),
      payment: this.paymentLabel(order.payment),
      paymentNote: this.paymentNote(order.payment),
      open: this.opened() === order.reference,
      rate: this.rated()[order.reference] ?? 0,
    })),
  );

  protected toggle(reference: string): void {
    this.opened.update((current) => (current === reference ? null : reference));
  }

  protected rate(reference: string, value: number): void {
    this.rated.update((all) => ({ ...all, [reference]: value }));
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

  private statusLabel(status: OrderStatus): string {
    const copy = this.t().orders;
    const labels: Record<OrderStatus, string> = {
      ready: copy.statusReady,
      route: copy.statusRoute,
      done: copy.statusDone,
      delivered: copy.statusDelivered,
    };
    return labels[status];
  }

  private paymentLabel(payment: OrderPayment): string {
    const copy = this.t().orders;
    const labels: Record<OrderPayment, string> = {
      account: copy.payAccount,
      card: copy.payCard,
      due: copy.payDue,
    };
    return labels[payment];
  }

  private paymentNote(payment: OrderPayment): string {
    const copy = this.t().orders;
    const notes: Record<OrderPayment, string> = {
      account: copy.payAccountNote,
      card: copy.payCardNote,
      due: copy.payDueNote,
    };
    return notes[payment];
  }
}
