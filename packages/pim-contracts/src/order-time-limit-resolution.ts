/**
 * **La descente de l'échelle vit dans `@lfd/catalog-sync`.**
 *
 * Elle est partie le 2026-09-04, avec la v7 du fil : ce sont désormais les
 * RÈGLES qui traversent, pas leur résultat, donc les deux rives descendent la
 * même échelle. Une implémentation par rive aurait divergé sur un cas limite —
 * et l'écart n'aurait sauté aux yeux de personne, l'écran du référentiel et la
 * garde de commande ne se lisant pas au même endroit.
 *
 * Ce fichier ne fait plus que réexporter : les imports du référentiel et du
 * back-office n'ont pas eu à bouger.
 *
 * ⚠️ Les règles y sont typées par la forme du **fil**
 * (`SyncOrderTimeLimitRule`), que `OrderTimeLimitView` satisfait
 * structurellement : elle porte les mêmes champs, plus son identifiant et son
 * `scopeLabel`. Aucun appelant n'a donc eu à convertir pour RÉSOUDRE — la
 * fonction ne lit que ce qu'elle connaît.
 *
 * Ce qui ÉMET, en revanche, convertit explicitement (`toSyncRule`), et
 * précisément à cause de cette tolérance : TypeScript accepte le surplus dès
 * que l'objet n'est pas un littéral, si bien que passer la vue telle quelle
 * ferait entrer le nom d'une famille dans le snapshot — donc dans son
 * empreinte, donc renommer une famille produirait une livraison.
 */
export { categoryPathOf, explainOrderTimeLimit, resolveOrderTimeLimit } from "@lfd/catalog-sync";
export type {
  CategoryNode,
  ExplainedOrderTimeLimit,
  LimitTarget,
  ResolvedField,
} from "@lfd/catalog-sync";
