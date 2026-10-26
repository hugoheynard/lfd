/**
 * Applique `run` à chaque élément avec au plus `limit` appels en vol, et rend
 * les résultats dans l'ordre d'entrée.
 *
 * Un `Promise.all` sur tout le catalogue a lancé 228 lectures d'un coup le
 * 2026-10-26 : la passerelle a répondu 429 et bloqué la session une minute.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  // Un SEUL itérateur partagé : chaque ouvrier prend l'élément suivant libre.
  const queue = items.entries();
  const worker = async (): Promise<void> => {
    for (const [index, item] of queue) {
      results[index] = await run(item);
    }
  };
  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: width }, () => worker()));
  return results;
}
