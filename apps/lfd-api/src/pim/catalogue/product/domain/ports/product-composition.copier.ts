import type { WriteTicket } from "../../../../../platform/journal/scoped-journal.js";

/**
 * **Recopie la composition d'une fiche sur une autre** — les ingrédients
 * qu'elle cite, dans leur ordre (`plan-gestes-de-declinaison.md`, D3).
 *
 * Même montage que `IngredientCitationsReader` : déclaré par le catalogue, qui
 * fait naître le produit détaché ; implémenté par la provenance
 * (`ingredients/`), qui possède `product_ingredient`. Le catalogue n'écrit pas
 * ses tables. Un port d'ÉCRITURE à part : aucun lecteur des citations n'en a
 * l'usage (ISP).
 *
 * S'exécute dans l'unité de travail de l'appelant, sous son ticket : la copie
 * part avec la naissance du produit, ou rien ne part.
 */
export abstract class ProductCompositionCopier {
  abstract copy(fromProductId: string, toProductId: string, ticket: WriteTicket): Promise<void>;
}
