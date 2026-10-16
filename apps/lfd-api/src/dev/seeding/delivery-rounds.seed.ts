import type { OpenPackingContainer } from "@lfd/contracts";
import type { CommandBus } from "@nestjs/cqrs";

import { SetSiteRolesCommand } from "../../b2b/sites/application/set-site-roles.command.js";
import { ChooseDepartureCommand } from "../../delivery/application/commands/choose-departure.command.js";
import { LoadDeliveryBinCommand } from "../../delivery/application/commands/load-delivery-bin.command.js";
import type { PrismaClient } from "../../platform/database/client/client.js";
import { asStaff, SEED_STAFF_SUB } from "./order-placing.seed.js";

/**
 * **La flotte et la tournée du jour**, par les vrais handlers de `delivery`.
 *
 * Même discipline que le reste du semis : un véhicule entre par
 * `AddVehicleCommand` (donc par la plaque que le value object normalise et
 * l'unicité qu'il tient), les tournées naissent de la composition
 * automatique, leurs bacs naissent au colisage puis sont chargés — chaque
 * geste par sa commande. Une tournée posée
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
  const labo = await context.prisma.site.findFirst({
    where: { label: laboLabel },
    select: {
      id: true,
      pickup: true,
      supply: true,
      deliveryDeparture: true,
      transferMode: true,
      counterSetupMinutes: true,
    },
  });
  if (labo === null) {
    throw new Error(`Point « ${laboLabel} » absent : semer la station avant la livraison.`);
  }
  // Seul un site qui LIVRE peut être le départ (sites, 2026-10-13) : le rôle se
  // coche par l'écran des sites, donc par sa commande, ses autres rôles inchangés.
  if (!labo.deliveryDeparture) {
    const { id, ...roles } = labo;
    await asStaff(context.now, () =>
      context.commands.execute(new SetSiteRolesCommand(id, { ...roles, deliveryDeparture: true })),
    );
  }
  await asStaff(context.now, () =>
    context.commands.execute(new ChooseDepartureCommand(labo.id, SEED_STAFF_SUB)),
  );
}

/** Ce qu'un arrêt reçoit : des bacs d'UN type, entiers, et au besoin une moitié. */
export interface SeedBins {
  /** L'identifiant du type (semé par `seedBinTypes`). */
  readonly binTypeId: string;
  readonly whole: number;
  readonly half: boolean;
  readonly innerBags: number;
}

/** Un arrêt à poser : la commande, et si ses bacs sont déjà chargés. */
export interface RoundStop {
  readonly orderId: string;
  /**
   * Ses bacs sont-ils déjà chargés ? Absent = oui. `false` laisse l'arrêt à
   * charger : l'écran « Charger » montre alors un chargement en cours, pas une
   * camionnette pleine où tout est coché.
   */
  readonly loaded?: boolean;
}

/** Ce que la tournée chargée porte. */
export interface LoadedRound {
  readonly stops: number;
  readonly loadedBins: number;
}

/**
 * **Les contenants qu'un arrêt ouvre au colisage** — un par bac entier, plus
 * la moitié s'il y en a une, et l'autre moitié d'un bac voisin s'il la
 * partage. Depuis K3c (`colisage.md` §17.3), un bac de livraison
 * naît au colisage ; la déclaration après « prête » n'est plus jouée ici.
 * Les sacs intérieurs d'un groupe vont à son premier bac.
 */
export function binContainers(
  bins: readonly SeedBins[],
  share: { readonly partnerBinId: string; readonly innerBags: number } | null,
): readonly OpenPackingContainer[] {
  const opened: OpenPackingContainer[] = share === null ? [] : [{ nature: "bin", ...share }];
  for (const group of bins) {
    const halves = group.half ? [true] : [];
    const wholes: boolean[] = Array.from({ length: group.whole }, () => false);
    for (const [index, half] of [...wholes, ...halves].entries()) {
      const innerBags = index === 0 ? group.innerBags : 0;
      opened.push({ nature: "bin", binTypeId: group.binTypeId, half, innerBags });
    }
  }
  return opened;
}

/** La moitié vivante d'un bac de la commande — celle qu'un arrêt voisin peut partager. */
export async function halfBinOf(context: RoundsContext, orderId: string): Promise<string> {
  const bin = await context.prisma.deliveryBin.findFirst({
    where: { orderId, half: { not: null }, voidedAt: null },
    select: { id: true },
  });
  if (bin === null) {
    throw new Error(`La commande ${orderId} n'a aucune moitié de bac à partager.`);
  }
  return bin.id;
}

/**
 * **Les bacs des arrêts chargés, chargés** — chacun par son identifiant, comme
 * le ferait le scan de son QR. Les bacs sont ceux que le colisage a fait
 * naître (une lecture du semis, qui a les droits de la racine).
 */
export async function loadRound(
  context: RoundsContext,
  round: { readonly roundId: string; readonly at: Date },
  stops: readonly RoundStop[],
): Promise<LoadedRound> {
  const orderIds = stops.filter((stop) => stop.loaded !== false).map((stop) => stop.orderId);
  const bins = await context.prisma.deliveryBin.findMany({
    where: { orderId: { in: orderIds }, voidedAt: null },
    select: { id: true, orderId: true },
    orderBy: { createdAt: "asc" },
  });
  const ordered = orderIds.flatMap((orderId) => bins.filter((bin) => bin.orderId === orderId));
  for (const bin of ordered) {
    await asStaff(round.at, () =>
      context.commands.execute(
        new LoadDeliveryBinCommand(round.roundId, { binId: bin.id }, SEED_STAFF_SUB),
      ),
    );
  }
  return { stops: stops.length, loadedBins: ordered.length };
}

/** Une tournée du jour telle que le semis la relit, arrêts vivants dans l'ordre. */
export interface ComposedRound {
  readonly roundId: string;
  readonly passage: number;
  /** Chaque arrêt vivant dans l'ordre : sa commande, ou `null` pour un transfert interne. */
  readonly sequence: readonly (string | null)[];
  /** Les arrêts de livraison seuls, dans l'ordre. */
  readonly stops: readonly RoundStop[];
}

/**
 * **La tournée du requérant** : la première, dans l'ordre des véhicules puis
 * des passages, qui a au moins une livraison et dont AUCUNE ne reste hors
 * colisage — il doit pouvoir la faire partir. À défaut, la première qui a une
 * livraison : l'affectation se fait quand même, et « Partir » dira pourquoi.
 */
export function driverRoundOf(
  rounds: readonly ComposedRound[],
  notReady: ReadonlySet<string>,
): ComposedRound | undefined {
  const delivering = rounds.filter((round) => round.stops.length > 0);
  return (
    delivering.find((round) => round.stops.every((stop) => !notReady.has(stop.orderId))) ??
    delivering[0]
  );
}

/**
 * **Qui prend l'autre moitié de quel bac** (v2-4) : l'arrêt qui SUIT
 * immédiatement, dans sa tournée, une livraison qui ouvre une moitié — s'il
 * est colisé ici. Un transfert entre les deux les sépare. Rend, par commande
 * qui partage, la commande dont elle prend la moitié.
 *
 * C'est la composition qui décide qui suit qui : jusqu'au 2026-10-14, le
 * partage était écrit sur le Petit Chaudron, rang 2 d'une tournée à la main.
 */
export function halfSharedBy(
  rounds: readonly ComposedRound[],
  opensHalf: ReadonlySet<string>,
  packed: ReadonlySet<string>,
): ReadonlyMap<string, string> {
  const sharing = new Map<string, string>();
  for (const { sequence } of rounds) {
    sequence.forEach((orderId, index) => {
      const previous = index === 0 ? null : (sequence[index - 1] ?? null);
      if (orderId !== null && previous !== null && opensHalf.has(previous) && packed.has(orderId)) {
        sharing.set(orderId, previous);
      }
    });
  }
  return sharing;
}

/**
 * L'ordre du colisage : les livraisons en tournée dans l'ordre des tournées —
 * une moitié s'ouvre AVANT d'être partagée —, puis les autres, dans l'ordre
 * reçu.
 */
export function packingOrderOf<T extends { readonly order: { readonly id: string } }>(
  items: readonly T[],
  rounds: readonly ComposedRound[],
): readonly T[] {
  const rank = new Map<string, number>();
  for (const round of rounds) {
    for (const stop of round.stops) {
      rank.set(stop.orderId, rank.size);
    }
  }
  const at = (item: T): number => rank.get(item.order.id) ?? Number.MAX_SAFE_INTEGER;
  return [...items].sort((left, right) => at(left) - at(right));
}
