import type { Prisma } from "../../platform/database/client/client.js";
import type { AppError } from "../../platform/shared/errors/app-error.js";
import type { DeliveryRound, DeliveryStopState } from "../domain/entities/delivery-round.js";
import {
  DeliveryRoundStaleError,
  OrderAlreadyInRoundError,
} from "../domain/errors/delivery-round-errors.js";

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
      updatedAt: snapshot.updatedAt,
    },
  });
  if (written.count === 0) {
    throw new DeliveryRoundStaleError(snapshot.vehicleName);
  }
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
