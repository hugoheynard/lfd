/**
 * **Ce que le container de l'API consomme vraiment** — CPU et mémoire, lus chez
 * Cloudflare (`containersMetricsAdaptiveGroups`), rapportés à ce que le type
 * d'instance alloue.
 *
 * Ajouté le 2026-10-19 (Hugo) : la case API affichait une « occupation » de
 * 50 % qui était une **pression de latence** — un p95 entre 120 ms et 1 s. Lue
 * comme un CPU, elle trompait. Ces chiffres-ci SONT un CPU et une mémoire.
 */
export interface ContainerUsage {
  /** Temps CPU consommé / temps CPU alloué sur la fenêtre, en %. */
  readonly cpuPercent: number;
  /** Pic de mémoire de la fenêtre / mémoire allouée, en %. */
  readonly memoryPercent: number;
  /**
   * La fin de la dernière minute **remontée** (ISO) — pas l'instant de la
   * lecture. L'écart avec `generatedAt` est le délai de remontée de Cloudflare.
   */
  readonly measuredAt: string;
  /** Instances distinctes vues sur la fenêtre. */
  readonly instances: number;
  /** Le type d'instance auquel les pourcentages sont rapportés (`standard-1`). */
  readonly instanceType: string;
  /** La fenêtre lue, en minutes — la même que celle de la carte. */
  readonly windowMinutes: number;
}

/**
 * Pourquoi il n'y a **pas** de chiffre. Chacun appelle un geste différent :
 *
 * - `not-configured` : une variable manque — `detail` la nomme ;
 * - `no-samples` : Cloudflare n'a rien remonté sur la fenêtre ;
 * - `forbidden` : le jeton n'a pas le droit de lire ces métriques ;
 * - `unavailable` : Cloudflare injoignable ou réponse illisible.
 */
export type ContainerUsageGapReason = "not-configured" | "no-samples" | "forbidden" | "unavailable";

export interface ContainerUsageGap {
  readonly reason: ContainerUsageGapReason;
  /** Une phrase pour le personnel : le cas réel, et le geste de sortie. */
  readonly detail: string;
}
