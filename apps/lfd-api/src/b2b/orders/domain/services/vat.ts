import { DELIVERY_VAT_RATE, ventilateVat, type VatLine, type VatShare } from "@lfd/money";

import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Moteur de **TVA** de la commande — pur et déterministe.
 *
 * Les prix du catalogue sont **HT**. La TVA se calcule par **taux** : on regroupe
 * les lignes par taux (5,5 % alimentaire, 20 % non-alimentaire, …), on déduit la
 * remise (retrait) au prorata de chaque groupe, puis on applique le taux au net.
 * Les **frais de livraison** (service coursier) portent leur propre taux — 20 %
 * par défaut (prestation de transport).
 *
 * 🔴 **Le calcul lui-même vit dans `@lfd/money`** depuis le 2026-09-05. Il était
 * écrit ici, et deux copies en vivaient côté front ; celle du panier ne taxait
 * pas le coursier et annonçait donc au client un total inférieur à ce que cette
 * fonction facture. Ce module garde ce qui lui appartient vraiment — les règles
 * de la COMMANDE : ce que la remise touche, ce qu'elle ne touche pas, et le
 * refus de facturer une surtaxe sans taux.
 *
 * ⚠️ Un extra rejoint désormais le **groupe de son taux** au lieu d'être arrondi
 * à part. Sur une commande qui porte à la fois de la marchandise à 20 % et des
 * frais de livraison, le total de TVA peut donc bouger d'un centime — dans le
 * sens juste : une facture porte une ligne par taux, calculée sur l'assiette
 * totale de ce taux.
 */

export { DELIVERY_VAT_RATE };
export type { VatLine };

/**
 * Une surtaxe sans taux ne se facture pas.
 *
 * Une **erreur technique** et non métier : ce n'est pas une demande refusée mais
 * un réglage incomplet qui a franchi les gardes d'écriture. Elle ne devrait
 * jamais sortir — le réglage exige son taux — et si elle sort, c'est un bug à
 * corriger, pas une phrase à montrer au client.
 */
export class MissingLateFeeVatRateError extends TechnicalError {
  constructor() {
    super("orders.late_fee.vat_rate_missing", "Surtaxe sans taux de TVA.");
  }
}

/** Entrées du calcul de TVA d'une commande. */
export interface VatInput {
  readonly lines: readonly VatLine[];
  /** Remise (retrait) déduite des marchandises, HT, en centimes. */
  readonly discountCents: number;
  /** Frais de livraison (zone), HT, en centimes. */
  readonly deliveryFeeCents: number;
  /** Taux de la livraison en %, défaut {@link DELIVERY_VAT_RATE}. */
  readonly deliveryVatRate?: number;
  /** Surtaxe de commande tardive, HT, en centimes. `0` = aucune. */
  readonly lateFeeCents: number;
  /**
   * Taux de la surtaxe en %, **sans valeur par défaut**.
   *
   * Contrairement au transport — dont le taux est une constante parce qu'une
   * prestation de transport est au taux normal, point — celui de la surtaxe est
   * un **réglage** : personne ne sait encore s'il suit les marchandises ou la
   * prestation, et inventer une réponse la facturerait rétroactivement sur
   * toutes les commandes tardives.
   *
   * Il ne peut donc pas manquer quand `lateFeeCents` n'est pas nul, et
   * {@link computeOrderTotals} le refuse plutôt que de retomber sur un défaut.
   */
  readonly lateFeeVatRate: number | null;
}

/** Les deux montants d'une commande qui se déduisent de sa ventilation. */
export interface OrderTotals {
  /**
   * TVA totale, en centimes. Somme de la TVA des marchandises (par taux, remise
   * déduite au prorata), de la livraison et de la surtaxe.
   */
  readonly vatCents: number;
  /**
   * La TVA **par taux**, du plus bas au plus haut — « dont TVA 5,5 % ».
   *
   * 🔴 Elle était CALCULÉE ici puis jetée : `computeOrderTotals` ne rendait que
   * le total, et la ventilation qui l'avait produite mourait dans la fonction.
   * Un bon de commande qui veut le détail devait donc le refaire à la lecture —
   * et un document archivé refabriqué après un changement de règle d'arrondi
   * afficherait une ventilation différente de celle qui a été facturée.
   *
   * Elle sort désormais, se fige sur la commande, et se relit. Rien à
   * recalculer : une commande passée a tout enregistré.
   */
  readonly vatShares: readonly VatShare[];
  /**
   * Le **TTC** à encaisser : le net de marchandises, plus les termes que la
   * remise ne touche pas, plus la TVA de l'ensemble.
   */
  readonly totalCents: number;
}

/**
 * Les montants de la commande, **pris à la ventilation** plutôt que recomposés.
 *
 * 🔴 Cette fonction ne rendait que la TVA, et `Order.draft` refaisait le total
 * juste à côté : `max(0, sous-total − remise) + frais + surtaxe + TVA`. Les deux
 * tombaient juste — même bornage de la remise, mêmes termes —, et c'est
 * exactement ce qui rendait la chose dangereuse : **la définition du TTC vivait
 * à deux endroits**, dont un seul apparaît quand on ajoute un terme au panier.
 *
 * Ajouté aux seuls `extras`, un terme neuf entrerait dans la TVA sans entrer
 * dans le total — une commande dont l'assiette taxée dépasse ce qu'elle
 * encaisse. Ajouté au seul total, il serait facturé sans taxe. Aucun test
 * n'aurait rougi : aucun ne comparait les deux définitions entre elles.
 *
 * Le devis de la boutique prenait déjà `ventilateVat().totalCents`. Les deux
 * surfaces tombaient donc d'accord sans employer la même méthode, ce qui n'est
 * pas la même chose que s'accorder.
 */
export function computeOrderTotals(input: VatInput): OrderTotals {
  const ventilated = ventilateVat({
    lines: input.lines,
    discountCents: input.discountCents,
    extras: extrasOf(input),
  });
  return {
    vatCents: ventilated.vatTotalCents,
    vatShares: ventilated.vat,
    totalCents: ventilated.totalCents,
  };
}

/**
 * Les termes que la remise ne touche pas.
 *
 * Un montant nul n'entre pas : une ligne à zéro ne change aucun total, mais
 * elle obligerait la surtaxe à porter un taux qu'aucune commande n'a réglé.
 */
function extrasOf(input: VatInput): readonly VatLine[] {
  const extras: VatLine[] = [];
  if (input.deliveryFeeCents !== 0) {
    extras.push({
      htCents: input.deliveryFeeCents,
      vatRate: input.deliveryVatRate ?? DELIVERY_VAT_RATE,
    });
  }
  // La surtaxe porte SON taux, réglé, jamais un défaut. Un montant taxé au
  // hasard se rattrape à la main, commande par commande — et seulement si
  // quelqu'un s'en aperçoit.
  if (input.lateFeeCents !== 0) {
    if (input.lateFeeVatRate === null) {
      throw new MissingLateFeeVatRateError();
    }
    extras.push({ htCents: input.lateFeeCents, vatRate: input.lateFeeVatRate });
  }
  return extras;
}
