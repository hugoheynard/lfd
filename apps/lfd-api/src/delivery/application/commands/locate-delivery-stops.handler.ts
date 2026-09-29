import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader, type DeliveryStopPoint } from "../../channels/commerce/index.js";
import { DeliveryRoundsReader } from "../../domain/ports/delivery-rounds.reader.js";
import { GeocodeCacheReader } from "../../domain/ports/geocode-cache.reader.js";
import { GeocodeCacheRepository } from "../../domain/ports/geocode-cache.repository.js";
import { Geocoder, type GeocodeRequest } from "../../domain/ports/geocoder.js";
import { addressKeyOf } from "../../domain/services/address-key.js";
import { geocodeFreshSince } from "../delivery-routing-support.js";
import { LocateDeliveryStopsCommand } from "./locate-delivery-stops.command.js";

/**
 * Au plus tant d'adresses par geste : un lot de la BAN reste court, et la
 * suite se situe en relançant. Le nombre de livraisons d'un jour est très en
 * dessous (vérifié le 2026-09-29 : quelques dizaines).
 */
export const MAX_GEOCODED_PER_GESTURE = 200;

/**
 * **Situer les arrêts d'un jour** (L7-C9) — un GESTE, pas une lecture : il
 * sort sur le réseau et remplit le cache.
 *
 * Les livraisons du jour — à répartir comme déjà composées — dont la commande
 * n'a pas de point GPS au carnet, dont l'adresse livrée n'est pas déjà dans le
 * cache frais, sont envoyées à la Base Adresse Nationale en UN lot, plafonné.
 * L'appel réseau se fait HORS transaction ; seule l'écriture du cache est
 * dans l'unité de travail. BAN indisponible : refus nommé, rien d'écrit.
 *
 * @sans-journal il ne remplit qu'un CACHE technique (une empreinte d'adresse →
 * un point), sans rien décider : aucune tournée, aucune commande ne change. Le
 * journaliser y écrirait de quoi reconstituer les adresses, ce que le cache
 * évite justement de garder (L7-C10).
 *
 * @throws {GeocoderDisabledError} @throws {GeocoderUnavailableError}
 */
@CommandHandler(LocateDeliveryStopsCommand)
export class LocateDeliveryStopsHandler implements ICommandHandler<
  LocateDeliveryStopsCommand,
  void
> {
  constructor(
    private readonly orders: DeliveryOrdersReader,
    private readonly rounds: DeliveryRoundsReader,
    private readonly cache: GeocodeCacheReader,
    private readonly cacheWriter: GeocodeCacheRepository,
    private readonly geocoder: Geocoder,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: LocateDeliveryStopsCommand): Promise<void> {
    const now = this.clock.now();
    const points = await this.orders.stopPointsOf(await this.ordersOf(command.day));
    const requests = requestsOf(points);
    const cached = await this.cache.find(
      requests.map((request) => request.key),
      geocodeFreshSince(now),
    );
    const missing = requests
      .filter((request) => !cached.has(request.key))
      .slice(0, MAX_GEOCODED_PER_GESTURE);
    if (missing.length === 0) {
      return;
    }
    const answers = await this.geocoder.geocode(missing);
    await this.uow.run(() => this.cacheWriter.put(answers, now));
  }

  /** Les commandes à livrer ce jour : attendues non annulées, et celles déjà dans une tournée du jour. */
  private async ordersOf(day: string): Promise<readonly string[]> {
    const [expected, rounds] = await Promise.all([
      this.orders.expectedOn(day),
      this.rounds.roundsOn(day),
    ]);
    const ids = [
      ...expected.filter((order) => order.status === "active").map((order) => order.orderId),
      ...rounds.flatMap((round) => round.stops.map((stop) => stop.orderId)),
    ];
    return [...new Set(ids)];
  }
}

/** Une demande par adresse distincte sans point GPS au carnet, dans l'ordre des clés. */
function requestsOf(points: readonly DeliveryStopPoint[]): readonly GeocodeRequest[] {
  const byKey = new Map<string, GeocodeRequest>();
  for (const point of points) {
    if (point.gps !== null || point.address === null) {
      continue;
    }
    const key = addressKeyOf(point.address);
    byKey.set(key, {
      key,
      street: point.address.ligne1,
      postalCode: point.address.codePostal,
      city: point.address.ville,
    });
  }
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
