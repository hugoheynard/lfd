import type { CommandBus } from "@nestjs/cqrs";

import { AddVehicleCommand } from "../../delivery/application/commands/add-vehicle.command.js";
import { AssignDeliveryStopCommand } from "../../delivery/application/commands/assign-delivery-stop.command.js";
import { ChooseDepartureCommand } from "../../delivery/application/commands/choose-departure.command.js";
import { DeclareDeliveryBagsCommand } from "../../delivery/application/commands/declare-delivery-bags.command.js";
import { LoadDeliveryBagCommand } from "../../delivery/application/commands/load-delivery-bag.command.js";
import { OpenDeliveryRoundCommand } from "../../delivery/application/commands/open-delivery-round.command.js";
import { ReactivateVehicleCommand } from "../../delivery/application/commands/reactivate-vehicle.command.js";
import type { PrismaClient } from "../../platform/database/client/client.js";
import { asStaff, SEED_STAFF_SUB } from "./order-placing.seed.js";

/**
 * **La flotte et la tournée du jour**, par les vrais handlers de `delivery`.
 *
 * Même discipline que le reste du semis : un véhicule entre par
 * `AddVehicleCommand` (donc par la plaque que le value object normalise et
 * l'unicité qu'il tient), une tournée s'ouvre, reçoit ses arrêts, ses sacs
 * sont déclarés puis chargés — chaque geste par sa commande. Une tournée posée
 * en Prisma aurait peint l'écran sans rien éprouver.
 */

/**
 * **Les seules tables que la coupe touche**, déclarées plutôt que devinées —
 * même raison que `ProductionTables` : le doublé de test n'a pas à caster un
 * `PrismaClient` entier.
 */
export interface DeliveryRoundTables {
  readonly deliveryStopExecution: { deleteMany(): Promise<{ readonly count: number }> };
  readonly deliveryBagLoad: { deleteMany(): Promise<{ readonly count: number }> };
  readonly deliveryBag: { deleteMany(): Promise<{ readonly count: number }> };
  readonly deliveryRoundStop: { deleteMany(): Promise<{ readonly count: number }> };
  readonly deliveryRound: { deleteMany(): Promise<{ readonly count: number }> };
}

/** Ce que la coupe a emporté. */
export interface DeliveryRoundsResetReport {
  readonly rounds: number;
  readonly bags: number;
}

/**
 * ⚠️ **Efface les tournées, leurs arrêts, leurs sacs et leurs chargements.**
 *
 * Pour la même raison que `resetProduction` : ces tables désignent les
 * commandes par identifiant opaque, sans clé étrangère (la frontière le veut).
 * Le semis efface les commandes et les repose ; sans cette coupe, une tournée
 * d'hier porterait des arrêts vers des commandes qui n'existent plus, et une
 * nouvelle affectation buterait sur « déjà dans une tournée » tous jours
 * confondus.
 *
 * Tout, et pas seulement aujourd'hui : un poste n'a qu'un jeu de commandes, et
 * une tournée d'un autre jour serait orpheline de la même façon.
 *
 * **Les véhicules et le point de départ restent** : ce sont des réglages, pas
 * des faits de la journée — un véhicule ajouté à la main sur le poste survit
 * au rechargement.
 *
 * Enfants d'abord : toutes les clés sont `Restrict`. Pas de serrure ici — ses
 * appelants refusent déjà toute cible non locale (`refuseNonLocalTarget`, et la
 * serrure de `DevSeedService`), comme pour la coupe du fournil.
 */
export async function resetDeliveryRounds(
  prisma: DeliveryRoundTables,
): Promise<DeliveryRoundsResetReport> {
  await prisma.deliveryStopExecution.deleteMany();
  await prisma.deliveryBagLoad.deleteMany();
  const bags = await prisma.deliveryBag.deleteMany();
  await prisma.deliveryRoundStop.deleteMany();
  const rounds = await prisma.deliveryRound.deleteMany();
  return { rounds: rounds.count, bags: bags.count };
}

/** Le contexte des gestes de livraison : la base pour constater, le bus pour écrire. */
export interface RoundsContext {
  readonly prisma: PrismaClient;
  readonly commands: CommandBus;
  readonly now: Date;
}

/**
 * Les trois camionnettes. Plaques au format SIV, que le value object accepte
 * (ni I, ni O, ni U) — et qui ne désignent aucun véhicule qu'on connaisse.
 */
export const FLEET: readonly { readonly name: string; readonly plate: string }[] = [
  { name: "Camionnette 1", plate: "FG-481-KL" },
  { name: "Camionnette 2", plate: "FG-482-KL" },
  { name: "Camionnette 3", plate: "FG-483-KL" },
];

/**
 * **La flotte, idempotente par plaque.** Une camionnette absente est ajoutée,
 * une camionnette retirée sur le poste est remise en service, les autres sont
 * laissées telles quelles — et aucun autre véhicule n'est touché.
 *
 * @returns l'identifiant de chaque camionnette, par nom.
 */
export async function seedFleet(context: RoundsContext): Promise<ReadonlyMap<string, string>> {
  const ids = new Map<string, string>();
  for (const vehicle of FLEET) {
    const existing = await context.prisma.deliveryVehicle.findFirst({
      where: { plate: vehicle.plate },
      select: { id: true, retiredAt: true },
    });
    if (existing === null) {
      const id = await asStaff(context.now, () =>
        context.commands.execute<AddVehicleCommand, string>(new AddVehicleCommand(vehicle)),
      );
      ids.set(vehicle.name, id);
      continue;
    }
    if (existing.retiredAt !== null) {
      await asStaff(context.now, () =>
        context.commands.execute(new ReactivateVehicleCommand(existing.id)),
      );
    }
    ids.set(vehicle.name, existing.id);
  }
  return ids;
}

/**
 * **Le point de départ : Le Labo.** Rejoué à chaque semis — le choix est un
 * seul enregistrement, qu'on remplace, et le fait au journal dit lequel il
 * remplace.
 */
export async function chooseLaboDeparture(
  context: RoundsContext,
  laboLabel: string,
): Promise<void> {
  const labo = await context.prisma.pickupAddress.findFirst({
    where: { label: laboLabel },
    select: { id: true },
  });
  if (labo === null) {
    throw new Error(`Point « ${laboLabel} » absent : semer la station avant la livraison.`);
  }
  await asStaff(context.now, () =>
    context.commands.execute(new ChooseDepartureCommand(labo.id, SEED_STAFF_SUB)),
  );
}

/** Un arrêt à poser : la commande, et combien de sacs elle fait. */
export interface RoundStop {
  readonly orderId: string;
  readonly bags: number;
}

/** Ce que la tournée composée porte. */
export interface ComposedRound {
  readonly stops: number;
  readonly loadedBags: number;
}

/**
 * **Une tournée composée et chargée, pas partie.**
 *
 * Ouverte, puis chaque arrêt affecté dans l'ordre donné (l'affectation ajoute
 * en dernier), puis les sacs déclarés — APRÈS l'affectation, pour qu'ils
 * naissent rattachés à l'arrêt —, puis chacun chargé par son identifiant,
 * comme le ferait le scan de son QR.
 *
 * La version de la tournée est relue avant chaque affectation : c'est le jeton
 * de concurrence que l'écran enverrait, et le deviner serait tricher avec le
 * garde qu'il porte.
 */
export async function composeLoadedRound(
  context: RoundsContext,
  round: { readonly day: string; readonly vehicleId: string; readonly at: Date },
  stops: readonly RoundStop[],
): Promise<ComposedRound> {
  const roundId = await asStaff(round.at, () =>
    context.commands.execute<OpenDeliveryRoundCommand, string>(
      new OpenDeliveryRoundCommand({ day: round.day, vehicleId: round.vehicleId }),
    ),
  );
  for (const stop of stops) {
    const { version } = await context.prisma.deliveryRound.findUniqueOrThrow({
      where: { id: roundId },
      select: { version: true },
    });
    await asStaff(round.at, () =>
      context.commands.execute(
        new AssignDeliveryStopCommand(roundId, { orderId: stop.orderId, version }),
      ),
    );
  }
  let loadedBags = 0;
  for (const stop of stops) {
    const bagIds = await asStaff(round.at, () =>
      context.commands.execute<DeclareDeliveryBagsCommand, readonly string[]>(
        new DeclareDeliveryBagsCommand({ orderId: stop.orderId, count: stop.bags }),
      ),
    );
    for (const bagId of bagIds) {
      await asStaff(round.at, () =>
        context.commands.execute(new LoadDeliveryBagCommand(roundId, { bagId }, SEED_STAFF_SUB)),
      );
      loadedBags += 1;
    }
  }
  return { stops: stops.length, loadedBags };
}
