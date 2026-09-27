import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  FoldCalloutComponent,
  FoldIconComponent,
  FoldListboxComponent,
  type FoldSelectItem,
} from 'fold-ng';

import { formatCents, formatRate } from '../../format-money';
import { CartProductLine } from '../cart-product-line/cart-product-line';
import { CartUpsell } from '../cart-upsell.service';
import { ClientCart } from '../client-cart.service';
import { ClientLocale } from '../../client-locale.service';
import { ClientWorkspace } from '../../client-workspace.service';
import { OrderContextStore } from '../../order-context.store';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { VoucherChoice } from '../voucher-choice.service';
import { SHOP_TIME_ZONE } from '../../shop-time-zone';

/**
 * Le décompte du panier : les lignes, la relance, la remise, la TVA, le total.
 *
 * Un seul composant pour les deux plis — la colonne de droite du bureau et
 * l'écran de panier du téléphone montrent la MÊME chose, et la montrer deux fois
 * serait deux occasions de diverger.
 *
 * Trois règles y sont visibles, et elles viennent du handoff :
 *
 * - la remise porte le complément du lieu (« au Labo »), jamais son nom brut ;
 * - une ligne de TVA n'existe que si son taux est au panier — et il en faut
 *   une PAR TAUX : c'est ce qu'une facture porte, un total ne suffit pas ;
 * - il n'y a PAS de ligne « retrait · offert » — le retrait est toujours
 *   gratuit, la ligne ne dirait rien. Les frais n'apparaissent qu'en coursier.
 */
@Component({
  selector: 'app-cart-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CartProductLine, FoldCalloutComponent, FoldIconComponent, FoldListboxComponent],
  templateUrl: './cart-summary.html',
  styleUrl: './cart-summary.scss',
})
export class CartSummary {
  /** Le décompte seul, sans les lignes : la confirmation n'a plus à les lister. */
  readonly linesShown = input(true);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);
  private readonly upsell = inject(CartUpsell);
  private readonly order = inject(OrderContextStore);
  private readonly locale = inject(ClientLocale);
  private readonly workspace = inject(ClientWorkspace);
  protected readonly voucher = inject(VoucherChoice);

  protected readonly totals = this.cart.totals;

  /**
   * Le refus du devis, montré À LA PLACE des montants : un total chiffré pour
   * une livraison refusée annoncerait ce qu'on ne paiera jamais. Les lignes
   * restent — c'est un échec partiel, le panier est toujours là.
   */
  protected readonly refusal = this.cart.refusal;

  /**
   * Les lignes telles quelles : `CartProductLine` formate les siennes.
   *
   * Ce décompte préformatait chaque ligne en chaînes, et la mention `HT` se
   * posait donc ici, loin de l'endroit qui l'affiche. Un parent qui préformate
   * est un parent qui peut l'oublier, sans que rien ne le lui dise.
   */
  protected readonly lines = this.cart.lines;

  /**
   * Le total de chaque ligne, par SKU, **tel que le serveur l'a arrondi**.
   *
   * Une table plutôt qu'un calcul dans la ligne : c'est un montant, et deux
   * arrondis pour un même nombre finissent par différer d'un centime devant le
   * client. Vide tant que le décompte n'est pas revenu — la ligne montre alors
   * un tiret, pas un nombre inventé.
   */
  protected readonly lineTotals = computed(
    () =>
      new Map(
        this.totals().lines.map((line) => [
          line.sku,
          { ht: line.lineTotalCents, ttc: line.lineTotalTtcCents },
        ]),
      ),
  );

  /**
   * Les DEUX assiettes, passées telles quelles : c'est la ligne qui choisit.
   *
   * Un décompte qui trancherait ici pourrait passer un hors taxe à une ligne qui
   * écrit « TTC », et rien ne le lui dirait — exactement ce que le préformatage
   * des chaînes coûtait avant lui.
   */
  protected totalOf(sku: string): { readonly ht: number; readonly ttc: number } | null {
    return this.lineTotals().get(sku) ?? null;
  }

  /**
   * La remise, telle qu'elle se lit : « Remise retrait au Labo −10 % ».
   *
   * 🔴 **Le taux vient du SERVEUR**, plus du choix de service. Le front portait
   * un pourcentage tiré d'une maquette : il ne savait pas dire une remise en
   * MONTANT, et l'aurait affichée « −0 % » pendant que la commande la déduisait.
   * L'ajustement arrive désormais avec le décompte ; le lieu reste au choix,
   * puisque c'est de la présentation.
   */
  protected readonly discountLabel = computed(() => {
    const choice = this.order.choice();
    const adjustment = this.totals().discountAdjustment;
    if (choice === null || adjustment === null || this.totals().discountCents === 0) {
      return null;
    }
    // Les deux formes se lisent différemment — « −10 % » et « −2,00 € » — et
    // c'est pour ça que le libellé porte la VALEUR mise en forme plutôt qu'un
    // nombre suivi d'un pourcent en dur dans la copie.
    const value =
      adjustment.mode === 'percent'
        ? formatRate(adjustment.bp / 100)
        : formatCents(adjustment.cents);
    return fill(this.t().cart.discount, { at: choice.at, value });
  });

  protected readonly feeLabel = computed(() => {
    const fee = this.totals().deliveryFeeCents;
    return fee === 0 ? null : this.t().cart.fee;
  });

  protected readonly vatLines = computed(() => {
    const c = this.t().cart;
    return this.totals().vat.map((share) => ({
      label: fill(c.vat, { rate: formatRate(share.rate) }),
      amount: formatCents(share.amountCents),
    }));
  });

  /**
   * « Vous gagnerez N points », seulement si le serveur en annonce plus de
   * zéro : programme fermé, espace société ou visiteur, la ligne n'existe pas
   * — rien ne dit « bientôt » (plan des points, E1.3).
   */
  protected readonly pointsLabel = computed(() => {
    const points = this.cart.loyaltyPointsToEarn();
    // Double verrou : le serveur rend `null` en société, et l'écran ne parle
    // de fidélité qu'en espace personnel, quoi qu'un devis plus ancien porte.
    if (points === null || points <= 0 || !this.workspace.isPersonal()) {
      return null;
    }
    return fill(this.t().cart.pointsToEarn, {
      n: new Intl.NumberFormat(this.locale.current()).format(points),
    });
  });

  /**
   * Les bons proposables, un par option : « 5,00 € HT — jusqu'au 27 sept.
   * 2027 ». Vide hors espace personnel, programme fermé, ou sans bon
   * disponible — et alors le choix n'existe pas (plan des points, E2.2).
   */
  protected readonly voucherOptions = computed<readonly FoldSelectItem<string>[]>(() => {
    const c = this.t().cart;
    const dates = new Intl.DateTimeFormat(this.locale.current(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: SHOP_TIME_ZONE,
    });
    return this.voucher.available().map((voucher) => ({
      value: voucher.id,
      label: fill(c.voucherOption, {
        value: formatCents(voucher.valueCents),
        date: dates.format(new Date(voucher.expiresAt)),
      }),
    }));
  });

  /**
   * La ligne du bon : la part **HT** imputée, dans la partie hors taxe avec la
   * remise — c'est ce qui fait retomber les lignes sur le total. La baisse de
   * TTC rendue par le serveur passe en mention (plan des points, E2.2 corrigé
   * le 2026-09-27 : la ligne en TTC faisait compter deux fois l'écart de TVA).
   * Rien tant que le devis avec bon n'est pas revenu, rien en société.
   */
  protected readonly voucherLine = computed(() => {
    const imputed = this.totals().voucherDiscountCents;
    if (this.voucher.effective() === null || !this.workspace.isPersonal() || imputed <= 0) {
      return null;
    }
    const effect = this.cart.voucherTotalEffectCents();
    const c = this.t().cart;
    return {
      amount: fill(c.voucherHt, { value: formatCents(imputed) }),
      effect: effect > 0 ? fill(c.voucherEffect, { value: formatCents(effect) }) : null,
    };
  });

  /**
   * Le reliquat d'un bon plus gros que le panier : sa valeur moins la part
   * imputée. Le serveur le rend en bon une fois la commande réglée.
   */
  protected readonly voucherRemainder = computed(() => {
    const chosen = this.voucher.effective();
    const imputed = this.totals().voucherDiscountCents;
    if (chosen === null || this.voucherLine() === null || imputed <= 0) {
      return null;
    }
    const rest = chosen.valueCents - imputed;
    return rest > 0 ? fill(this.t().cart.voucherRemainder, { value: formatCents(rest) }) : null;
  });

  protected readonly upsellLabel = computed(() => {
    const piece = this.upsell.suggestion();
    return piece === null ? null : fill(this.t().shop.upsell, { name: piece.name });
  });

  /** Les totaux arrivent en centimes ; le gabarit ne connaît que des libellés. */
  protected money(cents: number): string {
    return formatCents(cents);
  }

  protected addUpsell(): void {
    const piece = this.upsell.suggestion();
    if (piece !== null) {
      this.cart.add(piece.sku);
    }
  }
}
