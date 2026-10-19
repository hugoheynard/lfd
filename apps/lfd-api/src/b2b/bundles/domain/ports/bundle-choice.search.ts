import type { BundleChoiceArticle } from "./bundle-choice-article.js";

/**
 * **Quels articles peut-on mettre dans une formule ?** — la recherche de
 * l'éditeur. Distincte de `BundleChoiceCatalogue` (ISP) : celle-ci ne rend que
 * l'admissible, pour proposer ; celle-là juge ce qu'on lui donne, pour refuser.
 */
export abstract class BundleChoiceSearch {
  /**
   * Les articles **admissibles** dont le nom ou le SKU contient `term` (casse
   * et accents ignorés), dans l'ordre du catalogue, `limit` au plus. Un terme
   * vide rend les premiers.
   */
  abstract search(term: string, limit: number): Promise<readonly BundleChoiceArticle[]>;
}
