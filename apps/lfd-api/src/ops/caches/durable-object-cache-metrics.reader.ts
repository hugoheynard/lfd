import { Logger } from "@nestjs/common";

import { assertOutsideTransaction } from "../../platform/database/outside-transaction.js";
import { sharedCacheMetricsReplyOf } from "./shared-cache-metrics-reply.js";
import {
  SharedCacheMetricsReader,
  type SharedObjectReading,
} from "./shared-cache-metrics.reader.js";

/** Ce que l'adaptateur appelle — `fetch`, ou une réponse fabriquée en test. */
export type CacheMetricsFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Le filet du socket : une page de diagnostic n'attend pas un objet muet. */
const METRICS_TIMEOUT_MS = 2000;

/** Le chemin des compteurs dans les deux objets (`container/cache-metrics-store.ts`). */
const METRICS_PATH = "/metrics";

/** Un objet suivi, et l'adresse que le Worker pose pour lui (`null` hors du conteneur). */
export interface SharedObjectAddress {
  readonly object: string;
  readonly origin: string | null;
}

/**
 * **Les compteurs des objets partagés, lus par leur route interne**
 * (`GET /metrics?since=`) — le chemin que l'API emprunte déjà vers eux,
 * intercepté par le Worker. Sans adresse (dev hors wrangler, e2e), l'objet
 * est `not-configured` ; une panne, `unreachable`, et journalisée.
 *
 * Construit par une fabrique (`ops.module.ts`) : le `fetch` est un paramètre.
 */
export class DurableObjectCacheMetricsReader extends SharedCacheMetricsReader {
  private readonly logger = new Logger(DurableObjectCacheMetricsReader.name);

  constructor(
    private readonly objects: readonly SharedObjectAddress[],
    private readonly fetchFn: CacheMetricsFetch = (url, init) => fetch(url, init),
  ) {
    super();
  }

  read(sinceMs: number): Promise<readonly SharedObjectReading[]> {
    return Promise.all(
      this.objects.map(({ object, origin }) => this.readObject(object, origin, sinceMs)),
    );
  }

  private async readObject(
    object: string,
    origin: string | null,
    sinceMs: number,
  ): Promise<SharedObjectReading> {
    if (origin === null) {
      return { object, state: "not-configured", hours: [], peaks: [] };
    }
    assertOutsideTransaction("objets-partages.metrics");
    try {
      const url = `${origin.replace(/\/+$/u, "")}${METRICS_PATH}?since=${String(sinceMs)}`;
      const response = await this.fetchFn(url, {
        method: "GET",
        signal: AbortSignal.timeout(METRICS_TIMEOUT_MS),
      });
      const reply = response.ok ? sharedCacheMetricsReplyOf(await response.json()) : null;
      if (reply === null) {
        this.logger.warn(`Compteurs de l'objet ${object} illisibles (statut ${response.status})`);
        return { object, state: "unreachable", hours: [], peaks: [] };
      }
      return { object, state: "read", hours: reply.hours, peaks: reply.peaks };
    } catch (error) {
      this.logger.warn(`Compteurs de l'objet ${object} injoignables`, error);
      return { object, state: "unreachable", hours: [], peaks: [] };
    }
  }
}
