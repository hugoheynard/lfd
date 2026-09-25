/** Un refus, rattaché à ce qui a été refusé et à la raison que le serveur a donnée. */
export interface BulkRefusal<T> {
  readonly item: T;
  readonly reason: string;
}

export interface BulkOutcome<T> {
  readonly posed: readonly T[];
  readonly refused: readonly BulkRefusal<T>[];
}

/**
 * Combien de poses partent en même temps. Assez pour qu'une centaine d'articles
 * ne prenne pas une minute, assez peu pour ne pas saturer le serveur ni le
 * verrou de la contrainte d'exclusion.
 */
export const BULK_CONCURRENCY = 4;

/**
 * **Applique un geste à chaque élément, N à la fois**, et rend le bilan.
 *
 * Il n'y a pas de route groupée : chaque élément est un appel à part, et donc
 * un succès ou un refus à part. Rien n'est défait quand un élément échoue — la
 * route est idempotente par portée, rejouer les refusés est sans danger.
 */
export async function runBulk<T>(
  items: readonly T[],
  act: (item: T) => Promise<void>,
  explain: (error: unknown) => string,
  concurrency: number = BULK_CONCURRENCY,
): Promise<BulkOutcome<T>> {
  const posed: T[] = [];
  const refused: BulkRefusal<T>[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item === undefined) {
        return;
      }
      try {
        await act(item);
        posed.push(item);
      } catch (error) {
        refused.push({ item, reason: explain(error) });
      }
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  // Le bilan suit l'ordre de la sélection, pas celui des réponses.
  const order = new Map(items.map((item, index) => [item, index]));
  const byOrder = (a: T, b: T): number => (order.get(a) ?? 0) - (order.get(b) ?? 0);
  return {
    posed: posed.sort(byOrder),
    refused: refused.sort((a, b) => byOrder(a.item, b.item)),
  };
}
