import type { ShopItemView } from "@lfd/contracts";

import type { CatalogPricePerKg } from "../domain/ports/catalog-price-per-kg.reader.js";
import type { ShopAudience } from "../domain/ports/catalog.reader.js";

/** Le kilo de l'audience servie, et — sous une promotion seulement — le kilo barré. */
export type ServedPricePerKg = Pick<
  ShopItemView,
  | "proPricePerKgMillicents"
  | "publicPricePerKgTtcCents"
  | "catalogPricePerKgMillicents"
  | "catalogPricePerKgTtcCents"
>;

/** Ce qu'un article sans kilo à montrer porte : rien, aux deux audiences. */
const NOTHING: ServedPricePerKg = { proPricePerKgMillicents: null, publicPricePerKgTtcCents: null };

/**
 * **Le prix au kilo tel que le rayon le sert** (plan
 * `documentation/pricing/saisie/plan-prix-au-kilo-suit-le-prix.md`, § 7 —
 * décisions de Hugo du 2026-11-04).
 *
 * - Une **promotion** a baissé la pièce (tarif barré ET `promotionNames`
 *   posé) : le kilo saisi devient le kilo **barré**, et le kilo servi suit la
 *   pièce dans la même proportion — kilo saisi × prix servi ÷ tarif, arrondi
 *   une fois, la moitié loin de zéro. Public : TTC ÷ TTC, en centimes — la
 *   proportion des deux prix que le particulier LIT ; pro : HT ÷ HT, en
 *   millicentimes.
 * - **Tout autre cas** — aucune promotion, mercuriale, palier, engagement,
 *   prix plus haut, barré sans nom — : le kilo saisi, rien de barré (Hugo :
 *   « ne cherche pas à inventer de la donnée »).
 * - **Vendu au poids** : rien. Son prix servi EST déjà au kilo ; l'exclure ici
 *   plutôt qu'à l'écran évite de servir un kilo qu'aucun écran ne doit lire.
 *
 * Appelée sur l'article déjà tarifé et nommé : `struck` a posé le prix servi
 * et le tarif, `withPromotionNames` la présence d'une promotion — les trois
 * faits sont en main, aucune règle n'est refaite.
 */
export function servedPricePerKg(
  item: ShopItemView,
  entered: CatalogPricePerKg,
  audience: ShopAudience,
): ServedPricePerKg {
  if (item.saleUnit === "weight") {
    return NOTHING;
  }
  const promoted = item.promotionNames !== undefined && item.promotionNames.length > 0;
  return audience === "pro"
    ? proPerKg(item, entered, promoted)
    : publicPerKg(item, entered, promoted);
}

function proPerKg(
  item: ShopItemView,
  { proPricePerKgMillicents }: CatalogPricePerKg,
  promoted: boolean,
): ServedPricePerKg {
  const tariff = item.catalogPriceMillicents;
  if (!promoted || proPricePerKgMillicents === null || tariff === undefined) {
    return { proPricePerKgMillicents, publicPricePerKgTtcCents: null };
  }
  return {
    proPricePerKgMillicents: proportional(
      proPricePerKgMillicents,
      item.unitPriceMillicents,
      tariff,
    ),
    publicPricePerKgTtcCents: null,
    catalogPricePerKgMillicents: proPricePerKgMillicents,
  };
}

function publicPerKg(
  item: ShopItemView,
  { publicPricePerKgTtcCents }: CatalogPricePerKg,
  promoted: boolean,
): ServedPricePerKg {
  const tariff = item.catalogPriceTtcCents;
  if (!promoted || publicPricePerKgTtcCents === null || tariff === undefined) {
    return { proPricePerKgMillicents: null, publicPricePerKgTtcCents };
  }
  return {
    proPricePerKgMillicents: null,
    publicPricePerKgTtcCents: proportional(
      publicPricePerKgTtcCents,
      item.unitPriceTtcCents,
      tariff,
    ),
    catalogPricePerKgTtcCents: publicPricePerKgTtcCents,
  };
}

/**
 * `entered × served ÷ tariff`, en rationnel exact, arrondi une fois, la
 * moitié loin de zéro. Les trois sont positifs (un tarif barré est
 * strictement au-dessus d'un prix servi positif) : la moitié monte donc.
 */
export function proportional(entered: number, served: number, tariff: number): number {
  const twice = 2n * BigInt(entered) * BigInt(served) + BigInt(tariff);
  return Number(twice / (2n * BigInt(tariff)));
}
