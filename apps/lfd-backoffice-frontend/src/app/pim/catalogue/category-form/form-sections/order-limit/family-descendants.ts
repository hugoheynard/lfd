/** Une famille, réduite à ce que l'arbre demande. */
export interface FamilyNode {
  readonly id: string;
  readonly parentId: string | null;
}

/** Un produit, réduit à sa famille directe. */
export interface ProductInFamily {
  readonly id: string;
  readonly categoryId: string;
}

/**
 * La famille et toutes ses sous-familles. Un arbre corrompu (un parent qui
 * redescend sur lui-même) ne fait pas tourner en boucle : chaque famille n'est
 * visitée qu'une fois.
 */
export function familyDescendants(
  families: readonly FamilyNode[],
  rootId: string,
): ReadonlySet<string> {
  const children = new Map<string, string[]>();
  for (const family of families) {
    if (family.parentId !== null) {
      const list = children.get(family.parentId) ?? [];
      list.push(family.id);
      children.set(family.parentId, list);
    }
  }
  const seen = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift() ?? '';
    for (const child of children.get(current) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }
  return seen;
}

/**
 * Les produits que la limite de la famille vise et qu'on peut donc exclure :
 * ceux de sa descendance, moins ceux déjà exclus.
 */
export function excludableProducts<P extends ProductInFamily>(
  products: readonly P[],
  families: readonly FamilyNode[],
  rootId: string,
  excluded: ReadonlySet<string>,
): readonly P[] {
  const descendants = familyDescendants(families, rootId);
  return products.filter(
    (product) => descendants.has(product.categoryId) && !excluded.has(product.id),
  );
}
