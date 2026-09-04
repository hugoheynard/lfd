/**
 * **La résolution de l'échelle vit dans `@lfd/pim-contracts`.**
 *
 * Elle est partie le 2026-09-04, quand la fiche produit a dû montrer la limite
 * EFFECTIVE d'un article et pas seulement ce qu'il pose lui-même : sans ça,
 * l'écran affichait « Hérité » sans dire de quoi, ce qui ne dit rien.
 *
 * La recopier côté front aurait été le pire des deux mondes — deux descentes
 * d'échelle à tenir d'accord, et l'écart n'aurait sauté aux yeux de personne
 * puisque l'écran et la commande ne se lisent pas au même endroit.
 *
 * Ce fichier ne fait plus que réexporter : les imports du référentiel n'ont pas
 * eu à bouger, et le contrat est le seul endroit où la règle s'écrit.
 */
export {
  explainOrderTimeLimit,
  resolveOrderTimeLimit,
  type ExplainedOrderTimeLimit,
  type LimitTarget,
  type ResolvedField,
} from "@lfd/pim-contracts";
