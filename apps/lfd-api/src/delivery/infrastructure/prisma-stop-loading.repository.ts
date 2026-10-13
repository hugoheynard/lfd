import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { DeliveryRound } from "../domain/entities/delivery-round.js";
import { type BinLoadState, StopLoading } from "../domain/entities/stop-loading.js";
import { DeliveryLoadingStaleError } from "../domain/errors/delivery-loading-errors.js";
import { StopLoadingRepository } from "../domain/ports/stop-loading.repository.js";
import { orderIdOf, type StopSubject } from "../domain/entities/delivery-round-state.js";
import { stopSubjectOf } from "./delivery-round.writes.js";
import { orderStopsOnly } from "./order-stop.js";
import { loadViaOf } from "./load-via.js";
import {
  binsOfSubject,
  loadingBinsBySubject,
  subjectKey,
  transferIdsOf,
} from "./stop-loading-bins.js";

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
    return this.forLiveStop(await this.liveStopOf(orderId), lockBinId);
  }

  async forTransfer(transferId: string, lockBinId?: string): Promise<StopLoading | null> {
    const live = await this.prisma.deliveryRoundStop.findFirst({
      where: { transferId, removedAt: null, closedAt: null },
      select: { id: true, roundId: true },
    });
    return this.forLiveStop(live, lockBinId);
  }

  private async forLiveStop(
    live: { readonly id: string; readonly roundId: string } | null,
    lockBinId: string | undefined,
  ): Promise<StopLoading | null> {
    if (live === null) {
      await this.lockBin(lockBinId);
      return null;
    }
    await this.prisma.$queryRaw`
      SELECT "id" FROM "delivery"."delivery_round" WHERE "id" = ${live.roundId} FOR SHARE`;
    await this.lockBin(lockBinId);
    const stop = await this.prisma.deliveryRoundStop.findUniqueOrThrow({
      where: { id: live.id },
      select: {
        id: true,
        roundId: true,
        kind: true,
        orderId: true,
        transferId: true,
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
    const subject = stopSubjectOf(stop);
    const carried = await this.carriedOrders([subject]);
    const bins = await loadingBinsBySubject(
      this.prisma,
      [...carried.values()].flat(),
      transferIdsOf([subject]),
    );
    const roundOrderIds = await this.liveOrderIdsOf(stop.roundId);
    return StopLoading.restore({
      stopId: stop.id,
      roundId: stop.roundId,
      subject,
      serviceDay: stop.serviceDay,
      vehicleName: stop.round.vehicleName,
      passage: stop.round.passage,
      departedAt: stop.round.departedAt,
      roundOrderIds,
      bins: binsOfSubject(subject, carried, bins),
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
        FROM "delivery"."delivery_bin_load"
       WHERE "stop_id" = ANY(${stopIds})
       ORDER BY "id"
         FOR UPDATE`;
    const carried = await this.carriedOrders(stops);
    const bins = await loadingBinsBySubject(
      this.prisma,
      [...carried.values()].flat(),
      transferIdsOf(stops),
    );
    return stops.map((stop) =>
      StopLoading.restore({
        stopId: stop.id,
        roundId: round.id,
        subject: stop,
        serviceDay: round.serviceDay,
        vehicleName: round.vehicleName,
        passage: round.passage,
        departedAt: round.departedAt,
        roundOrderIds: round.liveStops.map(orderIdOf),
        bins: binsOfSubject(stop, carried, bins),
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
        SELECT "id" FROM "delivery"."delivery_bin" WHERE "id" = ${binId} FOR UPDATE`;
    }
  }

  /**
   * Les commandes des arrêts vivants d'une tournée, dans l'ordre de passage ;
   * `null` au rang d'un arrêt de transfert (il sépare ses voisins).
   */
  private async liveOrderIdsOf(roundId: string): Promise<readonly (string | null)[]> {
    const stops = await this.prisma.deliveryRoundStop.findMany({
      where: { roundId, removedAt: null, closedAt: null },
      orderBy: { position: "asc" },
      select: { orderId: true },
    });
    return stops.map((stop) => stop.orderId);
  }

  /**
   * L'arrêt vivant qui emporte cette commande : le sien, ou — pour un retrait
   * d'un site servi par transfert — celui de son transfert interne (plan du
   * transfert interne, §5 : `delivery` résout commande → transfert → arrêt ;
   * le canal du colisage reste indexé par commande).
   */
  private async liveStopOf(
    orderId: string,
  ): Promise<{ readonly id: string; readonly roundId: string } | null> {
    const own = await this.prisma.deliveryRoundStop.findFirst({
      where: { orderId, removedAt: null, closedAt: null },
      select: { id: true, roundId: true },
    });
    if (own !== null) {
      return own;
    }
    const item = await this.prisma.deliveryInternalTransferItem.findFirst({
      where: { kind: "order", orderId },
      select: { transferId: true },
    });
    return item === null
      ? null
      : this.prisma.deliveryRoundStop.findFirst({
          where: { transferId: item.transferId, removedAt: null, closedAt: null },
          select: { id: true, roundId: true },
        });
  }

  /** Les commandes que chaque arrêt emporte, par sujet : la sienne, ou celles de son transfert. */
  private async carriedOrders(
    subjects: readonly StopSubject[],
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    const transferIds = transferIdsOf(subjects);
    const items =
      transferIds.length === 0
        ? []
        : await this.prisma.deliveryInternalTransferItem.findMany({
            where: { transferId: { in: [...transferIds] }, kind: "order" },
            orderBy: [{ attachedAt: "asc" }, { id: "asc" }],
            select: { transferId: true, orderId: true },
          });
    return new Map(
      subjects.map((subject) =>
        subject.kind === "order"
          ? [subjectKey(subject), [subject.orderId]]
          : [
              subjectKey(subject),
              orderStopsOnly(items.filter((item) => item.transferId === subject.transferId)).map(
                (item) => item.orderId,
              ),
            ],
      ),
    );
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
