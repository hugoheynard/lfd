import type {
  OrderTimeLimitScopeType,
  OrderTimeLimitView,
  ResolvedOrderTimeLimit,
} from "./order-time-limit.js";

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
 * **Résout la limite d'un article** en remontant l'échelle, **champ par champ**.
 *
 * ```
 * déclinaison → produit → famille la plus proche → … → racine → global
 * ```
 *
 * Chaque champ prend la **première valeur non nulle** rencontrée en descendant
 * cette liste. C'est ce qui fait qu'un rang peut poser ce qu'il change sans
 * recopier le reste : « le pain ferme à 16 h » n'a pas à redire le nombre de
 * jours, « l'entremets demande un jour de plus » n'a pas à redire l'heure.
 *
 * L'alternative — un rang qui se prononce l'emporte **entièrement** — aurait
 * obligé chaque article à dupliquer l'heure du labo pour changer d'un jour. Le
 * jour où cette heure change, chaque copie serait restée figée, en silence.
 *
 * ## Ce qui rend `null`
 *
 * Une limite n'existe que si **le jour et l'heure** sont tous deux résolus.
 * Inventer un défaut (« la veille à 18 h ») ferait refuser des commandes au nom
 * d'une règle que personne n'a écrite — le contraire de ce que le référentiel
 * doit garantir. Le rattrapage, lui, a un défaut honnête : pas de rattrapage
 * déclaré = limite ferme = `0`.
 *
 * Fonction **pure** : aucun port, aucune horloge. Elle dit ce qu'une règle vaut,
 * jamais si l'on est en retard — cette comparaison-là appartient à qui tient
 * l'horloge.
 */
export function resolveOrderTimeLimit(
  rules: readonly OrderTimeLimitView[],
  target: LimitTarget,
): ResolvedOrderTimeLimit | null {
  const ordered = mostSpecificFirst(rules, target);

  const daysBefore = firstDefined(ordered, (rule) => rule.daysBefore);
  const time = firstDefined(ordered, (rule) => rule.time);
  if (daysBefore === null || time === null) {
    return null;
  }
  return { daysBefore, time, graceMinutes: firstDefined(ordered, (r) => r.graceMinutes) ?? 0 };
}

/**
 * Les règles qui visent cet article, **de la plus précise à la plus générale**.
 *
 * On construit la liste des portées attendues puis on y pioche, plutôt que de
 * trier les règles : le tri aurait demandé un rang numérique par famille, donc
 * une seconde expression de la profondeur de l'arbre — et deux expressions d'une
 * même hiérarchie finissent par se contredire sur un cas limite.
 */
function mostSpecificFirst(
  rules: readonly OrderTimeLimitView[],
  target: LimitTarget,
): readonly OrderTimeLimitView[] {
  const byKey = new Map(rules.map((rule) => [`${rule.scope.type}:${rule.scope.id ?? ""}`, rule]));
  const keys = [
    ...(target.variantId === null ? [] : [`variant:${target.variantId}`]),
    `product:${target.productId}`,
    ...target.categoryPath.map((id) => `category:${id}`),
    "global:",
  ];
  return keys.flatMap((key) => {
    const found = byKey.get(key);
    return found === undefined ? [] : [found];
  });
}

/** La première valeur non nulle en descendant l'échelle, ou `null`. */
function firstDefined<T>(
  ordered: readonly OrderTimeLimitView[],
  read: (rule: OrderTimeLimitView) => T | null,
): T | null {
  for (const rule of ordered) {
    const value = read(rule);
    if (value !== null) {
      return value;
    }
  }
  return null;
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
 * La même résolution, mais qui **dit d'où vient** chaque valeur.
 *
 * Elle partage la descente d'échelle avec {@link resolveOrderTimeLimit} — deux
 * parcours auraient fini par diverger sur un cas limite, et c'est l'écran qui
 * aurait alors affirmé autre chose que ce que la commande applique.
 *
 * `graceMinutes` reste `null` quand personne ne le pose : c'est à l'appelant de
 * dire « aucun rattrapage », parce que la valeur par défaut (`0`) n'a pas de
 * rang d'origine à nommer.
 */
export function explainOrderTimeLimit(
  rules: readonly OrderTimeLimitView[],
  target: LimitTarget,
): ExplainedOrderTimeLimit {
  const ordered = mostSpecificFirst(rules, target);
  return {
    daysBefore: firstPosed(ordered, (rule) => rule.daysBefore),
    time: firstPosed(ordered, (rule) => rule.time),
    graceMinutes: firstPosed(ordered, (rule) => rule.graceMinutes),
  };
}

/** La première valeur posée en descendant l'échelle, avec le rang qui la pose. */
function firstPosed<T>(
  ordered: readonly OrderTimeLimitView[],
  read: (rule: OrderTimeLimitView) => T | null,
): ResolvedField<T> | null {
  for (const rule of ordered) {
    const value = read(rule);
    if (value !== null) {
      return { value, from: rule.scope.type };
    }
  }
  return null;
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
