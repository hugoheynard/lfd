/**
 * **La résolution d'une limite de commande vit dans `@lfd/catalog-sync`**, et
 * ce fichier la réexporte pour le référentiel et le back-office.
 *
 * Les deux rives résolvent les mêmes RÈGLES avec la même fonction : une
 * implémentation par rive divergerait sur un cas limite sans que personne le
 * voie, l'écran du référentiel et la garde de commande ne se lisant pas au même
 * endroit.
 *
 * Les règles y sont typées par `ResolvableOrderTimeLimitRule`, que
 * `OrderTimeLimitView` satisfait structurellement (mêmes champs, plus son
 * identifiant et son `scopeLabel`) : résoudre ne demande pas de conversion.
 * Ce qui ÉMET, en revanche, convertit explicitement (`toSyncRule`) : passer la
 * vue telle quelle ferait entrer le nom d'une famille dans le snapshot, donc
 * dans son empreinte, et renommer une famille produirait une livraison.
 */
export { categoryPathOf, explainOrderTimeLimit, resolveOrderTimeLimit } from "@lfd/catalog-sync";
export type {
  CategoryNode,
  ExplainedOrderTimeLimit,
  LimitTarget,
  OrderTimeLimitOrigin,
  ResolvableOrderTimeLimitRule,
} from "@lfd/catalog-sync";
