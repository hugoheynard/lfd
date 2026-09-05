import { DELIVERY_VAT_RATE, ventilateVat } from '@lfd/money';

/**
 * TVA côté **client** — aperçu pur, en **centimes** (comme le serveur, qui reste
 * l'autorité au checkout).
 *
 * 🔴 **Le calcul a été rendu à `@lfd/money` le 2026-09-05.** Ce fichier en
 * portait une copie, et son propre en-tête l'assumait — « on duplique cette
 * petite logique côté front ». Trois copies vivaient alors dans le dépôt, et
 * celle du panier de la boutique ne taxait pas le coursier : elle annonçait au
 * client quatre euros de moins que ce que la caisse facturait sur des frais de
 * vingt. C'est ce que coûte un synonyme d'arithmétique d'argent.
 *
 * Il ne reste ici que les deux signatures que le front hérité appelle.
 */

export { DELIVERY_VAT_RATE };

/** Une ligne pour le calcul : total **HT** (centimes) et taux (%). */
export interface VatLineCents {
  readonly htCents: number;
  readonly vatRate: number;
}

/** La TVA d'un taux sur un ensemble de lignes (centimes). */
export interface VatByRateCents {
  readonly rate: number;
  readonly vatCents: number;
}

/**
 * TVA **des marchandises** par taux (centimes), remise déduite au prorata du
 * poids HT de chaque groupe. Trié par taux croissant ; les groupes à TVA nulle
 * sont retirés.
 */
export function goodsVatByRateCents(
  lines: readonly VatLineCents[],
  discountCents = 0,
): readonly VatByRateCents[] {
  return ventilateVat({ lines, discountCents, extras: [] }).vat.map((share) => ({
    rate: share.rate,
    vatCents: share.amountCents,
  }));
}

/** Entrées du calcul de TVA d'une commande (aperçu checkout). */
export interface VatInputCents {
  readonly lines: readonly VatLineCents[];
  readonly discountCents: number;
  readonly deliveryFeeCents: number;
  readonly deliveryVatRate?: number;
}

/** TVA totale (centimes) : marchandises (remise déduite) + livraison. */
export function computeVatCents(input: VatInputCents): number {
  return ventilateVat({
    lines: input.lines,
    discountCents: input.discountCents,
    extras:
      input.deliveryFeeCents === 0
        ? []
        : [
            {
              htCents: input.deliveryFeeCents,
              vatRate: input.deliveryVatRate ?? DELIVERY_VAT_RATE,
            },
          ],
  }).vatTotalCents;
}
