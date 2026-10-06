import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DeliveryRound } from "../domain/entities/delivery-round.js";
import { LoadedStopMoveError } from "../domain/errors/delivery-loading-errors.js";
import {
  DeliveryRoundStaleError,
  type LiveStopHolder,
} from "../domain/errors/delivery-round-errors.js";
import { DeliveryRoundRepository } from "../domain/ports/delivery-round.repository.js";
import { PlannedTiming } from "../domain/value-objects/planned-timing.js";
import { LIVE_STOP, type Tx, writeRound, writeStops } from "./delivery-round.writes.js";

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
 * Sur `delivery_round`, il écrit aussi `departed_at` (lot 4, « Partir ») et
 * `driver_staff_id` (plan « Ma tournée », MT-D2), `returned_*` (« Tournée
 * terminée », PL2) et `planned_*` (l'horaire prévu, I10) — écrivain : la tournée. Il LIT et VERROUILLE `delivery_bin_load` (`saveMove`),
 * sans jamais l'écrire : l'écrivain en est l'exécution.
 *
 * `closed_at` — écrivain : la tournée, par `closeStop` (clôture sans remise,
 * remise, dépôt, décision du commercial). Il est RELU et RÉÉCRIT tel quel :
 * l'ignorer à l'écriture le ferait écraser par le premier `save` venu.
 *
 * `closed_lat`, `closed_lng`, `closed_accuracy_m` (YA-D4) — l'inverse,
 * délibérément : jamais relus, écrits par le seul geste qui clôt l'arrêt. La
 * purge à 60 jours les efface sans qu'un `save` plus tardif puisse les rendre.
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
      returned:
        row.returnedAt === null
          ? null
          : {
              at: row.returnedAt,
              byStaffId: row.returnedBy ?? "",
              byName: row.returnedByName ?? "",
            },
      plannedTiming: PlannedTiming.restore({
        departureAt: row.plannedDepartureAt,
        returnAt: row.plannedReturnAt,
        meters: row.plannedMeters,
      }),
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
      SELECT "id" FROM "delivery"."delivery_round" WHERE "id" = ${id} FOR UPDATE`;
    return this.load(id);
  }

  /**
   * Le même verrou, SOUS LE MUR DU LIVREUR (plan « Ma tournée », MT-D3 v2) :
   * `driver_staff_id` est dans le `WHERE` du verrou. Une tournée d'un autre
   * livreur, ou sans livreur, n'est ni verrouillée ni chargée — `null`.
   */
  async loadForDriverDeparture(id: string, staffUserId: string): Promise<DeliveryRound | null> {
    const locked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "delivery"."delivery_round"
       WHERE "id" = ${id} AND "driver_staff_id" = ${staffUserId}
         FOR UPDATE`;
    return locked.length === 0 ? null : this.load(id);
  }

  /**
   * Le verrou et le mur du départ, pour un geste de la porte (plan « À la
   * porte », AP-D2). Même SQL, autre intention : voir le port.
   */
  async loadForDriver(id: string, staffUserId: string): Promise<DeliveryRound | null> {
    return this.loadForDriverDeparture(id, staffUserId);
  }

  /** Le verrou du départ, sans mur, pour la décision d'un commercial (B3). Voir le port. */
  async loadForDecision(id: string): Promise<DeliveryRound | null> {
    return this.loadForDeparture(id);
  }

  async save(round: DeliveryRound): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Une autre ouverture vient de prendre ce passage : on relit.
      await writeRound(tx, round, staleOnOpen);
      await writeStops(tx, round);
    });
  }

  /**
   * Verrouille les deux tournées dans l'ORDRE DE LEUR IDENTIFIANT (C13) : deux
   * déplacements croisés, A → B et B → A, prennent les verrous dans le même
   * ordre et ne s'interbloquent pas. Puis chaque version est vérifiée, et les
   * deux tournées s'écrivent dans la même transaction.
   *
   * Puis, APRÈS les tournées, les lignes de chargement de leurs arrêts, dans
   * l'ordre de leur identifiant (lot 4, L4-C18) : un bac chargé dans l'arrêt
   * déplacé entre la lecture du handler et ce verrou refuse le déplacement
   * (L4-C5). Un chargement verrouille la tournée en partage : s'il est passé
   * avant, on le voit ici ; s'il vient après, il attend.
   */
  async saveMove(from: DeliveryRound, to: DeliveryRound, stopId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const ids = [from.id, to.id].sort();
      await tx.$queryRaw`
        SELECT "id" FROM "delivery"."delivery_round"
         WHERE "id" IN (${ids[0]}, ${ids[1]})
         ORDER BY "id"
           FOR UPDATE`;
      await ensureStopNotLoaded(tx, [from, to], stopId, from.vehicleName);
      await writeRound(tx, from, staleOnOpen);
      await writeRound(tx, to, staleOnOpen);
      // La tournée quittée d'abord : ses positions se resserrent avant que
      // l'arrêt ne rejoigne l'autre.
      await writeStops(tx, from);
      await writeStops(tx, to);
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
}

/**
 * Verrouille les lignes de chargement des arrêts des tournées, dans l'ordre de
 * leur identifiant, et refuse si l'arrêt déplacé porte un bac chargé.
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
      FROM "delivery"."delivery_bin_load"
     WHERE "stop_id" = ANY(${stopIds})
     ORDER BY "id"
       FOR UPDATE`;
  if (loads.some((load) => load.stop_id === stopId && load.loaded)) {
    throw new LoadedStopMoveError(vehicleName);
  }
}

/** Une ouverture qui bute sur `(jour, véhicule, passage)` : une autre vient de le prendre. */
function staleOnOpen(round: DeliveryRound): DeliveryRoundStaleError {
  return new DeliveryRoundStaleError(round.vehicleName);
}
