/**
 * **Le prix net d'une ligne de facture (BT-146)** — plan
 * `documentation/pricing/vente-au-poids.md`, § 3 bis, point 5.
 *
 * Le montant de la ligne (BT-131) est Σ des `lineTotalCents` des bons (F6) :
 * ce que le client a payé fait foi. Mais chaque bon a arrondi au centime, et
 * un particulier paie une étiquette TTC au kilo déjà arrondie : sur 50 kg ou
 * sur trente bons, BT-129 × BT-146 s'écarte de BT-131 de plusieurs centimes.
 * Peppol PEPPOL-EN16931-R120 ne tolère que 0,02 €.
 *
 * D'où la règle, qui ne lit pas l'unité : le prix des bons est gardé tant
 * qu'il recompose le montant à 0,02 € près ; au-delà, BT-146 = BT-131 ÷ BT-129,
 * arrondi au millicentime (cinq décimales). L'écart restant est alors d'au
 * plus un demi-millicentime par unité facturée — 0,005 € pour une tonne.
 *
 * Le prix s'entend par UNE unité (1 H87, 1 KGM) : aucun `BasisQuantity`
 * (BT-149) n'est émis.
 */

/** Millicentimes dans un centime (le millicentime vaut 10⁻⁵ €). */
const MILLICENTS_PER_CENT = 1_000n;
/** Millièmes dans une unité de quantité. */
const THOUSANDTHS_PER_UNIT = 1_000n;
/** La tolérance de PEPPOL-EN16931-R120 : 0,02 €, en centimes. */
export const NET_PRICE_TOLERANCE_CENTS = 2;

export interface NetPriceLine {
  readonly unitPriceMillicents: number;
  readonly quantityThousandths: number;
  readonly amountCents: number;
}

/**
 * BT-129 × BT-146 − BT-131, en millicentimes × millièmes (exact, entier) :
 * divisé par 1 000, c'est l'écart en millicentimes.
 */
function scaledGap(line: NetPriceLine, unitPriceMillicents: number): bigint {
  const recomposed = BigInt(unitPriceMillicents) * BigInt(line.quantityThousandths);
  const amount = BigInt(line.amountCents) * MILLICENTS_PER_CENT * THOUSANDTHS_PER_UNIT;
  return recomposed - amount;
}

/**
 * L'écart BT-129 × BT-146 − BT-131 en centimes, arrondi vers zéro — la mesure
 * que la spec rapproche de la tolérance R120.
 */
export function netPriceGapCents(line: NetPriceLine, netPrice: number): number {
  return Number(scaledGap(line, netPrice) / (MILLICENTS_PER_CENT * THOUSANDTHS_PER_UNIT));
}

function withinTolerance(line: NetPriceLine, unitPriceMillicents: number): boolean {
  const gap = scaledGap(line, unitPriceMillicents);
  const bound = BigInt(NET_PRICE_TOLERANCE_CENTS) * MILLICENTS_PER_CENT * THOUSANDTHS_PER_UNIT;
  return (gap < 0n ? -gap : gap) <= bound;
}

/** BT-131 ÷ BT-129, au millicentime le plus proche, la moitié vers le haut. */
function derivedUnitPrice(line: NetPriceLine): number {
  const numerator = BigInt(line.amountCents) * MILLICENTS_PER_CENT * THOUSANDTHS_PER_UNIT;
  const quantity = BigInt(line.quantityThousandths);
  return Number((2n * numerator + quantity) / (2n * quantity));
}

/**
 * Le prix net à émettre : celui des bons s'il recompose le montant à la
 * tolérance R120 près, sinon le montant divisé par la quantité. Une quantité
 * nulle garde le prix des bons — l'agrégat refusera la ligne de toute façon.
 */
export function billedUnitPriceMillicents(line: NetPriceLine): number {
  if (line.quantityThousandths <= 0 || withinTolerance(line, line.unitPriceMillicents)) {
    return line.unitPriceMillicents;
  }
  return derivedUnitPrice(line);
}
