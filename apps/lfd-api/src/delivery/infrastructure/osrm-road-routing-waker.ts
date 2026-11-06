import { Logger } from "@nestjs/common";

import { RoadRoutingWaker } from "../domain/ports/road-routing-waker.js";
import type { RoutePlannerEndpoint } from "../../platform/config/route-planner-endpoint.js";
import type { FetchFn } from "./ban-geocoder.js";
import { type OsrmWakePacing, osrmGet, withBearer } from "./osrm-fetch.js";
import { OSRM_ROUTE_TIMEOUT_MS } from "./osrm-route-geometry.js";
import { assertOutsideTransaction } from "../../platform/database/outside-transaction.js";

/**
 * Le point du réveil, `longitude,latitude` : Chambéry, au cœur de la carte de
 * Savoie. Un trajet de ce point à lui-même ne coûte rien à OSRM, mais oblige
 * l'instance à démarrer et à charger son graphe.
 */
export const WAKE_POINT = "5.9178,45.5646";

/**
 * **Le réveil par un `/route` minimal** — l'un des deux chemins que
 * `lfd-route-planner` admet (`apps/lfd-route-planner/src/osrm-request.ts`,
 * `/table/` et `/route/`), derrière le jeton de la passerelle comme les autres.
 *
 * Il attend le réveil comme « Proposer » ({@link osrmGet}, budget de réveil) :
 * c'est ce qui le tient jusqu'au bout du chargement de la carte. L'issue se
 * note au journal, jamais en erreur.
 */
export class OsrmRoadRoutingWaker extends RoadRoutingWaker {
  private readonly logger = new Logger("Réveil du calcul routier");
  private readonly url: string;
  private readonly fetchFn: FetchFn;

  constructor(
    endpoint: RoutePlannerEndpoint,
    private readonly pacing: OsrmWakePacing,
    fetchFn: FetchFn = (url, init) => fetch(url, init),
    private readonly timeoutMs: number = OSRM_ROUTE_TIMEOUT_MS,
  ) {
    super();
    this.url = `${endpoint.url.replace(/\/+$/u, "")}/route/v1/driving/${WAKE_POINT};${WAKE_POINT}?overview=false`;
    this.fetchFn = withBearer(fetchFn, endpoint.token);
  }

  async wake(): Promise<void> {
    assertOutsideTransaction("OSRM.wake");
    const outcome = await osrmGet(this.fetchFn, this.url, this.timeoutMs, this.pacing, isOk);
    if ("failure" in outcome) {
      this.logger.warn(`Le calcul routier ne s'est pas réveillé (${outcome.failure}).`);
    }
  }
}

/** `{ code: "Ok" }` : OSRM a répondu, la carte est chargée. */
function isOk(body: unknown): true | null {
  return typeof body === "object" && body !== null && "code" in body && body.code === "Ok"
    ? true
    : null;
}
