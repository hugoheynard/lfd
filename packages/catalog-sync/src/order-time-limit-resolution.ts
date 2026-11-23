/**
 * **La résolution des limites de commande** — partagée par les deux rives du
 * fil : le fil porte les RÈGLES, et le référentiel comme le commerce les
 * résolvent ici. Une résolution par rive finirait par diverger sur un cas
 * limite, entre l'écran du référentiel et la garde de commande.
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
 * **Ce que la résolution lit d'une règle.** La liste d'exclusions peut
 * manquer : la vue du référentiel ne la porte pas encore, et une règle sans
 * liste n'exclut rien — la même lecture que le schéma du fil.
 */
export type ResolvableOrderTimeLimitRule = Omit<SyncOrderTimeLimitRule, "excludedProductIds"> & {
  readonly excludedProductIds?: readonly string[] | undefined;
};

/** Une règle complète qui vise l'article, et sa précision (0 = le produit, puis la famille la plus proche). */
interface Candidate {
  readonly rule: ResolvableOrderTimeLimitRule;
  readonly daysBefore: number;
  readonly time: string;
  readonly precision: number;
}

/**
 * **Résout la limite d'un article** : la plus stricte des règles qui le visent.
 *
 * Visent l'article la règle de **son produit** et celle de **chaque famille de
 * sa lignée** (`categoryPath`) qui ne l'exclut pas nommément. Une exclusion ne
 * vaut que pour la famille qui la porte : une famille parente qui ne l'exclut
 * pas le vise encore. Les rangs « global » et « déclinaison » ne visent rien :
 * « toute la production » se règle au commerce, une déclinaison suit son
 * produit.
 *
 * - **Règle entière** : une règle sans délai ou sans heure ne compte pas ; il
 *   n'y a pas d'héritage champ par champ.
 * - **La plus stricte gagne** : plus de jours avant, puis l'heure la plus tôt.
 *   Aucune règle n'en relâche une autre.
 * - **Pas de rattrapage** : `graceMinutes` vaut `0` ; le seul rattrapage est
 *   celui de la règle générale.
 * - **« L'équipe peut passer outre »** vaut vrai seulement si TOUTES les règles
 *   en jeu le permettent : passer outre fait juger la ligne par la seule règle
 *   générale, donc fait tomber toutes les limites de l'article, pas seulement
 *   la gagnante.
 *
 * Fonction **pure** : aucun port, aucune horloge.
 */
export function resolveOrderTimeLimit(
  rules: readonly ResolvableOrderTimeLimitRule[],
  target: LimitTarget,
): SyncOrderTimeLimit | null {
  const candidates = candidatesFor(rules, target);
  const winner = strictestOf(candidates);
  if (winner === null) {
    return null;
  }
  return {
    daysBefore: winner.daysBefore,
    time: winner.time,
    graceMinutes: 0,
    staffMayExceed: candidates.every((candidate) => candidate.rule.staffMayExceed),
  };
}

/** Les règles complètes qui visent l'article, chacune avec sa précision. */
function candidatesFor(
  rules: readonly ResolvableOrderTimeLimitRule[],
  target: LimitTarget,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const rule of rules) {
    const precision = precisionOf(rule, target);
    if (precision !== null && rule.daysBefore !== null && rule.time !== null) {
      candidates.push({ rule, daysBefore: rule.daysBefore, time: rule.time, precision });
    }
  }
  return candidates;
}

/** `null` quand la règle ne vise pas l'article ; sinon 0 pour le produit, 1 + rang dans la lignée pour une famille. */
function precisionOf(rule: ResolvableOrderTimeLimitRule, target: LimitTarget): number | null {
  if (rule.scope.type === "product") {
    return rule.scope.id === target.productId ? 0 : null;
  }
  if (rule.scope.type !== "category" || rule.scope.id === null) {
    return null;
  }
  const rank = target.categoryPath.indexOf(rule.scope.id);
  if (rank < 0 || (rule.excludedProductIds ?? []).includes(target.productId)) {
    return null;
  }
  return rank + 1;
}

/** La plus stricte ; à égalité, la plus précise. */
function strictestOf(candidates: readonly Candidate[]): Candidate | null {
  let winner: Candidate | null = null;
  for (const candidate of candidates) {
    if (winner === null || isStricter(candidate, winner)) {
      winner = candidate;
    }
  }
  return winner;
}

function isStricter(left: Candidate, right: Candidate): boolean {
  if (left.daysBefore !== right.daysBefore) {
    return left.daysBefore > right.daysBefore;
  }
  if (left.time !== right.time) {
    // `HH:MM` sur deux chiffres : l'ordre des chaînes est celui des heures.
    return left.time < right.time;
  }
  return left.precision < right.precision;
}

/** La règle qui a gagné : un produit, ou une famille nommée. */
export interface OrderTimeLimitOrigin {
  readonly type: "product" | "category";
  readonly id: string;
}

/**
 * La limite résolue, **avec sa provenance** : un écran dit « 2 jours avant,
 * 12 h — famille Gâteaux », et la passation ne lit que les valeurs.
 */
export interface ExplainedOrderTimeLimit {
  readonly limit: SyncOrderTimeLimit;
  readonly from: OrderTimeLimitOrigin;
}

/**
 * La même résolution, avec la règle qui a gagné. Partage ses candidates avec
 * {@link resolveOrderTimeLimit} pour ne jamais dire autre chose que la passation.
 */
export function explainOrderTimeLimit(
  rules: readonly ResolvableOrderTimeLimitRule[],
  target: LimitTarget,
): ExplainedOrderTimeLimit | null {
  const limit = resolveOrderTimeLimit(rules, target);
  const winner = strictestOf(candidatesFor(rules, target));
  if (limit === null || winner === null || winner.rule.scope.id === null) {
    return null;
  }
  const type = winner.rule.scope.type === "product" ? "product" : "category";
  return { limit, from: { type, id: winner.rule.scope.id } };
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
 * Elle-même en tête : à égalité de sévérité, la famille la plus proche est la
 * provenance affichée.
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
