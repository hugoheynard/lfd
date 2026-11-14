import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { RouteTiming, RouteTimingPass, RouteTimingsReport } from "@lfd/ops-contract";

import { AppConfig } from "../../platform/config/app-config.js";
import { Stopwatch } from "../../platform/metrics/stopwatch.js";
import { Clock } from "../../platform/time/clock.js";
import { PROBE_TIMEOUT_MS } from "../probes/probe.port.js";
import { MEASURED_ROUTES, PASSES, type MeasuredRoute } from "./measured-routes.js";
import { MeasureRouteTimingsQuery } from "./measure-route-timings.query.js";
import { RouteTimingTransport, type TransportOutcome } from "./route-timing-transport.port.js";
import { parseServerTiming } from "./server-timing-header.js";

/** L'en-tête que la passerelle vérifie ; elle le retire avant de transmettre. */
export const DIAGNOSTIC_HEADER = "x-lfd-diagnostic";

/**
 * Appelle chaque route deux fois, à la suite et une à la fois : des appels
 * parallèles se disputeraient le conteneur et fausseraient ce qu'on mesure.
 *
 * Sans secret ou sans adresse, rien ne part et l'état le dit — on ne lève
 * pas : une Santé non configurée n'est pas une panne. Le secret ne sort
 * d'ici que dans l'en-tête de l'appel ; il n'est ni journalisé ni rendu.
 */
@QueryHandler(MeasureRouteTimingsQuery)
export class MeasureRouteTimingsHandler implements IQueryHandler<
  MeasureRouteTimingsQuery,
  RouteTimingsReport
> {
  constructor(
    private readonly config: AppConfig,
    private readonly transport: RouteTimingTransport,
    private readonly stopwatch: Stopwatch,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<RouteTimingsReport> {
    const generatedAt = this.clock.now().toISOString();
    const secret = this.config.diagnosticSecret();
    if (secret === null) {
      return { generatedAt, state: "secret-missing", routes: [] };
    }
    const baseUrl = this.config.diagnosticBaseUrl();
    if (baseUrl === null) {
      return { generatedAt, state: "base-url-missing", routes: [] };
    }
    const routes: RouteTiming[] = [];
    for (const route of MEASURED_ROUTES) {
      routes.push(await this.measure(route, baseUrl.replace(/\/+$/u, ""), secret));
    }
    return { generatedAt, state: "measured", routes };
  }

  private async measure(route: MeasuredRoute, base: string, secret: string): Promise<RouteTiming> {
    const passes: RouteTimingPass[] = [];
    for (const pass of PASSES) {
      const elapsed = this.stopwatch.start();
      const outcome = await this.transport.get(
        `${base}${route.path}`,
        { [DIAGNOSTIC_HEADER]: secret },
        PROBE_TIMEOUT_MS,
      );
      passes.push(toPass(pass, outcome, elapsed()));
    }
    return { key: route.key, path: route.path, passes };
  }
}

function toPass(pass: 1 | 2, outcome: TransportOutcome, elapsedMs: number): RouteTimingPass {
  const totalMs = Math.round(elapsedMs * 10) / 10;
  if (outcome.kind !== "response") {
    return { pass, status: null, totalMs, marks: [], shelfCache: null, failure: outcome.kind };
  }
  return {
    pass,
    status: outcome.status,
    totalMs,
    marks: parseServerTiming(outcome.serverTiming),
    shelfCache: outcome.shelfCache,
    failure: null,
  };
}
