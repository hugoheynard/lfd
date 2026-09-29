import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../platform/database/client/client.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import type { AppError } from "../../platform/shared/errors/app-error.js";
import { DeliveryRound, type DeliveryStopState } from "../domain/entities/delivery-round.js";
import { LoadedStopMoveError } from "../domain/errors/delivery-loading-errors.js";
import {
  DeliveryRoundStaleError,
  type LiveStopHolder,
  OrderAlreadyInRoundError,
} from "../domain/errors/delivery-round-errors.js";
import { DeliveryRoundRepository } from "../domain/ports/delivery-round.repository.js";

/** Code Prisma d'une violation d'unicité : l'index I3, ou `(jour, véhicule, passage)`. */
const UNIQUE_VIOLATION = "P2002";

type Tx = Prisma.TransactionClient;

/** Un arrêt vivant : ni retiré, ni clos — la définition de l'index I3 (C12). */
const LIVE_STOP = { removedAt: null, closedAt: null } as const;

/**
 * **Adaptateur Prisma de la composition.** `toDomain` par
 * `DeliveryRound.restore`, `toPersistence` par `toSnapshot`.
 *
 * ## Les colonnes qu'il écrit (C10)
 *
 * La tournée est le SEUL écrivain de `delivery_round_stop` : `round_id`,
 * `position`, `removed_at`, `closed_at`, et `order_id`, `service_day`,
 * `created_at` à la création. Aucune ligne n'est supprimée.
 *
 * Sur `delivery_round`, il écrit aussi `departed_at` (lot 4, « Partir ») —
 * écrivain : la tournée. Il LIT et VERROUILLE `delivery_bag_load` (`saveMove`),
 * sans jamais l'écrire : l'écrivain en est l'exécution.
 *
 * `closed_at` — écrivain : la tournée ; posé au lot 6 par `closeStop`, quand
 * l'exécution rapporte livré ou raté. Rien ne le pose à ce lot, mais il est
 * RELU et RÉÉCRIT tel quel : l'ignorer à l'écriture le ferait écraser par le
 * premier `save` venu le jour où il sera posé.
 *
 * ## La version
 *
 * Une tournée ouverte est créée à sa version 1. Une tournée changée n'est
 * écrite que si la base porte encore la version lue (`updateMany … WHERE
 * version = lue`) : zéro ligne touchée = quelqu'un a écrit entre-temps.
 */
@Injectable()
export class PrismaDeliveryRoundRepository extends DeliveryRoundRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<DeliveryRound | null> {
    const row = await this.prisma.deliveryRound.findUnique({
      where: { id },
      include: { stops: { where: { removedAt: null }, orderBy: { position: "asc" } } },
    });
    if (row === null) {
      return null;
    }
    return DeliveryRound.restore({
      ...row,
      stops: row.stops.map((stop) => ({
        id: stop.id,
        orderId: stop.orderId,
        position: stop.position,
        closedAt: stop.closedAt,
      })),
    });
  }

  /**
   * `SELECT … FOR UPDATE`, puis la lecture ordinaire. Appelé DANS l'unité de
   * travail du départ : hors transaction, le verrou tomberait aussitôt.
   */
  async loadForDeparture(id: string): Promise<DeliveryRound | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "production"."delivery_round" WHERE "id" = ${id} FOR UPDATE`;
    return this.load(id);
  }

  async save(round: DeliveryRound): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.writeRound(tx, round);
      await this.writeStops(tx, round);
    });
  }

  /**
   * Verrouille les deux tournées dans l'ORDRE DE LEUR IDENTIFIANT (C13) : deux
   * déplacements croisés, A → B et B → A, prennent les verrous dans le même
   * ordre et ne s'interbloquent pas. Puis chaque version est vérifiée, et les
   * deux tournées s'écrivent dans la même transaction.
   *
   * Puis, APRÈS les tournées, les lignes de chargement de leurs arrêts, dans
   * l'ordre de leur identifiant (lot 4, L4-C18) : un sac chargé dans l'arrêt
   * déplacé entre la lecture du handler et ce verrou refuse le déplacement
   * (L4-C5). Un chargement verrouille la tournée en partage : s'il est passé
   * avant, on le voit ici ; s'il vient après, il attend.
   */
  async saveMove(from: DeliveryRound, to: DeliveryRound, stopId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const ids = [from.id, to.id].sort();
      await tx.$queryRaw`
        SELECT "id" FROM "production"."delivery_round"
         WHERE "id" IN (${ids[0]}, ${ids[1]})
         ORDER BY "id"
           FOR UPDATE`;
      await ensureStopNotLoaded(tx, [from, to], stopId, from.vehicleName);
      await this.writeRound(tx, from);
      await this.writeRound(tx, to);
      // La tournée quittée d'abord : ses positions se resserrent avant que
      // l'arrêt ne rejoigne l'autre.
      await this.writeStops(tx, from);
      await this.writeStops(tx, to);
    });
  }

  async nextPassage(serviceDay: string, vehicleId: string): Promise<number> {
    const found = await this.prisma.deliveryRound.aggregate({
      where: { serviceDay, vehicleId },
      _max: { passage: true },
    });
    return (found._max.passage ?? 0) + 1;
  }

  async liveHolderOf(orderId: string): Promise<LiveStopHolder | null> {
    const stop = await this.prisma.deliveryRoundStop.findFirst({
      where: { orderId, ...LIVE_STOP },
      select: { round: { select: { vehicleName: true, serviceDay: true, passage: true } } },
    });
    return stop?.round ?? null;
  }

  /** @throws {DeliveryRoundStaleError} @throws {OrderAlreadyInRoundError} */
  private async writeRound(tx: Tx, round: DeliveryRound): Promise<void> {
    const snapshot = round.toSnapshot();
    if (round.loadedVersion === null) {
      // Une autre ouverture vient de prendre ce passage : on relit.
      await guard(
        () => new DeliveryRoundStaleError(snapshot.vehicleName),
        () =>
          tx.deliveryRound.create({
            data: {
              id: snapshot.id,
              serviceDay: snapshot.serviceDay,
              vehicleId: snapshot.vehicleId,
              vehicleName: snapshot.vehicleName,
              passage: snapshot.passage,
              version: snapshot.version,
              departedAt: snapshot.departedAt,
              createdAt: snapshot.createdAt,
              updatedAt: snapshot.updatedAt,
            },
          }),
      );
      return;
    }
    const written = await tx.deliveryRound.updateMany({
      where: { id: snapshot.id, version: round.loadedVersion },
      data: {
        version: snapshot.version,
        departedAt: snapshot.departedAt,
        updatedAt: snapshot.updatedAt,
      },
    });
    if (written.count === 0) {
      throw new DeliveryRoundStaleError(snapshot.vehicleName);
    }
  }

  private async writeStops(tx: Tx, round: DeliveryRound): Promise<void> {
    const snapshot = round.toSnapshot();
    const rows: readonly (DeliveryStopState & { readonly removedAt: Date | null })[] = [
      ...snapshot.stops.map((stop) => ({ ...stop, removedAt: null })),
      ...snapshot.removedStops,
    ];
    for (const stop of rows) {
      // L'index I3 a vu une course que la lecture préalable n'a pas vue.
      await guard(
        () => new OrderAlreadyInRoundError(null, null),
        () =>
          tx.deliveryRoundStop.upsert({
            where: { id: stop.id },
            create: {
              id: stop.id,
              roundId: snapshot.id,
              orderId: stop.orderId,
              serviceDay: snapshot.serviceDay,
              position: stop.position,
              removedAt: stop.removedAt,
              closedAt: stop.closedAt,
              createdAt: snapshot.updatedAt,
            },
            update: {
              roundId: snapshot.id,
              position: stop.position,
              removedAt: stop.removedAt,
              closedAt: stop.closedAt,
            },
          }),
      );
    }
  }
}

/**
 * Verrouille les lignes de chargement des arrêts des tournées, dans l'ordre de
 * leur identifiant, et refuse si l'arrêt déplacé porte un sac chargé.
 * @throws {LoadedStopMoveError}
 */
async function ensureStopNotLoaded(
  tx: Tx,
  rounds: readonly DeliveryRound[],
  stopId: string,
  vehicleName: string,
): Promise<void> {
  const stopIds = rounds.flatMap((round) => round.toSnapshot().stops.map((stop) => stop.id));
  const loads = await tx.$queryRaw<{ stop_id: string; loaded: boolean }[]>`
    SELECT "stop_id", "loaded_at" IS NOT NULL AS "loaded"
      FROM "production"."delivery_bag_load"
     WHERE "stop_id" = ANY(${stopIds})
     ORDER BY "id"
       FOR UPDATE`;
  if (loads.some((load) => load.stop_id === stopId && load.loaded)) {
    throw new LoadedStopMoveError(vehicleName);
  }
}

/**
 * Traduit une violation d'unicité en le refus que l'appelant nomme. La
 * transaction est perdue : on ne peut plus rien relire pour préciser.
 */
async function guard(conflict: () => AppError, write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch (error: unknown) {
    if (error instanceof Error && Reflect.get(error, "code") === UNIQUE_VIOLATION) {
      throw conflict();
    }
    throw error;
  }
}
