import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { FoldBadgeComponent } from 'fold-ng';
import { ORDER_ORIGIN_LABELS, type AdminOrderRow } from '@lfd/contracts';

import {
  formatCents,
  formatOrderDate,
  orderStatusLabel,
  orderStatusVariant,
  paymentStatusLabel,
  paymentStatusVariant,
} from '../order-format';

/**
 * `lfd-order-row` — **une commande sur une ligne**, telle que le back-office la
 * parcourt.
 *
 * Partagée entre les deux listes staff : l'onglet Commandes d'une fiche client,
 * et la colonne de gauche de l'écran de saisie. Les deux rendent le même
 * `AdminOrderRow` ; elles l'avaient rendu de deux façons, avec deux fois la même
 * pastille de provenance et deux fois le même format de date.
 *
 * **Deux densités, un seul gabarit.** `dense` retire les badges d'état : dans
 * une colonne étroite on cherche un **modèle à reprendre**, pas un dossier à
 * instruire — l'état se lit sur la commande. Deux composants pour cela auraient
 * refait diverger la date et la provenance.
 *
 * Elle ne navigue pas elle-même : elle **émet** `open`. Selon l'écran, cliquer
 * ouvre une page ou charge une source dans la colonne d'à côté ; une rangée qui
 * déciderait à leur place ne servirait qu'à l'un des deux.
 */
@Component({
  selector: 'lfd-order-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent],
  templateUrl: './order-row.html',
  styleUrl: './order-row.scss',
})
export class OrderRow {
  readonly order = input.required<AdminOrderRow>();
  /**
   * Compacte : sans les badges d'état. Pour une colonne étroite.
   *
   * `booleanAttribute` pour que `<lfd-order-row dense />` suffise — la forme
   * qu'on écrit naturellement, et qui sans transformation passerait la chaîne
   * vide.
   */
  readonly dense = input(false, { transform: booleanAttribute });
  /** Mise en évidence — la ligne dont le contenu est affiché à côté. */
  readonly selected = input(false, { transform: booleanAttribute });

  readonly open = output<AdminOrderRow>();

  protected readonly placedAt = computed(() => formatOrderDate(this.order().placedAt));
  protected readonly total = computed(() => formatCents(this.order().totalCents));
  protected readonly status = computed(() => orderStatusLabel(this.order().status));
  protected readonly statusTone = computed(() => orderStatusVariant(this.order().status));
  protected readonly payment = computed(() => paymentStatusLabel(this.order().paymentStatus));
  protected readonly paymentTone = computed(() => paymentStatusVariant(this.order().paymentStatus));

  /**
   * La provenance, ou `null` quand il n'y a rien à signaler. `self_service` est
   * le cas normal : l'étiqueter sur chaque ligne mettrait un mot partout pour ne
   * rien distinguer.
   */
  protected readonly origin = computed(() => {
    const { origin } = this.order();
    return origin === 'self_service' ? null : ORDER_ORIGIN_LABELS[origin];
  });
}
