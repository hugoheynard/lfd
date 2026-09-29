import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { DeliveryRound } from "../domain/entities/delivery-round.js";
import {
  type BagLoadState,
  type LoadingBag,
  StopLoading,
} from "../domain/entities/stop-loading.js";
import { DeliveryLoadingStaleError } from "../domain/errors/delivery-loading-errors.js";
import { StopLoadingRepository } from "../domain/ports/stop-loading.repository.js";
import { loadViaOf } from "./load-via.js";

/** Les lignes de chargement d'un arrêt, telles que l'agrégat les relit. */
const LOAD_SELECT = {
  id: true,
  stopId: true,
  bagId: true,
  loadedAt: true,
  loadedBy: true,
  loadedVia: true,
  createdAt: true,
} as const;

interface LoadRow {
  readonly id: string;
  readonly stopId: string;
  readonly bagId: string;
  readonly loadedAt: Date | null;
  readonly loadedBy: string | null;
  readonly loadedVia: string | null;
  readonly createdAt: Date;
}

/**
 * **Adaptateur Prisma du chargement** (lot 4, L4-C18). SEUL écrivain de
 * `delivery_bag_load` (C10) : `id`, `stop_id`, `bag_id`, `service_day`,
 * `created_at` à la création, puis les trois `loaded_*` ensemble. Aucune ligne
 * n'est supprimée : décharger les remet à nul.
 *
 * ## Les verrous, et leur ordre
 *
 * Toujours la TOURNÉE d'abord, les lignes de chargement ensuite — l'ordre de
 * `saveMove` et de « Partir ». Un geste de chargement prend la tournée en
 * PARTAGE : plusieurs sacs se chargent en parallèle, mais un départ, un
 * déplacement ou un retrait (qui la prennent en exclusif) attendent la fin du
 * geste — ou le font attendre, et il relit alors ce qu'ils ont écrit.
 */
@Injectable()
export class PrismaStopLoadingRepository extends StopLoadingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forOrder(orderId: string, lockBagId?: string): Promise<StopLoading | null> {
    const live = await this.prisma.deliveryRoundStop.findFirst({
      where: { orderId, removedAt: null, closedAt: null },
      select: { id: true, roundId: true },
    });
    if (live === null) {
      await this.lockBag(lockBagId);
      return null;
    }
    await this.prisma.$queryRaw`
      SELECT "id" FROM "production"."delivery_round" WHERE "id" = ${live.roundId} FOR SHARE`;
    await this.lockBag(lockBagId);
    const stop = await this.prisma.deliveryRoundStop.findUniqueOrThrow({
      where: { id: live.id },
      select: {
        id: true,
        roundId: true,
        orderId: true,
        serviceDay: true,
        removedAt: true,
        closedAt: true,
        round: { select: { vehicleName: true, passage: true, departedAt: true } },
        bagLoads: { select: LOAD_SELECT },
      },
    });
    // Déplacé ou retiré entre la lecture et le verrou : on ne charge pas au jugé.
    if (stop.roundId !== live.roundId || stop.removedAt !== null || stop.closedAt !== null) {
      throw new DeliveryLoadingStaleError();
    }
    const bags = await this.bagsOf([stop.orderId]);
    return StopLoading.restore({
      stopId: stop.id,
      roundId: stop.roundId,
      orderId: stop.orderId,
      serviceDay: stop.serviceDay,
      vehicleName: stop.round.vehicleName,
      passage: stop.round.passage,
      departedAt: stop.round.departedAt,
      bags: bags.get(stop.orderId) ?? [],
      loads: stop.bagLoads.map(toLoadState),
    });
  }

  async forRound(round: DeliveryRound): Promise<readonly StopLoading[]> {
    const stops = round.liveStops;
    const stopIds = stops.map((stop) => stop.id);
    if (stopIds.length === 0) {
      return [];
    }
    const loads = await this.prisma.$queryRaw<LoadRow[]>`
      SELECT "id", "stop_id" AS "stopId", "bag_id" AS "bagId", "loaded_at" AS "loadedAt",
             "loaded_by" AS "loadedBy", "loaded_via" AS "loadedVia", "created_at" AS "createdAt"
        FROM "production"."delivery_bag_load"
       WHERE "stop_id" = ANY(${stopIds})
       ORDER BY "id"
         FOR UPDATE`;
    const bags = await this.bagsOf(stops.map((stop) => stop.orderId));
    return stops.map((stop) =>
      StopLoading.restore({
        stopId: stop.id,
        roundId: round.id,
        orderId: stop.orderId,
        serviceDay: round.serviceDay,
        vehicleName: round.vehicleName,
        passage: round.passage,
        departedAt: round.departedAt,
        bags: bags.get(stop.orderId) ?? [],
        loads: loads.filter((load) => load.stopId === stop.id).map(toLoadState),
      }),
    );
  }

  /**
   * Une ligne neuve s'insère en `ON CONFLICT DO NOTHING` sur `(stop_id,
   * bag_id)` : un double scan que le verrou n'aurait pas sérialisé devient
   * l'idempotence promise, jamais une violation d'unicité (500).
   */
  async save(loading: StopLoading): Promise<boolean> {
    let written = true;
    for (const load of loading.changedLoads()) {
      const loaded = {
        loadedAt: load.loadedAt,
        loadedBy: load.loadedBy,
        loadedVia: load.loadedVia,
      };
      if (loading.isPersisted(load.id)) {
        await this.prisma.deliveryBagLoad.update({ where: { id: load.id }, data: loaded });
        continue;
      }
      const created = await this.prisma.deliveryBagLoad.createMany({
        data: [
          {
            id: load.id,
            stopId: loading.stopId,
            bagId: load.bagId,
            serviceDay: loading.serviceDay,
            createdAt: load.createdAt,
            ...loaded,
          },
        ],
        skipDuplicates: true,
      });
      written = written && created.count > 0;
    }
    return written;
  }

  /** Le sac visé, en exclusif — toujours APRÈS la tournée. */
  private async lockBag(bagId: string | undefined): Promise<void> {
    if (bagId !== undefined) {
      await this.prisma.$queryRaw`
        SELECT "id" FROM "production"."delivery_bag" WHERE "id" = ${bagId} FOR UPDATE`;
    }
  }

  /** Les sacs de ces commandes, annulés compris, dans l'ordre de déclaration. */
  private async bagsOf(orderIds: readonly string[]): Promise<Map<string, LoadingBag[]>> {
    const rows = await this.prisma.deliveryBag.findMany({
      where: { orderId: { in: [...orderIds] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, orderId: true, code: true, voidedAt: true },
    });
    const byOrder = new Map<string, LoadingBag[]>();
    for (const row of rows) {
      const bag = { id: row.id, code: row.code, voided: row.voidedAt !== null };
      byOrder.set(row.orderId, [...(byOrder.get(row.orderId) ?? []), bag]);
    }
    return byOrder;
  }
}

function toLoadState(row: LoadRow): BagLoadState {
  return {
    id: row.id,
    bagId: row.bagId,
    loadedAt: row.loadedAt,
    loadedBy: row.loadedBy,
    loadedVia: loadViaOf(row.loadedVia),
    createdAt: row.createdAt,
  };
}
