import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldButtonComponent } from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
import { formatCents } from '../../format-money';
import { isFulfilled, type HistoryOrder, type OrderPayment } from '../order-rows';

/** Une note de 1 à 5. Zéro veut dire « pas encore notée », pas « zéro étoile ». */
const STARS = [1, 2, 3, 4, 5] as const;

/**
 * Le TIROIR d'une commande — ce que le dépli montre sous sa ligne.
 *
 * Il est sorti de la table au moment où son gabarit a dépassé la soixantaine de
 * lignes : celui d'une cellule tient sur une ligne, celui-ci racontait trois
 * choses différentes — les faits, les gestes, la note. Une table dont le
 * gabarit est aux trois quarts un tiroir n'est plus lisible comme une table.
 *
 * Il ne décide de RIEN. La note lui arrive et repart : elle vit dans la table,
 * qui survit à la fermeture du tiroir — un composant détruit à chaque repli
 * emporterait l'étoile qu'on vient de donner. Le signalement remonte aussi,
 * parce que deux surfaces peuvent l'accueillir et que ce n'est pas au tiroir de
 * choisir laquelle.
 */
@Component({
  selector: 'app-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, RouterLink],
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.scss',
})
export class OrderDetail {
  readonly order = input.required<HistoryOrder>();

  /** La note donnée, de 0 (aucune) à 5. */
  readonly rate = input(0);

  readonly rated = output<number>();
  readonly problemRaised = output<void>();

  /**
   * Le bon de commande est DEMANDÉ, pas fabriqué ici.
   *
   * 🔴 Ce bouton n'avait aucun `(click)` : il portait l'icône du
   * téléchargement et ne téléchargeait rien. Le document vient du serveur,
   * qui l'archive — un tiroir n'a ni le jeton ni le droit d'aller le
   * chercher, et ce n'est pas à lui de choisir quelle surface l'accueille.
   */
  readonly purchaseOrderRequested = output<void>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly stars = STARS;

  /** « Signaler un problème » n'existe que sur une commande retirée ou livrée. */
  protected readonly reportable = computed(() => isFulfilled(this.order()));

  protected readonly paymentLabel = computed(() => {
    const copy = this.t().orders;
    const labels: Record<OrderPayment, string> = {
      account: copy.payAccount,
      card: copy.payCard,
      due: copy.payDue,
      refused: copy.payRefused,
    };
    return labels[this.order().payment];
  });

  /**
   * Une commande carte non réglée se règle sur SA page de règlement — jamais
   * en repassant le panier, qui ferait une seconde commande (plan
   * `documentation/order/commande-carte-reglee.md`, §4.3).
   */
  protected readonly settleable = computed(() => {
    const payment = this.order().payment;
    return payment === 'due' || payment === 'refused';
  });

  /** La part HT du bon de fidélité, mise en forme ; `null` sans bon. */
  protected readonly voucherAmount = computed(() => {
    const cents = this.order().voucherDiscountCents;
    return cents > 0 ? formatCents(cents) : null;
  });

  /**
   * « Remboursée » ou « Remboursée en partie (12,50 €) » — `null` sans
   * remboursement : la ligne n'existe que si elle a quelque chose à dire.
   */
  protected readonly refundLabel = computed(() => {
    const copy = this.t().orders;
    const refund = this.order().refund;
    if (refund.kind === 'none') {
      return null;
    }
    return refund.kind === 'full'
      ? copy.refundedFull
      : copy.refundedPartial.replace('{amount}', formatCents(refund.refundedCents));
  });

  protected readonly paymentNote = computed(() => {
    const copy = this.t().orders;
    const notes: Record<OrderPayment, string> = {
      account: copy.payAccountNote,
      card: copy.payCardNote,
      due: copy.payDueNote,
      refused: copy.payRefusedNote,
    };
    return notes[this.order().payment];
  });

  /**
   * Le libellé de la note — il RÉPOND au geste, et différemment.
   *
   * Au-dessus de 4 on remercie ; en dessous on annonce qu'on regarde. Jamais une
   * pop-up : la note se donne là où la commande vit.
   */
  protected readonly rateLabel = computed(() => {
    const copy = this.t().orders;
    const value = this.rate();
    if (value === 0) {
      return copy.rateIdle;
    }
    return value >= 4 ? copy.rateHigh : copy.rateLow;
  });

  protected starLabel(value: number): string {
    return this.t().orders.rateStar.replace('{n}', String(value));
  }
}
