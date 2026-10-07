import { AssignDeliveryDriverCommand } from "../../delivery/application/commands/assign-delivery-driver.command.js";
import {
  DriverWithoutAccessError,
  DriverWithoutDoorstepError,
} from "../../delivery/domain/errors/delivery-driver-errors.js";
import type { PrismaClient } from "../../platform/database/client/client.js";
import { asStaff } from "./order-placing.seed.js";

/**
 * **Le livreur de la tournée chargée** : la personne qui a demandé le
 * rechargement (2026-10-01), pour qu'elle ouvre « Ma tournée » sur une tournée
 * prête à partir.
 *
 * Par `AssignDeliveryDriverCommand`, donc par l'agrégat qui refuse quiconque ne
 * tient pas `delivery_driving:write` ET `delivery_doorstep:write` (audit
 * 2026-10-07, B8) — une affectation écrite en Prisma aurait montré une page que
 * le vrai droit n'ouvre pas.
 */

/** Ce que l'affectation a donné — l'écran de rechargement le dit tel quel. */
export type SeedDriverAssignment =
  | { readonly status: "assigned"; readonly staffUserId: string; readonly name: string }
  | { readonly status: "refused"; readonly reason: string }
  | { readonly status: "no_requester" };

/** Ce que l'affectation lit : la version de la tournée et le nom du livreur. */
export interface DriverSeedReader {
  roundVersion(roundId: string): Promise<number>;
  staffName(staffUserId: string): Promise<string>;
}

/** Le contexte de l'affectation. `requester` absent = la ligne de commande. */
export interface DriverSeedContext {
  /** Le bus, réduit au seul geste envoyé — le doublé de test n'a pas à jouer tout `CommandBus`. */
  readonly commands: { execute(command: AssignDeliveryDriverCommand): Promise<unknown> };
  readonly reader: DriverSeedReader;
  readonly requester: string | undefined;
}

/**
 * Affecte la tournée au requérant. Un requérant qui ne peut pas livrer — sans
 * le droit de conduire, ou sans les gestes à la porte — ne fait PAS échouer le
 * rechargement : la tournée reste sans livreur, et le rapport porte le refus de
 * l'agrégat, mot pour mot. Toute autre erreur remonte.
 */
export async function assignSeedDriver(
  context: DriverSeedContext,
  round: { readonly roundId: string; readonly at: Date },
): Promise<SeedDriverAssignment> {
  const staffUserId = context.requester;
  if (staffUserId === undefined) {
    return { status: "no_requester" };
  }
  const version = await context.reader.roundVersion(round.roundId);
  try {
    await asStaff(round.at, () =>
      context.commands.execute(
        new AssignDeliveryDriverCommand(round.roundId, { version, staffUserId }),
      ),
    );
  } catch (error) {
    if (error instanceof DriverWithoutAccessError || error instanceof DriverWithoutDoorstepError) {
      return { status: "refused", reason: error.message };
    }
    throw error;
  }
  return { status: "assigned", staffUserId, name: await context.reader.staffName(staffUserId) };
}

/** La version de la tournée et le nom du livreur, relus en base. */
export function prismaDriverReader(prisma: PrismaClient): DriverSeedReader {
  return {
    roundVersion: async (roundId) =>
      (
        await prisma.deliveryRound.findUniqueOrThrow({
          where: { id: roundId },
          select: { version: true },
        })
      ).version,
    staffName: async (staffUserId) => {
      const staff = await prisma.staffUser.findUniqueOrThrow({
        where: { id: staffUserId },
        select: { firstName: true, lastName: true },
      });
      return `${staff.firstName} ${staff.lastName}`.trim();
    },
  };
}
