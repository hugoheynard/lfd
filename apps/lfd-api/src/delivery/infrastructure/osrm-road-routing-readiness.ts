import { RoadRoutingReadiness } from "../domain/ports/road-routing-readiness.js";
import type { RoutePlannerEndpoint } from "../../platform/config/route-planner-endpoint.js";
import { assertOutsideTransaction } from "../../platform/database/outside-transaction.js";
import type { FetchFn } from "./ban-geocoder.js";
import { withBearer } from "./osrm-fetch.js";
import { WAKE_POINT } from "./osrm-road-routing-waker.js";

/**
 * Le délai d'un sondage : Tour manager redemande toutes les ~3 s, une réponse
 * plus lente que ça vaut « pas encore prêt » plutôt qu'une file d'appels.
 */
export const READINESS_PROBE_TIMEOUT_MS = 2_500;

/**
 * **Un sondage par le `/route` minimal du réveil** — un seul essai, sans le
 * budget de réveil ni nouvel essai (`osrmGet` attendrait jusqu'à 90 s).
 *
 * `true` seulement sur un `200` qui dit `{ code: "Ok" }`. Délai dépassé,
 * `503` du réveil, coupure ou corps illisible : `false`, sans journal — c'est
 * un sondage, son « non » est l'état attendu pendant le chargement.
 */
export class OsrmRoadRoutingReadiness extends RoadRoutingReadiness {
  private readonly url: string;
  private readonly fetchFn: FetchFn;

  constructor(
    endpoint: RoutePlannerEndpoint,
    fetchFn: FetchFn = (url, init) => fetch(url, init),
    private readonly timeoutMs: number = READINESS_PROBE_TIMEOUT_MS,
  ) {
    super();
    this.url = `${endpoint.url.replace(/\/+$/u, "")}/route/v1/driving/${WAKE_POINT};${WAKE_POINT}?overview=false`;
    this.fetchFn = withBearer(fetchFn, endpoint.token);
  }

  async isReady(): Promise<boolean> {
    assertOutsideTransaction("OSRM.readiness");
    try {
      const response = await this.fetchFn(this.url, {
        method: "GET",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status !== 200) {
        return false;
      }
      return saysOk(await response.json());
    } catch {
      return false;
    }
  }
}

function saysOk(body: unknown): boolean {
  return typeof body === "object" && body !== null && "code" in body && body.code === "Ok";
}
