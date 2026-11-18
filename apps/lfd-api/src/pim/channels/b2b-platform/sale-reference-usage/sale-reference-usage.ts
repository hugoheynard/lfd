/**
 * Le port `SaleReferenceUsage` tel que le commerce l'implémente.
 *
 * Il est DÉCLARÉ par le catalogue (`catalogue/product/domain/ports/sale-reference-usage.ts`),
 * qui demande « cette référence a-t-elle déjà servi ? » ; ce fichier n'en est que
 * la porte publiée — un bloc extérieur n'atteint le référentiel que par
 * `channels/` (`lint:context-boundaries`), et la classe, donc le jeton
 * d'injection, est la même des deux côtés.
 */
export {
  SaleReferenceUsage,
  type SaleReferenceQuery,
  type SaleReferenceUse,
} from "../../../catalogue/product/domain/ports/sale-reference-usage.js";
