import type { CommandBus } from "@nestjs/cqrs";

import { AssignDeliveryStopCommand } from "../../delivery/application/commands/assign-delivery-stop.command.js";
import { ChooseDepartureCommand } from "../../delivery/application/commands/choose-departure.command.js";
import { DeclareDeliveryBinsCommand } from "../../delivery/application/commands/declare-delivery-bins.command.js";
import { LoadDeliveryBinCommand } from "../../delivery/application/commands/load-delivery-bin.command.js";
import { ShareDeliveryBinCommand } from "../../delivery/application/commands/share-delivery-bin.command.js";
import { OpenDeliveryRoundCommand } from "../../delivery/application/commands/open-delivery-round.command.js";
import type { PrismaClient } from "../../platform/database/client/client.js";
import { asStaff, SEED_STAFF_SUB } from "./order-placing.seed.js";

/**
 * **La flotte et la tournée du jour**, par les vrais handlers de `delivery`.
 *
 * Même discipline que le reste du semis : un véhicule entre par
 * `AddVehicleCommand` (donc par la plaque que le value object normalise et
 * l'unicité qu'il tient), une tournée s'ouvre, reçoit ses arrêts, ses bacs
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
  readonly deliveryBinLoad: { deleteMany(): Promise<{ readonly count: number }> };
  readonly deliveryBin: { deleteMany(): Promise<{ readonly count: number }> };
  readonly deliveryRoundStop: { deleteMany(): Promise<{ readonly count: number }> };
  readonly deliveryRound: { deleteMany(): Promise<{ readonly count: number }> };
}

/** Ce que la coupe a emporté. */
export interface DeliveryRoundsResetReport {
  readonly rounds: number;
  readonly bins: number;
}

/**
 * ⚠️ **Efface les tournées, leurs arrêts, leurs bacs et leurs chargements.**
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
  await prisma.deliveryBinLoad.deleteMany();
  const bins = await prisma.deliveryBin.deleteMany();
  await prisma.deliveryRoundStop.deleteMany();
  const rounds = await prisma.deliveryRound.deleteMany();
  return { rounds: rounds.count, bins: bins.count };
}

/** Le contexte des gestes de livraison : la base pour constater, le bus pour écrire. */
export interface RoundsContext {
  readonly prisma: PrismaClient;
  readonly commands: CommandBus;
  readonly now: Date;
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

/** Ce qu'un arrêt déclare : des bacs d'UN type, entiers, et au besoin une moitié. */
export interface SeedBins {
  /** L'identifiant du type (semé par `seedBinTypes`). */
  readonly binTypeId: string;
  readonly whole: number;
  readonly half: boolean;
  readonly innerBags: number;
}

/** Un arrêt à poser : la commande, ses bacs, et s'il prend l'autre moitié du bac de l'arrêt d'avant. */
export interface RoundStop {
  readonly orderId: string;
  readonly bins: readonly SeedBins[];
  /**
   * Partage le demi-bac déclaré par l'arrêt PRÉCÉDENT (lot 4 bis, v2-4) : les
   * sacs posés dans sa moitié. Absent = aucun partage.
   */
  readonly sharesPreviousHalf?: { readonly innerBags: number };
}

/** Ce que la tournée composée porte. */
export interface ComposedRound {
  readonly roundId: string;
  readonly stops: number;
  readonly loadedBins: number;
  readonly sharedBins: number;
}

/**
 * **Une tournée composée et chargée, pas partie.**
 *
 * Ouverte, puis chaque arrêt affecté dans l'ordre donné (l'affectation ajoute
 * en dernier), puis les bacs déclarés — APRÈS l'affectation : un partage n'est
 * permis qu'entre deux arrêts consécutifs, et c'est la tournée qui en juge —,
 * puis chacun chargé par son identifiant, comme le ferait le scan de son QR.
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
  const binIds = await declareRoundBins(context, round.at, stops);
  for (const binId of binIds.all) {
    await asStaff(round.at, () =>
      context.commands.execute(new LoadDeliveryBinCommand(roundId, { binId }, SEED_STAFF_SUB)),
    );
  }
  return { roundId, stops: stops.length, loadedBins: binIds.all.length, sharedBins: binIds.shared };
}

/** Déclare les bacs de chaque arrêt, puis l'autre moitié de ceux qui partagent. */
async function declareRoundBins(
  context: RoundsContext,
  at: Date,
  stops: readonly RoundStop[],
): Promise<{ readonly all: readonly string[]; readonly shared: number }> {
  const all: string[] = [];
  let lastHalf: string | null = null;
  let shared = 0;
  for (const stop of stops) {
    const share = stop.sharesPreviousHalf;
    if (share !== undefined && lastHalf !== null) {
      const partnerBinId = lastHalf;
      all.push(
        await asStaff(at, () =>
          context.commands.execute<ShareDeliveryBinCommand, string>(
            new ShareDeliveryBinCommand({
              orderId: stop.orderId,
              partnerBinId,
              innerBags: share.innerBags,
            }),
          ),
        ),
      );
      shared += 1;
    }
    lastHalf = null;
    for (const bins of stop.bins) {
      const declared = await asStaff(at, () =>
        context.commands.execute<DeclareDeliveryBinsCommand, readonly string[]>(
          new DeclareDeliveryBinsCommand({ orderId: stop.orderId, ...bins }),
        ),
      );
      all.push(...declared);
      // La moitié, quand il y en a une, est la dernière déclarée.
      lastHalf = bins.half ? (declared.at(-1) ?? null) : lastHalf;
    }
  }
  return { all, shared };
}
