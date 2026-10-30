import type { ShopItemView } from "@lfd/contracts";

import type { ShopAudience } from "../domain/ports/catalog.reader.js";
import { ttcCentsFromHtMillicentsFor } from "./shop-catalogue-view.js";

/**
 * L'article à son prix, et le tarif à **barrer** quand le prix servi est plus bas.
 *
 * Rien de barré à prix égal : une rature sur deux prix identiques ferait
 * chercher une remise qui n'existe pas. Le champ reste donc **absent du fil**
 * dans le cas ordinaire, ce qui garde la surface publique étroite.
 *
 * Un SKU absent de la résolution garde son prix canonique : ce n'est pas censé
 * arriver — les deux listes viennent de la même lecture — et retomber sur le
 * tarif est le seul repli qui ne mente pas. Un prix à zéro, lui, ferait croire à
 * un article offert.
 */
export function struck(
  item: ShopItemView,
  prices: ReadonlyMap<string, number>,
  audience: ShopAudience,
): ShopItemView {
  const resolved = prices.get(item.sku);
  if (resolved === undefined) {
    return item;
  }
  // 🔴 **Barré seulement si le prix servi est plus BAS**, jamais « s'ils
  // diffèrent ». Un prix résolu peut monter au-dessus du tarif — une altération
  // `increase`, une règle `replace` posée plus haut, ou un plancher qui relève
  // (`resolve-price.ts:121`). Sur « ils diffèrent », la vitrine aurait alors
  // barré le prix le plus BAS et présenté une référence mensongère sur une page
  // publique. Le prix servi reste celui qui sera facturé, dans les deux sens ;
  // c'est la rature qui exige une baisse (2026-09-09).
  // 🔴 **Le TTC suit le prix résolu, toujours.** Il est dérivé à la
  // construction, avant que la résolution n'ait joué : le laisser derrière
  // ferait afficher au rayon la taxe du tarif et le montant de la promotion —
  // deux nombres qui ne vont pas ensemble, sur une page publique.
  const priced = {
    ...item,
    unitPriceMillicents: resolved,
    // Celle d'un particulier est la valeur saisie (`ttcCentsFromHtMillicentsFor`, plan du centime, § 4).
    unitPriceTtcCents: ttcCentsFromHtMillicentsFor(resolved, item.vatRatePercent, audience),
  };
  if (resolved >= item.unitPriceMillicents) {
    return resolved === item.unitPriceMillicents ? item : priced;
  }
  return { ...priced, catalogPriceMillicents: item.unitPriceMillicents };
}
