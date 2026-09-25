/**
 * La sélection d'une opération se RÉÉCRIT en entier, dans l'ordre d'affichage
 * (`PUT …/selection`). Ces fonctions composent la liste à envoyer ; elles ne
 * mutent jamais celle qu'on leur passe — un signal ne voit que les références
 * neuves.
 */

/** Ajoute en fin de liste ; un article déjà présent ne se double pas (le serveur le refuserait). */
export function withSku(skus: readonly string[], sku: string): readonly string[] {
  return skus.includes(sku) ? skus : [...skus, sku];
}

export function withoutSku(skus: readonly string[], sku: string): readonly string[] {
  return skus.filter((kept) => kept !== sku);
}

/** Échange l'article avec son voisin (`-1` = monter, `+1` = descendre). Hors bornes : rien. */
export function moved(skus: readonly string[], index: number, step: -1 | 1): readonly string[] {
  const target = index + step;
  const here = skus[index];
  const there = skus[target];
  if (here === undefined || there === undefined) {
    return skus;
  }
  const next = [...skus];
  next[index] = there;
  next[target] = here;
  return next;
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((sku, index) => sku === b[index]);
}
