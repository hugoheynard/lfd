/**
 * **Une minute d'une instance**, telle que Cloudflare la remonte : ce que le
 * code du container a consommé, sans la micro-VM qui l'héberge
 * (`containersMetricsAdaptiveGroups`, pas `containersUsageAdaptiveGroups`).
 */
export interface ContainerSample {
  /** Début de la minute (ISO). */
  readonly minute: string;
  readonly instanceId: string;
  /** Secondes de CPU consommées pendant cette minute. */
  readonly cpuTimeSec: number;
  /** Pic de mémoire de la minute, en octets. */
  readonly maxMemoryBytes: number;
}

/**
 * Ce que le lecteur rend : des minutes, ou l'aveu qu'il n'est pas branché —
 * avec la variable à poser. Ne pas être configuré n'est pas une panne : c'est
 * un état, et il se dit sans exception.
 */
export type ContainerMetricsResult =
  | { readonly kind: "samples"; readonly samples: readonly ContainerSample[] }
  | { readonly kind: "not-configured"; readonly setting: string };

/**
 * Port **ContainerMetricsReader** — d'où OPS tire le CPU et la mémoire du
 * container de l'API. Lecture seule, une méthode.
 *
 * @throws {ContainerMetricsUnavailableError} Cloudflare injoignable, jeton
 *   refusé ou réponse illisible — la raison voyage sur l'erreur.
 */
export abstract class ContainerMetricsReader {
  abstract read(from: Date, to: Date): Promise<ContainerMetricsResult>;
}
