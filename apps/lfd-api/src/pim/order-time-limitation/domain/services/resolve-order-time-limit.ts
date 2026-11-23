/**
 * **La résolution d'une limite de commande vit dans `@lfd/catalog-sync`**
 * (réexportée par `@lfd/pim-contracts`) : la plus stricte des règles qui visent
 * l'article — celle de son produit et celle de chaque famille de sa lignée qui
 * ne l'exclut pas.
 *
 * Une seule fonction pour le référentiel, le back-office et le commerce : deux
 * descentes à tenir d'accord divergeraient sans que l'écart saute aux yeux,
 * l'écran et la commande ne se lisant pas au même endroit.
 */
export {
  explainOrderTimeLimit,
  resolveOrderTimeLimit,
  type ExplainedOrderTimeLimit,
  type LimitTarget,
  type OrderTimeLimitOrigin,
} from "@lfd/pim-contracts";
