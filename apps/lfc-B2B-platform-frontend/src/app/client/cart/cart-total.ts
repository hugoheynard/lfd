import type { ShopItemView } from '@lfd/contracts';
import {
  fromCents,
  fromMillicents,
  lineTotalCents,
  roundToCents,
  roundToMillicents,
  scaleByBasisPoints,
} from '@lfd/money';

/** Une ligne de panier : une référence du catalogue et sa quantité. */
export interface CartLine {
  readonly product: ShopItemView;
  readonly quantity: number;
}

/** La part de TVA d'un taux donné, telle que le décompte l'affiche. */
export interface VatShare {
  readonly rate: number;
  /** En **centimes**, comme tout ce que ce décompte rend. */
  readonly amountCents: number;
}

/**
 * Le décompte complet d'un panier. **Tous les montants sont en centimes**,
 * entiers.
 *
 * Ils étaient en euros flottants, et c'est ce que ce chantier retire : le
 * serveur facture en centimes, et deux unités pour le même nombre finissent
 * toujours par donner deux nombres. Le formatage en euros se fait à
 * l'affichage, une fois, et jamais dans le calcul.
 */
export interface CartTotals {
  /** Le sous-total **TTC**, avant remise. */
  readonly subtotalCents: number;
  /** Le montant RETIRÉ par la remise, positif. Zéro quand il n'y en a pas. */
  readonly discountCents: number;
  /** Les frais de coursier. Zéro en retrait — et alors aucune ligne. */
  readonly feeCents: number;
  /** Une part par taux RÉELLEMENT présent au panier, du plus bas au plus haut. */
  readonly vat: readonly VatShare[];
  readonly totalCents: number;
}

/**
 * Le prix unitaire **TTC en millicentimes** d'un article.
 *
 * Le catalogue sert du HORS TAXE — c'est l'unité de tout le modèle et c'est ce
 * que la caisse facture. La vitrine, elle, affiche du TTC : un client
 * professionnel raisonne en prix payé. La conversion se fait ici, une fois, en
 * arithmétique exacte, et jamais dans un gabarit.
 */
export function ttcMillicentsOf(item: ShopItemView): number {
  return roundToMillicents(
    scaleByBasisPoints(
      fromMillicents(item.unitPriceMillicents),
      Math.round(item.vatRatePercent * 100),
      1,
    ),
  );
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
 * 🔴 **L'arrondi a lieu UNE fois, au total de ligne**, et pas au prix unitaire :
 * c'est ce que le millicentime existe pour permettre. Arrondir chaque unité
 * jetterait une fraction de centime par article — invisible à l'unité, visible
 * dès la troisième.
 *
 * ⚠️ Ce décompte est un AFFICHAGE. La caisse re-résout tout à la passation, avec
 * la mercuriale du client et ses paliers : ces nombres disent ce qu'un visiteur
 * sans tarif négocié paierait, pas ce qui sera facturé à un client qui en a un.
 */
export function priceCart(
  lines: readonly CartLine[],
  discountPercent: number,
  feeCents: number,
): CartTotals {
  const subtotalCents = lines.reduce(
    (sum, line) => sum + lineTotalCents(ttcMillicentsOf(line.product), line.quantity),
    0,
  );
  // `scaleByBasisPoints` ALTÈRE de `bp` — « −10 % », pas « 10 % de ». Lui passer
  // ce qu'on garde le ferait ajouter 100 %.
  const discountBp = Math.round(discountPercent * 100);
  const netCents = roundToCents(scaleByBasisPoints(fromCents(subtotalCents), discountBp, -1));
  const discountCents = subtotalCents - netCents;

  // La part de TVA s'EXTRAIT du TTC (`net × t / (100 + t)`), elle ne s'y ajoute
  // pas : le sous-total est déjà toutes taxes comprises.
  const byRate = new Map<number, number>();
  for (const line of lines) {
    const grossCents = lineTotalCents(ttcMillicentsOf(line.product), line.quantity);
    const lineNetCents = roundToCents(scaleByBasisPoints(fromCents(grossCents), discountBp, -1));
    const rate = line.product.vatRatePercent;
    const share = Math.round((lineNetCents * rate) / (100 + rate));
    byRate.set(rate, (byRate.get(rate) ?? 0) + share);
  }

  const vat = [...byRate.entries()]
    .filter(([, amountCents]) => amountCents > 0)
    .sort(([left], [right]) => left - right)
    .map(([rate, amountCents]) => ({ rate, amountCents }));

  return {
    subtotalCents,
    discountCents,
    feeCents,
    vat,
    totalCents: netCents + feeCents,
  };
}
