import { Injectable, Logger } from "@nestjs/common";
import type { TrafficReport } from "@lfd/ops-contract";

import type { AnalyticsConfig } from "../../platform/config/app-config.js";
import { AppConfig } from "../../platform/config/app-config.js";
import { Clock } from "../../platform/time/clock.js";
import { TrafficUnavailableError } from "./traffic-errors.js";
import { TrafficReader } from "./traffic-reader.port.js";
import {
  rowsToSurfaces,
  rowsToWindows,
  surfacesQuery,
  trafficQuery,
  type SurfaceRow,
  type TrafficRow,
} from "./traffic-query.js";

/** L'API SQL d'Analytics Engine — un POST, la requête en texte brut. */
const SQL_ENDPOINT = (accountId: string): string =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`;

/**
 * Le vrai lecteur : il interroge Analytics Engine. **Transport et rien d'autre**
 * — la requête et la lecture des lignes sont dans `traffic-query.ts`, pures et
 * testées.
 *
 * Il ne se construit que si le compte ET le jeton sont configurés ; sinon c'est
 * le lecteur de répétition qui prend sa place (cf. `OpsModule`). Ce choix se
 * fait **une fois au démarrage**, pas à chaque requête : une bascule silencieuse
 * en cours de route rendrait les chiffres incomparables d'un appel à l'autre.
 */
@Injectable()
export class AnalyticsEngineTrafficReader extends TrafficReader {
  private readonly logger = new Logger(AnalyticsEngineTrafficReader.name);

  constructor(
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {
    super();
  }

  async read(minutes: number): Promise<TrafficReport> {
    const analytics = this.config.analyticsConfig();
    if (analytics === null) {
      // Ne devrait pas arriver : la racine ne câble ce lecteur que configuré.
      throw new TrafficUnavailableError("Analytics Engine n'est pas configuré.");
    }
    const to = new Date(this.clock.now());
    const from = new Date(to.getTime() - minutes * 60_000);

    // Deux requêtes, EN PARALLÈLE : un p95 par nœud ne se recompose pas depuis
    // les p95 de ses surfaces — un quantile ne s'additionne pas. Chacune répond
    // donc à sa question, et elles ne s'attendent pas l'une l'autre.
    const [totals, surfaces] = await Promise.all([
      this.query<TrafficRow>(analytics, trafficQuery(minutes)),
      this.query<SurfaceRow>(analytics, surfacesQuery(minutes)),
    ]);
    const bySurface = rowsToSurfaces(surfaces);

    return {
      generatedAt: to.toISOString(),
      source: "analytics-engine",
      windows: rowsToWindows(totals, {
        from: from.toISOString(),
        to: to.toISOString(),
      }).map((window) => {
        const detail = bySurface.get(window.node);
        return detail === undefined ? window : { ...window, surfaces: detail };
      }),
    };
  }

  private async query<TRow>(analytics: AnalyticsConfig, sql: string): Promise<readonly TRow[]> {
    const response = await fetch(SQL_ENDPOINT(analytics.accountId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${analytics.apiToken}`,
        "Content-Type": "text/plain",
      },
      body: sql,
    }).catch((cause: unknown) => {
      throw new TrafficUnavailableError("Analytics Engine est injoignable.", cause);
    });

    if (!response.ok) {
      // Le corps porte le message d'erreur SQL ; on le journalise pour nous et
      // on ne le renvoie pas — il nomme le dataset et le compte.
      this.logger.error(`Analytics Engine a répondu ${response.status} : ${await response.text()}`);
      throw new TrafficUnavailableError("Analytics Engine a refusé la lecture.");
    }
    const payload: unknown = await response.json();
    return readRows<TRow>(payload);
  }
}

/**
 * `FORMAT JSON` rend `{ data: [...] }`. On lit défensivement : un changement de
 * forme côté Cloudflare doit donner une fenêtre vide, pas une exception au
 * milieu d'un écran de diagnostic.
 */
function readRows<TRow>(payload: unknown): readonly TRow[] {
  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    return [];
  }
  const data: unknown = payload.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter((row: unknown): row is TRow => typeof row === "object" && row !== null);
}
