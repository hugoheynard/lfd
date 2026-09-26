import { medianMillicents } from "../domain/floor-drift.js";
import type { PriceScope } from "../domain/price-rule.js";

/** Ce que la référence a besoin de savoir d'un article : sa famille et son prix. */
export interface ReferenceArticle {
  readonly sku: string;
  /**
   * Sa famille, lignée comprise — une limite posée sur une parente compte ses
   * sous-familles. `null` = famille inconnue : aucune limite de famille ne le
   * compte.
   */
  readonly family: { readonly path: readonly string[] } | null;
  readonly unitPriceMillicents: number;
}

/**
 * **Le tarif représentatif des articles qu'une limite vise**, au moment où on la
 * pose.
 *
 * C'est la seule chose qui permette, six mois plus tard, de dire que l'intention
 * a vieilli : sans référence, le tarif d'aujourd'hui ne se compare à rien.
 *
 * `null` quand la portée ne vise aucun article connu — une famille vide, un SKU
 * inconnu du catalogue. Le signal de dérive se taira alors, ce qui est la bonne
 * conduite : il vaut mieux ne rien dire que d'annoncer un écart calculé sur
 * rien.
 */
export function referenceCanonicalFor(
  scope: PriceScope,
  articles: readonly ReferenceArticle[],
): number | null {
  return medianMillicents(targeted(scope, articles).map((article) => article.unitPriceMillicents));
}

/**
 * Les articles qu'une portée vise.
 *
 * `product` et `variant` visent le même SKU tant que le catalogue n'a qu'un
 * niveau — même écart temporaire que dans `pricingContextFor`, et il se referme
 * à la bascule du catalogue sans que ce fichier change.
 */
function targeted(
  scope: PriceScope,
  articles: readonly ReferenceArticle[],
): readonly ReferenceArticle[] {
  switch (scope.type) {
    case "global":
      return articles;
    case "category":
      return articles.filter(
        (article) => scope.id !== null && (article.family?.path.includes(scope.id) ?? false),
      );
    case "product":
    case "variant":
      return articles.filter((article) => article.sku === scope.id);
  }
}
