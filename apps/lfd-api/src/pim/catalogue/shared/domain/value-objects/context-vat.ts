/**
 * Le taux visé par une famille, **par clé de contexte**. Une clé absente n'est
 * pas un taux nul : c'est l'absence de réglage, et les deux se distinguent.
 */
export type ContextVat = Readonly<Record<string, string>>;

/**
 * Le taux EFFECTIF d'un produit : sa dérogation par-dessus celle de sa famille.
 *
 * Une seule ligne, mais c'est LA règle de résolution, et elle vit ici pour
 * qu'il n'y en ait qu'une : deux canaux qui la réécriraient chacun de leur côté
 * factureraient un jour deux taux différents pour le même article.
 *
 * Contexte par contexte : un produit peut déroger en B2B et suivre sa famille
 * au comptoir. C'est le cas courant, pas l'exception.
 */
export function effectiveVat<T>(
  family: Readonly<Record<string, T>>,
  product: Readonly<Record<string, T>>,
): Readonly<Record<string, T>> {
  return { ...family, ...product };
}
