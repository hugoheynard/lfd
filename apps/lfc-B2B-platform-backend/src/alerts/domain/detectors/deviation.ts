/**
 * L'arithmétique d'un écart, isolée — parce qu'elle est asymétrique et que cette
 * asymétrie est la source du bug le plus coûteux qu'on ait eu ici.
 */

/** Écart **signé** en % par rapport à une référence. Positif = hausse. */
export function deviationPercent(quantity: number, baseline: number): number {
  if (baseline <= 0) {
    return 0;
  }
  return Math.round(((quantity - baseline) / baseline) * 100);
}

/**
 * L'écart **absolu** à comparer au seuil du sens concerné.
 *
 * Une hausse est non bornée ; une baisse ne peut pas dépasser 100 %, et ne
 * l'atteint même jamais — un SKU absent d'une commande n'est pas un « 0
 * commandé ». C'est pourquoi les deux sens ont leur propre échelle, et pourquoi
 * on ne compare jamais une baisse à un seuil de hausse.
 */
export function magnitude(deviation: number): number {
  return Math.abs(deviation);
}

/** La médiane d'un échantillon — `null` si vide. Ne mute pas l'entrée. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const isEven = sorted.length % 2 === 0;
  const low = sorted[middle - 1] ?? 0;
  const high = sorted[middle] ?? 0;
  return isEven ? (low + high) / 2 : high;
}

/** La moyenne d'un échantillon — `null` si vide. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Arrondi d'affichage : une moyenne de 4,333 se dit « 4,3 », pas « 4,333 ». */
export function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}
