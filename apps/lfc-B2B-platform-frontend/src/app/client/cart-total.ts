import { type ShopProduct, vatOf } from './mock-shop';

/** Une ligne de panier : une référence et sa quantité. */
export interface CartLine {
  readonly product: ShopProduct;
  readonly quantity: number;
}

/** La part de TVA d'un taux donné, telle que le décompte l'affiche. */
export interface VatShare {
  readonly rate: number;
  readonly amount: number;
}

/** Le décompte complet d'un panier. Tous les montants sont en euros. */
export interface CartTotals {
  readonly subtotal: number;
  /** Le montant RETIRÉ par la remise, positif. Zéro quand il n'y en a pas. */
  readonly discount: number;
  /** Les frais de coursier. Zéro en retrait — et alors aucune ligne. */
  readonly fee: number;
  /** Une part par taux RÉELLEMENT présent au panier, du plus bas au plus haut. */
  readonly vat: readonly VatShare[];
  readonly total: number;
}

/**
 * Ce que coûte un panier, remise et TVA comprises.
 *
 * Deux règles du handoff sont ici, et nulle part ailleurs :
 *
 * 1. **La TVA se calcule sur le NET, après remise.** Une remise de 10 % réduit
 *    la base taxable ; l'annoncer sur le brut afficherait une TVA que personne
 *    ne paie.
 * 2. **Une ligne de TVA n'existe que si son taux est au panier.** Pas de quiche,
 *    pas de ligne à 10 % — plutôt qu'une ligne à zéro, qui fait douter.
 *
 * Le prix affiché est TTC : la part de TVA s'en EXTRAIT (`net × t / (100 + t)`),
 * elle ne s'y ajoute pas.
 */
export function priceCart(
  lines: readonly CartLine[],
  discountPercent: number,
  fee: number,
): CartTotals {
  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
  const ratio = 1 - discountPercent / 100;
  const discount = subtotal - subtotal * ratio;

  const byRate = new Map<number, number>();
  for (const line of lines) {
    const rate = vatOf(line.product);
    const net = line.product.price * line.quantity * ratio;
    byRate.set(rate, (byRate.get(rate) ?? 0) + (net * rate) / (100 + rate));
  }

  const vat = [...byRate.entries()]
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => a - b)
    .map(([rate, amount]) => ({ rate, amount }));

  return { subtotal, discount, fee, vat, total: subtotal - discount + fee };
}

/** Un prix en euros → « 5,50 € ». La virgule est décimale, ici. */
export function formatEuro(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

/** Un taux → « 5,5 % ». Le taux entier ne traîne pas de décimale inutile. */
export function formatRate(rate: number): string {
  return `${String(rate).replace('.', ',')} %`;
}
