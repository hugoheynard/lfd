/**
 * **La descente de l'échelle des limites de commande** — partagée par les deux
 * rives du fil.
 *
 * Elle a vécu dans `@lfd/pim-contracts`, et elle y était juste tant que seul le
 * référentiel résolvait : le fil portait des valeurs déjà calculées. Depuis la
 * **v7**, ce sont les RÈGLES qui traversent — donc le récepteur descend
 * l'échelle lui aussi, et une descente par rive aurait fini par diverger sur un
 * cas limite. L'écart n'aurait sauté aux yeux de personne : l'écran du
 * référentiel et la garde de commande ne se lisent pas au même endroit.
 *
 * Elle vit donc avec le contrat qui transporte les règles. `@lfd/pim-contracts`
 * la réexporte : les imports du référentiel et du back-office n'ont pas bougé.
 *
 * **Pure** : aucun port, aucune horloge. Elle dit ce qu'une règle vaut, jamais
 * si l'on est en retard — cette comparaison-là appartient à qui tient l'horloge.
 */

import type { SyncOrderTimeLimit, SyncOrderTimeLimitRule } from "./snapshot.js";

/**
 * **Le rang d'une règle** — l'étage de l'échelle qui la pose.
 *
 * Extrait du schéma du fil plutôt que redéclaré : une seconde union finirait par
 * gagner un rang d'un côté et pas de l'autre.
 */
export type OrderTimeLimitScopeType = SyncOrderTimeLimitRule["scope"]["type"];

/**
 * **L'article qu'on cherche à tarifer en temps**, et sa lignée de familles.
 *
 * `categoryPath` va de la famille **la plus proche** à la racine. L'ordre est
 * porté par l'appelant plutôt que redéduit ici : le service resterait pur mais
 * devrait connaître l'arbre, donc dépendre d'un port — et une règle de
 * résolution qui fait une requête cesse d'être testable sans base.
 */
export interface LimitTarget {
  readonly variantId: string | null;
  readonly productId: string;
  readonly categoryPath: readonly string[];
}

/**
 * **Résout la limite d'un article** : celle de **son produit**, et rien d'autre.
 *
 * 🔴 Depuis le 2026-10-21 (décision de Hugo,
 * `documentation/limites-de-commande/schema-des-reglages.md` §4, points 1 à
 * 3), le référentiel n'a plus qu'**une limite par produit, règle entière, sans
 * rattrapage** :
 *
 * - « toute la production » se règle au commerce (Réglages › Commandes › Heure
 *   limite) ; une famille n'a plus de limite propre ; une déclinaison suit son
 *   produit. Une règle résiduelle de ces portées — d'avant la décision, ou
 *   d'un fait déjà rangé chez le récepteur — est **ignorée** ici, et c'est ce
 *   qui la rend inerte sans migration destructive ;
 * - plus d'héritage champ par champ : la règle du produit dit le délai ET
 *   l'heure, sinon il n'y a pas de limite ;
 * - le rattrapage vaut toujours `0` : le seul rattrapage est celui de la règle
 *   générale. Une grâce résiduelle sur une ligne produit est ignorée.
 *
 * `variantId` et `categoryPath` restent dans {@link LimitTarget} : les
 * appelants les portent encore, et la forme ne change pas pour eux.
 *
 * Fonction **pure** : aucun port, aucune horloge.
 */
export function resolveOrderTimeLimit(
  rules: readonly SyncOrderTimeLimitRule[],
  target: LimitTarget,
): SyncOrderTimeLimit | null {
  const rule = productRuleOf(rules, target);
  if (rule === undefined || rule.daysBefore === null || rule.time === null) {
    return null;
  }
  return { daysBefore: rule.daysBefore, time: rule.time, graceMinutes: 0 };
}

/** La règle posée sur le produit de l'article, s'il y en a une. */
function productRuleOf(
  rules: readonly SyncOrderTimeLimitRule[],
  target: LimitTarget,
): SyncOrderTimeLimitRule | undefined {
  return rules.find((rule) => rule.scope.type === "product" && rule.scope.id === target.productId);
}

/** D'où vient une valeur résolue : le rang qui l'a posée. */
export interface ResolvedField<T> {
  readonly value: T;
  readonly from: OrderTimeLimitScopeType;
}

/**
 * La limite résolue, **avec la provenance de chaque valeur**.
 *
 * Le fil n'en a pas besoin — il envoie des nombres. Un ÉCRAN, si : dire
 * « Hérité » sans dire de quoi ne dit rien, et l'héritage se faisant champ par
 * champ, les trois valeurs peuvent venir de trois rangs différents. Une seule
 * mention pour l'ensemble aurait donc menti sur deux tiers de la ligne.
 */
export interface ExplainedOrderTimeLimit {
  readonly daysBefore: ResolvedField<number> | null;
  readonly time: ResolvedField<string> | null;
  readonly graceMinutes: ResolvedField<number> | null;
}

/**
 * La même résolution, avec la **provenance** de chaque valeur.
 *
 * Depuis le 2026-10-21, la seule provenance possible est le produit, et le
 * rattrapage n'en a pas (`null`) : gardée pour la forme de ses lecteurs, elle
 * partage {@link resolveOrderTimeLimit} pour ne jamais dire autre chose que la
 * passation.
 */
export function explainOrderTimeLimit(
  rules: readonly SyncOrderTimeLimitRule[],
  target: LimitTarget,
): ExplainedOrderTimeLimit {
  const limit = resolveOrderTimeLimit(rules, target);
  return {
    daysBefore: limit === null ? null : { value: limit.daysBefore, from: "product" },
    time: limit === null ? null : { value: limit.time, from: "product" },
    graceMinutes: null,
  };
}

/** Ce qu'il faut d'une famille pour remonter son arbre. */
export interface CategoryNode {
  readonly id: string;
  readonly parentId: string | null;
}

/**
 * La **lignée** d'une famille : elle-même d'abord, puis ses ancêtres jusqu'à la
 * racine — l'ordre que {@link resolveOrderTimeLimit} attend.
 *
 * Elle-même en tête parce que « le plus proche gagne » commence par le rang le
 * plus précis.
 *
 * 🔴 **Un cycle ne boucle pas ici.** L'arbre des familles est censé ne pas en
 * avoir, mais « censé » n'est pas une garantie qu'on veut voir tomber sous la
 * forme d'un processus figé : la remontée s'arrête sur un identifiant déjà vu.
 * Le chemin rendu est alors tronqué — donc une règle d'ancêtre lointain peut
 * être manquée —, et c'est le bon compromis : une limite oubliée se voit, un
 * écran qui ne rend jamais la main ne se voit pas.
 *
 * Écrite ici et pas chez ses deux appelants — le push du référentiel et la fiche
 * produit — parce qu'un second parcours aurait fini par garder ce garde-fou d'un
 * seul côté.
 */
export function categoryPathOf(
  categories: readonly CategoryNode[],
  categoryId: string | null,
): readonly string[] {
  const parents = new Map(categories.map((category) => [category.id, category.parentId]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current = categoryId;
  while (current !== null && current !== "" && !seen.has(current)) {
    seen.add(current);
    path.push(current);
    current = parents.get(current) ?? null;
  }
  return path;
}
