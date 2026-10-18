import type { ShopItemView } from "@lfd/contracts";

/**
 * Port de **lecture** : l'article suggéré tel que la vitrine le sert à ce
 * lecteur — au MÊME prix résolu que le rayon. Une suggestion qui calculerait
 * son propre prix finirait par afficher ce que le rayon contredit.
 */
export abstract class SuggestedArticleReader {
  /**
   * @param companyId `null` = un visiteur ou l'espace perso : le tarif public.
   * @returns SKU → vue d'article ; un SKU absent de la vitrine est absent.
   */
  abstract articles(
    skus: readonly string[],
    companyId: string | null,
  ): Promise<ReadonlyMap<string, ShopItemView>>;
}
