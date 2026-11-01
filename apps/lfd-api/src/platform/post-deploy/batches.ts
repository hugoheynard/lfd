/**
 * **Les lots d'une application** : une opération après déploiement avance par
 * lots, et l'avancement est écrit après chacun
 * (`documentation/ops/plan-operations-apres-deploiement.md`, § 7.3).
 */

/** La taille d'un lot : assez petite pour que l'écran avance, assez grande pour ne pas écrire la trace à chaque ligne. */
export const POST_DEPLOY_BATCH_SIZE = 25;

/** Découpe une liste en lots, dans l'ordre. */
export function inBatches<T>(
  items: readonly T[],
  size: number = POST_DEPLOY_BATCH_SIZE,
): readonly (readonly T[])[] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

/** Les premières phrases d'un échantillon, et une ligne qui dit combien en ont été tues. */
export function boundedSample(lines: readonly string[], limit: number): readonly string[] {
  if (lines.length <= limit) {
    return lines;
  }
  return [...lines.slice(0, limit), `… et ${String(lines.length - limit)} autre(s).`];
}
