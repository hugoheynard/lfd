import type { ShopItemView } from "@lfd/contracts";

import type { ShopAudience } from "../../../catalog/domain/ports/catalog.reader.js";

/**
 * Port de **lecture** : l'article suggéré tel que la vitrine le sert à ce
 * lecteur — au MÊME prix résolu que le rayon. Une suggestion qui calculerait
 * son propre prix finirait par afficher ce que le rayon contredit.
 */
export abstract class SuggestedArticleReader {
  /**
   * @param companyId `null` = un visiteur ou l'espace perso : le tarif public.
   * @param audience la vitrine à lire. Avec une société, toujours `pro` ;
   * sans société, `public` en boutique, et `pro` seulement pour l'aperçu du
   * staff (RS5) — la vitrine pro sans tarif de société.
   * @returns SKU → vue d'article ; un SKU absent de la vitrine est absent.
   */
  abstract articles(
    skus: readonly string[],
    companyId: string | null,
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, ShopItemView>>;
}
