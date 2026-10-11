import type { MediaCarriers } from "../channels/carriers/media-carriers.js";

/**
 * Combien d'URL par question aux porteurs. Une question par paquet plutôt
 * qu'une seule : un `IN` de cinq mille valeurs chez chaque porteur est une
 * requête qu'on ne veut pas écrire, et un paquet par image serait cinq mille
 * allers-retours.
 */
const USES_BATCH = 500;

/** Les emplois, par paquets — le silence d'un porteur fait échouer, jamais zéro. */
export async function usesInBatches(
  carriers: MediaCarriers,
  urls: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  const uses = new Map<string, number>();
  for (let start = 0; start < urls.length; start += USES_BATCH) {
    const answer = await carriers.usesOf(urls.slice(start, start + USES_BATCH));
    for (const [url, count] of answer) {
      uses.set(url, count);
    }
  }
  return uses;
}
