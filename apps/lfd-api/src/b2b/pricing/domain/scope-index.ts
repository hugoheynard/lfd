import type { PriceScope, PricingContext } from "./price-rule.js";

/**
 * **La clé de portée** — ce par quoi un matériau de prix se range.
 *
 * `matchesScope` ne connaît que quatre formes : `global`, vrai sans condition,
 * et **trois égalités** sur un identifiant. Un article n'a donc que quatre clés
 * possibles, et piocher ces quatre seaux rend exactement ce que le prédicat
 * retenait — ni plus, ni moins. C'est cette équivalence qui autorise l'index,
 * et `scope-index.spec.ts` la tient contre `matchesScope` lui-même plutôt que
 * contre une liste écrite à la main.
 */
export type ScopeKey = "global" | `category:${string}` | `product:${string}` | `variant:${string}`;

/**
 * La clé d'une portée, ou `null` si elle ne vise **rien**.
 *
 * `PriceScope` porte son invariant en commentaire — « `id` est `null` si et
 * seulement si `type === 'global'` » — et un type ne le tient pas. Une portée
 * `category` sans identifiant est donc représentable, et `matchesScope` la
 * refuse déjà (`null === context.categoryId` est faux, `categoryId` étant une
 * chaîne). L'index la **jette** plutôt que de fabriquer une clé `category:null`
 * qu'une famille réellement nommée « null » viendrait un jour percuter.
 */
export function scopeKeyOf(scope: PriceScope): ScopeKey | null {
  if (scope.type === "global") {
    return "global";
  }
  return scope.id === null ? null : `${scope.type}:${scope.id}`;
}

/**
 * Les quatre clés que **cet article** porte, de la plus large à la plus étroite.
 *
 * L'ordre n'arbitre rien — `winnerOf` s'en charge par la spécificité, et
 * `resolvePrice` a besoin des perdants pour dire qui évince qui. Il est
 * simplement stable, ce qui rend les tests lisibles et les traces comparables.
 */
export function scopeKeysOf(context: PricingContext): readonly ScopeKey[] {
  return [
    "global",
    `category:${context.categoryId}`,
    `product:${context.productSku}`,
    `variant:${context.variantSku}`,
  ];
}

/**
 * Les matériaux rangés par clé de portée — **une liste par seau**, jamais un
 * élément.
 *
 * 🔴 Une `Map` 1:1 serait fausse, et ça a coûté une première version du plan.
 * Deux raisons indépendantes :
 *
 * - `resolvePrice` a besoin des **perdants** d'un étage pour renseigner
 *   `supersededRuleIds` — l'écran doit dire qui évince qui, sinon le lecteur
 *   additionne deux remises dont une seule agit ;
 * - un **gabarit met plusieurs règles dans le même seau**. La contrainte
 *   d'exclusion porte aussi sur `coalesce("min_quantity", 0)`, donc deux règles
 *   de même étage, portée, audience et fenêtre coexistent légalement dès que
 *   leurs seuils diffèrent — et `template-to-rules.ts` pose exactement ça, une
 *   règle par palier.
 *
 * ⚠️ Le précédent `mostSpecificFirst` (`@lfd/catalog-sync`) EST une `Map` 1:1,
 * et il a le droit de l'être : `order_time_limit_one_per_scope` garantit une
 * ligne par portée. La même garantie existe pour les **planchers**
 * (`price_floors_one_per_scope`), et pour eux seuls. Copier cette forme sur les
 * règles perdrait des candidats en silence.
 */
export type ScopeIndex<T> = ReadonlyMap<ScopeKey, readonly T[]>;

/**
 * Range des matériaux par clé de portée.
 *
 * Générique sur la façon de lire la portée plutôt que sur un type commun : les
 * trois matériaux n'en ont pas. Une règle a un étage et une audience, un barème
 * a des paliers, un plancher n'a **ni fenêtre ni audience** — leur inventer un
 * ancêtre commun pour cet index aurait fait porter à chacun ce que les autres
 * ont.
 */
export function indexByScope<T>(
  items: readonly T[],
  scopeOf: (item: T) => PriceScope,
): ScopeIndex<T> {
  const buckets = new Map<ScopeKey, T[]>();
  for (const item of items) {
    const key = scopeKeyOf(scopeOf(item));
    if (key === null) {
      continue;
    }
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, [item]);
    } else {
      bucket.push(item);
    }
  }
  return buckets;
}

/**
 * Ce que l'index rend pour un article : la concaténation de ses quatre seaux.
 *
 * **Le même tableau que le `WHERE` d'aujourd'hui**, reconstruit sans aller le
 * chercher. Ce n'est donc pas une accélération : le travail par article reste
 * proportionnel aux règles qui visent CET article, exactement comme
 * maintenant. C'est ce qui empêche le hissage d'échanger des lectures contre du
 * produit `articles × règles` — cf. `plan-materiaux-de-prix.md` §2.
 */
export function candidatesIn<T>(index: ScopeIndex<T>, context: PricingContext): T[] {
  return scopeKeysOf(context).flatMap((key) => [...(index.get(key) ?? [])]);
}
