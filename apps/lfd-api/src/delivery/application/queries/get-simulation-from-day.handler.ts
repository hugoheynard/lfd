import {
  type DeliverySimulationFromDayView,
  type DeliverySimulationPayload,
  SIMULATION_MAX_STOP_MINUTES,
  SIMULATION_MIN_STOP_MINUTES,
} from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import {
  type DeliveryOrderFacts,
  DeliveryOrdersReader,
  type DeliveryStopPoint,
} from "../../channels/commerce/index.js";
import { activeOnDay } from "../../domain/entities/vehicle.js";
import { FleetReader } from "../../domain/ports/fleet.reader.js";
import { GeocodeCacheReader } from "../../domain/ports/geocode-cache.reader.js";
import { RoutingSettingsReader } from "../../domain/ports/routing-settings.reader.js";
import type { GeoPoint } from "../../domain/value-objects/geo-point.js";
import { locateFromCache, routingSettingsOf } from "../delivery-routing-support.js";
import { GetSimulationFromDayQuery } from "./get-simulation-from-day.query.js";

/** La borne du libellé d'un arrêt inventé (`simulatedStopSchema`). */
const STOP_LABEL_MAX = 80;
/** Préfixe des identifiants d'arrêt : locaux à l'écran, jamais celui d'une commande. */
const STOP_ID_PREFIX = "j";

type SimulatedStop = DeliverySimulationPayload["stops"][number];

/**
 * **Partir d'une vraie journée** (L9-C8) — les livraisons non annulées du jour
 * qui ont un point, COPIÉES en arrêts inventés : libellé de l'adresse livrée
 * (sinon le client), point (celui du carnet, sinon le cache du géocodage —
 * comme « Proposer », sans sortir sur le réseau), créneau convenu, temps sur
 * place de l'adresse. Les véhicules actifs ce jour-là par leur nom, les
 * réglages en vigueur, le départ réglé (`null`).
 *
 * **Aucun identifiant de commande** ne sort : rien ne peut écrire dans la
 * vraie composition. Les livraisons sans point sont listées, non chargées.
 * Les bornes du simulateur (60 arrêts, 10 véhicules) ne sont pas appliquées
 * ici : on ne choisit pas à la place de l'équipe quels arrêts écarter —
 * « Proposer » refusera en le disant.
 */
@QueryHandler(GetSimulationFromDayQuery)
export class GetSimulationFromDayHandler implements IQueryHandler<
  GetSimulationFromDayQuery,
  DeliverySimulationFromDayView
> {
  constructor(
    private readonly orders: DeliveryOrdersReader,
    private readonly fleet: FleetReader,
    private readonly settings: RoutingSettingsReader,
    private readonly cache: GeocodeCacheReader,
    private readonly clock: Clock,
  ) {}

  async execute({ day }: GetSimulationFromDayQuery): Promise<DeliverySimulationFromDayView> {
    const expected = await this.orders.expectedOn(day);
    const ids = expected.filter((order) => order.status === "active").map((o) => o.orderId);
    const [points, facts] = await Promise.all([
      this.orders.stopPointsOf(ids),
      this.orders.byIds(ids),
    ]);
    const located = await locateFromCache(points, this.cache, this.clock.now());
    const pointOf = new Map(located.map((stop) => [stop.orderId, stop.point]));
    const labelOf = labelsOf(points, facts);
    const stops: SimulatedStop[] = [];
    const withoutPoint: { reference: string; label: string }[] = [];
    for (const point of points) {
      const gps = pointOf.get(point.orderId) ?? null;
      const label = labelOf.get(point.orderId) ?? point.reference;
      if (gps === null) {
        withoutPoint.push({ reference: point.reference, label });
      } else {
        stops.push(
          simulatedStopOf(`${STOP_ID_PREFIX}${String(stops.length + 1)}`, label, gps, point),
        );
      }
    }
    const { settings } = await routingSettingsOf(this.settings);
    const vehicles = (await this.fleet.list())
      .filter((v) => activeOnDay(v.retiredAt === null ? null : new Date(v.retiredAt), day))
      .map((v) => v.name);
    return {
      day,
      scenario: { stops, vehicles, settings: settings.values(), departure: null },
      withoutPoint,
    };
  }
}

/** Le libellé : celui de l'adresse livrée, sinon le client, rogné à la borne du simulateur. */
function labelsOf(
  points: readonly DeliveryStopPoint[],
  facts: readonly DeliveryOrderFacts[],
): ReadonlyMap<string, string> {
  const customers = new Map(facts.map((fact) => [fact.orderId, fact.customerLabel.trim()]));
  return new Map(
    points.map((point) => {
      const address = point.address?.label.trim() ?? "";
      const customer = customers.get(point.orderId) ?? "";
      const label = address !== "" ? address : customer !== "" ? customer : point.reference;
      return [point.orderId, label.slice(0, STOP_LABEL_MAX)];
    }),
  );
}

function simulatedStopOf(
  id: string,
  label: string,
  gps: GeoPoint,
  point: DeliveryStopPoint,
): SimulatedStop {
  const stop: SimulatedStop = {
    id,
    label,
    gps: { lat: gps.lat, lng: gps.lng },
    window: point.window,
  };
  const minutes = point.stopMinutes;
  return minutes !== null &&
    minutes >= SIMULATION_MIN_STOP_MINUTES &&
    minutes <= SIMULATION_MAX_STOP_MINUTES
    ? { ...stop, stopMinutes: minutes }
    : stop;
}
