import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { DeliveryRound } from "../domain/entities/delivery-round.js";
import {
  type BinLoadState,
  type LoadingBin,
  StopLoading,
} from "../domain/entities/stop-loading.js";
import { DeliveryLoadingStaleError } from "../domain/errors/delivery-loading-errors.js";
import { StopLoadingRepository } from "../domain/ports/stop-loading.repository.js";
import { partnersOf } from "./bin-partners.js";
import { loadViaOf } from "./load-via.js";

/** Les lignes de chargement d'un arrêt, telles que l'agrégat les relit. */
const LOAD_SELECT = {
  id: true,
  stopId: true,
  binId: true,
  loadedAt: true,
  loadedBy: true,
  loadedVia: true,
  createdAt: true,
} as const;

interface LoadRow {
  readonly id: string;
  readonly stopId: string;
  readonly binId: string;
  readonly loadedAt: Date | null;
  readonly loadedBy: string | null;
  readonly loadedVia: string | null;
  readonly createdAt: Date;
}

/**
 * **Adaptateur Prisma du chargement** (lot 4, L4-C18). SEUL écrivain de
 * `delivery_bin_load` (C10) : `id`, `stop_id`, `bin_id`, `service_day`,
 * `created_at` à la création, puis les trois `loaded_*` ensemble. Aucune ligne
 * n'est supprimée : décharger les remet à nul.
 *
 * ## Les verrous, et leur ordre
 *
 * Toujours la TOURNÉE d'abord, les lignes de chargement ensuite — l'ordre de
 * `saveMove` et de « Partir ». Un geste de chargement prend la tournée en
 * PARTAGE : plusieurs bacs se chargent en parallèle, mais un départ, un
 * déplacement ou un retrait (qui la prennent en exclusif) attendent la fin du
 * geste — ou le font attendre, et il relit alors ce qu'ils ont écrit.
 */
@Injectable()
export class PrismaStopLoadingRepository extends StopLoadingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forOrder(orderId: string, lockBinId?: string): Promise<StopLoading | null> {
    const live = await this.prisma.deliveryRoundStop.findFirst({
      where: { orderId, removedAt: null, closedAt: null },
      select: { id: true, roundId: true },
    });
    if (live === null) {
      await this.lockBin(lockBinId);
      return null;
    }
    await this.prisma.$queryRaw`
      SELECT "id" FROM "production"."delivery_round" WHERE "id" = ${live.roundId} FOR SHARE`;
    await this.lockBin(lockBinId);
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
        binLoads: { select: LOAD_SELECT },
      },
    });
    // Déplacé ou retiré entre la lecture et le verrou : on ne charge pas au jugé.
    if (stop.roundId !== live.roundId || stop.removedAt !== null || stop.closedAt !== null) {
      throw new DeliveryLoadingStaleError();
    }
    const bins = await this.binsOf([stop.orderId]);
    const roundOrderIds = await this.liveOrderIdsOf(stop.roundId);
    return StopLoading.restore({
      stopId: stop.id,
      roundId: stop.roundId,
      orderId: stop.orderId,
      serviceDay: stop.serviceDay,
      vehicleName: stop.round.vehicleName,
      passage: stop.round.passage,
      departedAt: stop.round.departedAt,
      roundOrderIds,
      bins: bins.get(stop.orderId) ?? [],
      loads: stop.binLoads.map(toLoadState),
    });
  }

  async forRound(round: DeliveryRound): Promise<readonly StopLoading[]> {
    const stops = round.liveStops;
    const stopIds = stops.map((stop) => stop.id);
    if (stopIds.length === 0) {
      return [];
    }
    const loads = await this.prisma.$queryRaw<LoadRow[]>`
      SELECT "id", "stop_id" AS "stopId", "bin_id" AS "binId", "loaded_at" AS "loadedAt",
             "loaded_by" AS "loadedBy", "loaded_via" AS "loadedVia", "created_at" AS "createdAt"
        FROM "production"."delivery_bin_load"
       WHERE "stop_id" = ANY(${stopIds})
       ORDER BY "id"
         FOR UPDATE`;
    const bins = await this.binsOf(stops.map((stop) => stop.orderId));
    return stops.map((stop) =>
      StopLoading.restore({
        stopId: stop.id,
        roundId: round.id,
        orderId: stop.orderId,
        serviceDay: round.serviceDay,
        vehicleName: round.vehicleName,
        passage: round.passage,
        departedAt: round.departedAt,
        roundOrderIds: stops.map((live) => live.orderId),
        bins: bins.get(stop.orderId) ?? [],
        loads: loads.filter((load) => load.stopId === stop.id).map(toLoadState),
      }),
    );
  }

  /**
   * Une ligne neuve s'insère en `ON CONFLICT DO NOTHING` sur `(stop_id,
   * bin_id)` : un double scan que le verrou n'aurait pas sérialisé devient
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
        await this.prisma.deliveryBinLoad.update({ where: { id: load.id }, data: loaded });
        continue;
      }
      const created = await this.prisma.deliveryBinLoad.createMany({
        data: [
          {
            id: load.id,
            stopId: loading.stopId,
            binId: load.binId,
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

  /** Le bac visé, en exclusif — toujours APRÈS la tournée. */
  private async lockBin(binId: string | undefined): Promise<void> {
    if (binId !== undefined) {
      await this.prisma.$queryRaw`
        SELECT "id" FROM "production"."delivery_bin" WHERE "id" = ${binId} FOR UPDATE`;
    }
  }

  /** Les commandes des arrêts vivants d'une tournée, dans l'ordre de passage. */
  private async liveOrderIdsOf(roundId: string): Promise<readonly string[]> {
    const stops = await this.prisma.deliveryRoundStop.findMany({
      where: { roundId, removedAt: null, closedAt: null },
      orderBy: { position: "asc" },
      select: { orderId: true },
    });
    return stops.map((stop) => stop.orderId);
  }

  /**
   * Les bacs de ces commandes, annulés compris, dans l'ordre de déclaration —
   * chacun avec la commande de l'autre moitié vivante de son bac physique,
   * quand elle est à une autre commande (le bac PARTAGÉ, v2-4).
   */
  private async binsOf(orderIds: readonly string[]): Promise<Map<string, LoadingBin[]>> {
    const rows = await this.prisma.deliveryBin.findMany({
      where: { orderId: { in: [...orderIds] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, orderId: true, code: true, voidedAt: true, physicalBinId: true },
    });
    const partners = await this.partnersOf(rows);
    const byOrder = new Map<string, LoadingBin[]>();
    for (const row of rows) {
      const bin = {
        id: row.id,
        code: row.code,
        voided: row.voidedAt !== null,
        partnerOrderId: partners.get(row.id) ?? null,
      };
      byOrder.set(row.orderId, [...(byOrder.get(row.orderId) ?? []), bin]);
    }
    return byOrder;
  }

  /** Bac → commande de l'autre moitié vivante, si elle est à une autre commande. */
  private async partnersOf(
    rows: readonly {
      readonly id: string;
      readonly orderId: string;
      readonly physicalBinId: string | null;
      readonly voidedAt: Date | null;
    }[],
  ): Promise<ReadonlyMap<string, string>> {
    const physical = [...new Set(rows.flatMap((row) => row.physicalBinId ?? []))];
    if (physical.length === 0) {
      return new Map();
    }
    const halves = await this.prisma.deliveryBin.findMany({
      where: { physicalBinId: { in: physical }, voidedAt: null },
      select: { id: true, orderId: true, physicalBinId: true },
    });
    return new Map([...partnersOf(rows, halves)].map(([binId, other]) => [binId, other.orderId]));
  }
}

function toLoadState(row: LoadRow): BinLoadState {
  return {
    id: row.id,
    binId: row.binId,
    loadedAt: row.loadedAt,
    loadedBy: row.loadedBy,
    loadedVia: loadViaOf(row.loadedVia),
    createdAt: row.createdAt,
  };
}
