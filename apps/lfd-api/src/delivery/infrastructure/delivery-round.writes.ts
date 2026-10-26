import type { Prisma } from "../../platform/database/client/client.js";
import type { AppError } from "../../platform/shared/errors/app-error.js";
import type {
  DeliveryRound,
  DeliveryStopState,
  RoundReturn,
  StopSubject,
} from "../domain/entities/delivery-round.js";
import { shipmentRankOfStop } from "../domain/entities/delivery-round-state.js";
import { FIRST_SHIPMENT_RANK } from "../../production/channels/delivery/index.js";
import {
  DeliveryRoundStaleError,
  OrderAlreadyInRoundError,
  DeliveryStopCorruptedError,
  TransferAlreadyInRoundError,
} from "../domain/errors/delivery-round-errors.js";
import type { GesturePosition } from "../domain/value-objects/gesture-position.js";
import type { PlannedTiming } from "../domain/value-objects/planned-timing.js";

/**
 * **Les écritures d'une tournée**, partagées par les deux adaptateurs qui
 * l'écrivent : la composition geste par geste (`PrismaDeliveryRoundRepository`)
 * et la proposition appliquée (`PrismaDeliveryProposalRepository`, lot 7). Un
 * seul `toPersistence`, pour que les deux ne divergent jamais sur une colonne.
 *
 * Les colonnes écrites et leur écrivain sont décrits sur
 * `PrismaDeliveryRoundRepository`.
 */

/** Code Prisma d'une violation d'unicité : l'index I3, ou `(jour, véhicule, passage)`. */
const UNIQUE_VIOLATION = "P2002";

export type Tx = Prisma.TransactionClient;

/** Un arrêt vivant : ni retiré, ni clos — la définition de l'index I3 (C12). */
export const LIVE_STOP = { removedAt: null, closedAt: null } as const;

/**
 * Écrit la ligne d'une tournée : création à l'ouverture, sinon mise à jour
 * sous la version LUE — zéro ligne touchée = quelqu'un a écrit entre-temps.
 *
 * @param onOpenConflict le refus d'une ouverture qui bute sur
 *   `(jour, véhicule, passage)` — l'appelant le nomme.
 * @throws {DeliveryRoundStaleError}
 */
export async function writeRound(
  tx: Tx,
  round: DeliveryRound,
  onOpenConflict: (round: DeliveryRound) => AppError,
): Promise<void> {
  const snapshot = round.toSnapshot();
  if (round.loadedVersion === null) {
    await guard(
      () => onOpenConflict(round),
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
            driverStaffId: snapshot.driverStaffId,
            ...returnColumns(snapshot.returned ?? null),
            ...plannedColumns(snapshot.plannedTiming ?? null),
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
      driverStaffId: snapshot.driverStaffId,
      ...returnColumns(snapshot.returned ?? null),
      ...plannedColumns(snapshot.plannedTiming ?? null),
      updatedAt: snapshot.updatedAt,
    },
  });
  if (written.count === 0) {
    throw new DeliveryRoundStaleError(snapshot.vehicleName);
  }
}

/** Le retour au dépôt (PL2) — trois colonnes, toutes nulles ou toutes posées. */
function returnColumns(returned: RoundReturn | null): {
  readonly returnedAt: Date | null;
  readonly returnedBy: string | null;
  readonly returnedByName: string | null;
} {
  return {
    returnedAt: returned?.at ?? null,
    returnedBy: returned?.byStaffId ?? null,
    returnedByName: returned?.byName ?? null,
  };
}

/** L'horaire prévu (I10) — trois colonnes, toutes nulles ou toutes posées (CHECK). */
function plannedColumns(timing: PlannedTiming | null): {
  readonly plannedDepartureAt: Date | null;
  readonly plannedReturnAt: Date | null;
  readonly plannedMeters: number | null;
} {
  return {
    plannedDepartureAt: timing?.departureAt ?? null,
    plannedReturnAt: timing?.returnAt ?? null,
    plannedMeters: timing?.meters ?? null,
  };
}

/**
 * Écrit les arrêts d'une tournée — vivants, clos, retirés par ce geste.
 * @throws {OrderAlreadyInRoundError} l'index I3 a vu une course.
 */
export async function writeStops(tx: Tx, round: DeliveryRound): Promise<void> {
  const snapshot = round.toSnapshot();
  const rows: readonly (DeliveryStopState & { readonly removedAt: Date | null })[] = [
    ...snapshot.stops.map((stop) => ({ ...stop, removedAt: null })),
    ...snapshot.removedStops,
  ];
  for (const stop of rows) {
    // L'index I3 (ou son jumeau des transferts) a vu une course que la
    // lecture préalable n'a pas vue.
    await guard(
      () =>
        stop.kind === "order"
          ? new OrderAlreadyInRoundError(null, null)
          : new TransferAlreadyInRoundError(stop.transferId, snapshot.vehicleName),
      () =>
        tx.deliveryRoundStop.upsert({
          where: { id: stop.id },
          create: {
            id: stop.id,
            roundId: snapshot.id,
            ...stopSubjectColumns(stop),
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
            ...positionColumns(stop.closedPosition),
          },
        }),
    );
  }
}

/**
 * Les colonnes de la position au geste (YA-D4) — écrites SEULEMENT par le geste
 * qui clôt l'arrêt (`closedPosition` présente) ; absente, rien n'est écrit, et
 * la purge à 60 jours reste seule à les toucher ensuite. Toutes trois ou aucune
 * (CHECK `delivery_round_stop_closed_position_check`).
 */
function positionColumns(position: GesturePosition | undefined): {
  readonly closedLat?: number;
  readonly closedLng?: number;
  readonly closedAccuracyM?: number;
} {
  if (position === undefined) {
    return {};
  }
  return {
    closedLat: position.lat,
    closedLng: position.lng,
    closedAccuracyM: position.accuracyM,
  };
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

/**
 * Le genre et le sujet d'un arrêt (plan du transfert interne, §4) —
 * exactement l'une des deux colonnes, comme le CHECK
 * `delivery_round_stop_kind_check` l'exige.
 */
function stopSubjectColumns(stop: StopSubject): {
  readonly kind: "order" | "transfer";
  readonly orderId: string | null;
  readonly rank: number;
  readonly transferId: string | null;
} {
  return stop.kind === "order"
    ? { kind: "order", orderId: stop.orderId, rank: shipmentRankOfStop(stop), transferId: null }
    : { kind: "transfer", orderId: null, rank: FIRST_SHIPMENT_RANK, transferId: stop.transferId };
}

/**
 * Un arrêt lu en base, rendu au domaine. Le CHECK garantit la colonne du
 * genre ; une ligne qui le contredirait est refusée, jamais devinée.
 * @throws {DeliveryStopCorruptedError}
 */
export function stopSubjectOf(row: {
  readonly id: string;
  readonly kind: "order" | "transfer";
  readonly orderId: string | null;
  readonly rank: number;
  readonly transferId: string | null;
}): StopSubject {
  if (row.kind === "order" && row.orderId !== null) {
    return { kind: "order", orderId: row.orderId, shipmentRank: row.rank };
  }
  if (row.kind === "transfer" && row.transferId !== null) {
    return { kind: "transfer", transferId: row.transferId };
  }
  throw new DeliveryStopCorruptedError(row.id);
}
