/**
 * TVA côté **client** — aperçu pur, en **centimes** (comme le serveur, qui reste
 * l'autorité au checkout). Miroir de `orders/domain/services/vat.ts` du backend :
 * les prix sont HT, la TVA se calcule par **taux** (5,5 % alimentaire, 20 %
 * livraison), remise déduite au prorata de chaque groupe. On duplique cette
 * petite logique côté front car `@lfd/contracts` reste **type-only** ici (sinon
 * zod entre dans le bundle) — elle ne fait que refléter l'affichage.
 */

/** Taux de la prestation de livraison (transport) — taux normal. */
export const DELIVERY_VAT_RATE = 20;

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
 * poids HT de chaque groupe. Arrondi par groupe. Trié par taux croissant ;
 * les groupes à TVA nulle sont retirés.
 */
export function goodsVatByRateCents(
  lines: readonly VatLineCents[],
  discountCents = 0,
): readonly VatByRateCents[] {
  const subtotal = lines.reduce((sum, line) => sum + line.htCents, 0);
  const baseByRate = new Map<number, number>();
  for (const line of lines) {
    baseByRate.set(line.vatRate, (baseByRate.get(line.vatRate) ?? 0) + line.htCents);
  }
  return [...baseByRate]
    .map(([rate, base]) => {
      const discountShare = subtotal > 0 ? (discountCents * base) / subtotal : 0;
      return { rate, vatCents: Math.round(((base - discountShare) * rate) / 100) };
    })
    .filter((line) => line.vatCents > 0)
    .sort((a, b) => a.rate - b.rate);
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
  const goods = goodsVatByRateCents(input.lines, input.discountCents).reduce(
    (sum, line) => sum + line.vatCents,
    0,
  );
  const deliveryRate = input.deliveryVatRate ?? DELIVERY_VAT_RATE;
  return goods + Math.round((input.deliveryFeeCents * deliveryRate) / 100);
}
