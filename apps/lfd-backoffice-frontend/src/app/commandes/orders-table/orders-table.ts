import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';
import { ORDER_ORIGIN_LABELS, type AdminOrderRow } from '@lfd/contracts';
import {
  formatCents,
  formatOrderDate,
  orderStatusLabel,
  orderStatusVariant,
  paymentStatusLabel,
  paymentStatusVariant,
} from '@lfd/b2b-ui/order';

import { clienteleLabel, methodLabel } from '../order-list-filters';

/**
 * **Le tableau des commandes staff**, partagé par la liste de toutes les
 * commandes (`/commandes`) et l'onglet Commandes d'un compte.
 *
 * Partagé parce que Hugo a demandé « le même esprit » (2026-10-12) : mêmes
 * colonnes, mêmes formats, mêmes badges — un commercial qui passe d'un écran à
 * l'autre ne doit pas réapprendre où lire un règlement. Ce qui diffère entre
 * les deux tient en deux entrées :
 *
 * - `wide` ajoute **qui** a commandé (et sa clientèle) et **pour quand** : dans
 *   un compte, le client est connu et la colonne serait la même partout ;
 * - `siteOf` ajoute la colonne « Site » d'un principal qui a des sous-comptes.
 *
 * Il ne charge rien et ne navigue nulle part : la page sait d'où viennent les
 * lignes et où mène un clic.
 */
@Component({
  selector: 'app-orders-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldDataTableCellDirective, FoldDataTableComponent],
  templateUrl: './orders-table.html',
  styleUrl: './orders-table.scss',
})
export class OrdersTable {
  readonly rows = input.required<readonly AdminOrderRow[]>();
  readonly caption = input.required<string>();
  readonly empty = input.required<FoldTableEmpty>();
  /** Le client et le jour de retrait ou de livraison, pour la liste de toutes les commandes. */
  readonly wide = input(false);
  /** Présent : une colonne « Site », et le libellé qu'elle porte pour chaque ligne. */
  readonly siteOf = input<((row: AdminOrderRow) => string) | null>(null);
  /** Le chargement en place, quand la page garde le tableau à l'écran pendant qu'elle relit. */
  readonly loading = input(false);

  readonly opened = output<AdminOrderRow>();

  /**
   * Dans l'ordre où on les lit : ce qui identifie, qui, quand, où ça en est,
   * combien. Le montant à droite, seule colonne qu'on compare de haut en bas.
   */
  protected readonly columns = computed<readonly FoldTableColumn[]>(() => [
    // Les dates d'abord, puis qui, puis la référence (Hugo, 2026-10-12) :
    // on parcourt la table par le temps, la référence ne sert qu'à citer.
    { key: 'placedAt', label: 'Passée le', width: '9rem' },
    ...(this.wide() ? [{ key: 'fulfillment', label: 'Pour le', width: '11rem' }] : []),
    ...(this.wide() ? [{ key: 'customer', label: 'Client' }] : []),
    ...(this.siteOf() !== null ? [{ key: 'site', label: 'Site' }] : []),
    { key: 'orderNumber', label: 'Commande' },
    { key: 'status', label: 'Avancement', width: '10rem' },
    { key: 'paymentStatus', label: 'Règlement', width: '10rem' },
    { key: 'totalCents', label: 'Total TTC', width: '8rem', align: 'right' },
  ]);

  protected readonly rowKey = (row: AdminOrderRow): string => row.id;

  protected date(row: AdminOrderRow): string {
    return formatOrderDate(row.placedAt);
  }

  protected site(row: AdminOrderRow): string {
    return this.siteOf()?.(row) ?? '';
  }

  protected clientele(row: AdminOrderRow): string | null {
    return clienteleLabel(row.clientele);
  }

  /** « Retrait », puis le jour — une commande d'avant l'obligation n'en a pas. */
  protected method(row: AdminOrderRow): string {
    return methodLabel(row.fulfillmentMethod);
  }

  protected day(row: AdminOrderRow): string | null {
    return row.fulfillmentDay === null ? null : formatOrderDate(row.fulfillmentDay);
  }

  protected total(row: AdminOrderRow): string {
    return formatCents(row.totalCents);
  }

  protected status(row: AdminOrderRow): string {
    return orderStatusLabel(row.status);
  }

  protected statusTone(row: AdminOrderRow): ReturnType<typeof orderStatusVariant> {
    return orderStatusVariant(row.status);
  }

  protected payment(row: AdminOrderRow): string {
    return paymentStatusLabel(row.paymentStatus);
  }

  protected paymentTone(row: AdminOrderRow): ReturnType<typeof paymentStatusVariant> {
    return paymentStatusVariant(row.paymentStatus);
  }

  /** La provenance, sauf quand c'est le cas normal — cf. `OrderRow`. */
  protected origin(row: AdminOrderRow): string | null {
    return row.origin === 'self_service' ? null : ORDER_ORIGIN_LABELS[row.origin];
  }
}
