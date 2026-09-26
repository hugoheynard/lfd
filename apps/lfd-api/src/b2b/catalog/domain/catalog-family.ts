import type { CatalogFamilyView } from "@lfd/contracts";

/**
 * **Une famille du référentiel, telle que le commerce la range et la tarifie.**
 *
 * Tout vient du miroir `catalog_categories`, reçu du PIM à chaque livraison et
 * jamais édité ici : l'`id` est celui du PIM, `name` et `position` aussi. Il
 * n'y a plus de table de rayons dans le code (plan
 * `documentation/pricing/plan-familles-en-donnees.md`) — une famille livrée
 * EST un rayon, sans déploiement.
 *
 * `path` est ce que la tarification lit : la famille puis ses parentes, **de
 * la plus proche à la plus lointaine** — la même lignée que l'heure limite
 * (`categoryPathOf`, `snapshot-limits.ts`). Une décision posée sur une famille
 * vaut pour ses sous-familles, et la plus proche l'emporte : deux sémantiques
 * de famille dans le même produit se paieraient à la première sous-famille.
 */
export interface CatalogFamily {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  /**
   * Le slug du référentiel. Lu pour une seule raison : c'est le lien stable
   * entre un ancien code de rayon et la famille d'aujourd'hui
   * (`legacy-shelf-codes.ts`).
   */
  readonly slug: string;
  /** La famille elle-même en tête, puis ses parentes. Jamais vide. */
  readonly path: readonly string[];
}

/** La famille telle qu'un écran la reçoit — sans lignée ni slug. */
export function familyView(family: CatalogFamily): CatalogFamilyView {
  return { id: family.id, name: family.name, position: family.position };
}

/**
 * La lignée que vise une portée `category`, ou **aucune** pour un article sans
 * famille connue : il ne reçoit alors que les décisions d'article et de
 * catalogue (lot 0 du plan).
 */
export function familyPathOf(family: CatalogFamily | null): readonly string[] {
  return family?.path ?? [];
}

/**
 * L'ordre du référentiel : la position de la famille, puis son nom, puis son
 * id — deux familles homonymes à la même position restent chacune d'un bloc.
 * Les articles sans famille connue ferment la marche.
 */
export function compareFamilies(left: CatalogFamily | null, right: CatalogFamily | null): number {
  if (left === null || right === null) {
    return left === right ? 0 : left === null ? 1 : -1;
  }
  const delta = left.position - right.position;
  if (delta !== 0) {
    return delta;
  }
  const byName = left.name.localeCompare(right.name, "fr");
  return byName !== 0 ? byName : left.id.localeCompare(right.id);
}
