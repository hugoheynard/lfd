import type { ResupplyArticle } from "./resupply-catalogue.js";
import type { ResupplyListLine } from "./resupply-line-list.js";

/** Pourquoi une ligne d'un modèle ne s'appliquerait pas aujourd'hui (M6). */
export type ResupplyTemplateLineIssue = "withdrawn" | "sale_unit_changed";

/**
 * Une ligne d'un modèle confrontée au catalogue du réassort d'aujourd'hui :
 * l'article l'a quitté (`withdrawn`), ou son unité de vente n'est plus celle
 * figée sur la ligne (`sale_unit_changed`) — des pièces lues en grammes
 * compteraient mille fois moins. `null` : elle s'applique. Le modèle n'est
 * jamais corrigé ici ; la lecture le dit, l'application l'écartera.
 */
export function templateLineIssueOf(
  line: ResupplyListLine,
  article: ResupplyArticle | undefined,
): ResupplyTemplateLineIssue | null {
  if (article === undefined) {
    return "withdrawn";
  }
  return article.saleUnit === line.saleUnit ? null : "sale_unit_changed";
}
