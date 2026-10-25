import { DEFAULT_RESUPPLY_CUTOFF_TIME } from "@lfd/contracts";

import type { DayComposer } from "../../delivery/application/day-composer.js";
import { CloseProductionDayCommand } from "../../production/application/commands/close-production-day.command.js";
import { MarkWorksheetLineCommand } from "../../production/application/commands/mark-worksheet-line.command.js";
import { planStopOf, planStopRules } from "../../production/domain/services/latest-order-cutoff.js";
import {
  COUNTER,
  packCounter,
  PACKED_HOUR,
  placeCounter,
  readCounter,
} from "./counter-day.seed.js";
import { seedBinTypes } from "./delivery-bins.seed.js";
import { placeDeliveryDay, readDeliveryDay, type DeliveryDayReport } from "./delivery-day.seed.js";
import {
  type ComposedDay,
  composeTodayRounds,
  deliveryDayReport,
  loadTodayRounds,
  notReadyDeliveries,
  packDeliveryDay,
  readTodayRounds,
} from "./delivery-round-day.seed.js";
import {
  asStaff,
  atHour,
  isoDay,
  SEED_INITIALS,
  SEED_STAFF_SUB,
  type SeedContext,
  type SeedLine,
  shiftDays,
  type Target,
} from "./order-placing.seed.js";
import { seedReturnedBatch } from "./packing-return.seed.js";
import { supplyVillageByTransfer } from "./village-transfer.seed.js";

/**
 * **La journée d'aujourd'hui, par étapes** (2026-10-05,
 * `documentation/commandes/architecture-jeu-de-donnees-par-etapes.md` §1–§2).
 *
 * Elle se jouait d'une traite (`seedToday`) ; elle se joue désormais étape par
 * étape, chacune dans sa propre requête, et chacune par les vrais gestes :
 *
 * | # | Étape | Ici |
 * | --- | --- | --- |
 * | 0 | commandes passées | {@link placeToday} (avec le reste du scénario) |
 * | 1 | plan de production clôturé | {@link closeTodayPlan} |
 * | 2 | tournées composées | {@link composeToday} |
 * | 3 | production complète | {@link bakeToday} |
 * | 4 | colisage complet | {@link packToday} |
 * | 5 | tournées chargées, prêtes à partir | {@link loadToday} |
 *
 * 🔴 **Les tournées AVANT la production et le colisage**, et c'est le code qui
 * l'impose (décision du 2026-10-05, contre la première version du plan) : un
 * demi-bac ne se partage qu'entre deux arrêts CONSÉCUTIFS d'une même tournée,
 * donc la tournée doit exister quand le Petit Chaudron est colisé. La
 * composition, elle, n'exige rien du fournil.
 *
 * Les commandes sont retrouvées d'une étape à l'autre par leur clé de
 * passation (`scenario-keys.seed.ts`), jamais par un état mémorisé.
 */

/** Neuf heures du matin : une heure de commande plausible, et avant toute limite. */
export const ORDER_HOUR = 9;

/**
 * L'heure du **plan du soir** de la veille : le geste qui arrête le compte du
 * jour. Le semis le joue pour aujourd'hui, pour que la fournée, la fiche
 * d'atelier et le colisage du jour soient ouverts dès le chargement.
 */
const EVENING_CLOSE_HOUR = 20;

/** La journée que le scénario joue, et ses deux instants de référence. */
export interface ScenarioDay {
  /** Aujourd'hui, à l'heure de commande. */
  readonly today: Date;
  /** `AAAA-MM-JJ`. */
  readonly forDay: string;
  /** La veille, à la même heure : les commandes du jour se passent la veille. */
  readonly orderedAt: Date;
}

/**
 * Ce qu'une étape courte touche réellement : le bus, réduit aux gestes
 * qu'elle envoie, l'attente de la boîte d'envoi, et — pour la production — le
 * compte du jour. Déclaré plutôt que le `SeedContext` entier : le doublé de
 * test n'a pas à fabriquer un `PrismaClient` (même raison que
 * `ProductionTables`).
 */
export interface StepContext {
  readonly commands: {
    execute(command: CloseProductionDayCommand | MarkWorksheetLineCommand): Promise<unknown>;
  };
  readonly settle: () => Promise<void>;
}

/** Les tournées du jour, telles que l'étape 1 les efface après l'arrêt. */
export interface AutoComposedRounds {
  readonly deliveryRound: {
    findMany(args: {
      where: { serviceDay: string };
      select: { id: true };
    }): Promise<readonly { readonly id: string }[]>;
    deleteMany(args: { where: { serviceDay: string } }): Promise<unknown>;
  };
  readonly activityEvent: {
    deleteMany(args: {
      where: { subjectType: string; subjectId: { in: string[] } };
    }): Promise<unknown>;
  };
  readonly deliveryRoundStop: {
    deleteMany(args: { where: { round: { serviceDay: string } } }): Promise<unknown>;
  };
}

/**
 * Les réglages qui fixent l'arrêt du plan, tels que l'étape 1 les relit : la
 * règle générale et l'heure du réassort (`order_cutoff_settings`, clé `orders`).
 */
export interface PlanStopSettings {
  readonly orderCutoff: {
    findFirst(args: {
      where: { pickupAddressId: null; weekday: null };
      select: { daysBefore: true; time: true; graceMinutes: true };
    }): Promise<{ daysBefore: number; time: string; graceMinutes: number } | null>;
  };
  readonly orderCutoffSettings: {
    findUnique(args: {
      where: { key: string };
      select: { resupplyCutoffTime: true };
    }): Promise<{ resupplyCutoffTime: string } | null>;
  };
}

/** La clé de la ligne unique des réglages des limites (`order-cutoff-settings.key.ts`). */
const ORDER_CUTOFF_SETTINGS_KEY = "orders";

/**
 * L'instant où le semis arrête le plan : le soir de la veille, ou plus tard si
 * les réglages arrêtent le plan plus tard. Un arrêt plus tôt est refusé
 * (`PlanClosedBeforeOrderCutoffError`) : le 2026-10-25, une heure du réassort
 * réglée à 23:00 dans la base de dev faisait échouer chaque rechargement.
 */
async function planCloseInstant(prisma: PlanStopSettings, day: ScenarioDay): Promise<Date> {
  const [general, settings] = await Promise.all([
    prisma.orderCutoff.findFirst({
      where: { pickupAddressId: null, weekday: null },
      select: { daysBefore: true, time: true, graceMinutes: true },
    }),
    prisma.orderCutoffSettings.findUnique({
      where: { key: ORDER_CUTOFF_SETTINGS_KEY },
      select: { resupplyCutoffTime: true },
    }),
  ]);
  const evening = atHour(day.orderedAt, EVENING_CLOSE_HOUR);
  const resupply = settings?.resupplyCutoffTime ?? DEFAULT_RESUPPLY_CUTOFF_TIME;
  const stop = planStopOf(planStopRules(general, resupply), day.forDay);
  return stop !== null && stop.at.getTime() > evening.getTime() ? stop.at : evening;
}

/** Le compte du jour, tel que l'étape 3 le lit. */
export interface ProductionCountTable {
  readonly productionCount: {
    findMany(args: {
      readonly where: { readonly serviceDay: string };
      readonly select: { readonly sku: true };
      readonly orderBy: { readonly sku: "asc" };
    }): Promise<readonly { readonly sku: string }[]>;
  };
}

/** La journée du scénario, calée sur l'instant de la requête. */
export function scenarioDayOf(now: Date): ScenarioDay {
  const today = atHour(now, ORDER_HOUR);
  return { today, forDay: isoDay(today), orderedAt: shiftDays(today, -1) };
}

/**
 * **Étape 0, pour aujourd'hui** : la file du comptoir et la journée de
 * livraison, posées HIER par le vrai handler.
 *
 * ## Pourquoi les commandes sont passées HIER
 *
 * L'heure limite du semis est « la veille 18 h, une heure de rattrapage ». Une
 * commande pour aujourd'hui passée ce matin serait donc **refusée** — à raison.
 * Elles sont posées à l'heure habituelle de la veille, ce qui est aussi le
 * parcours réel : on commande le jour d'avant pour retirer le matin.
 *
 * ## Pourquoi la livraison est posée AVANT le plan du soir
 *
 * Le plan du soir est un instantané : une commande posée après lui n'est pas au
 * plan, donc ni en fournée ni au colisage — la feuille de route la montrerait
 * sans sac possible. Comptoir ET livraison sont donc posés, puis le plan est
 * arrêté une fois (étape 1).
 *
 * @returns le nombre de commandes posées.
 */
export async function placeToday(
  context: SeedContext,
  clients: {
    readonly counter: readonly Target[];
    readonly byEnseigne: ReadonlyMap<string, Target>;
  },
  day: ScenarioDay,
  wide: readonly SeedLine[],
): Promise<number> {
  // Le Village par transfert AVANT le plan du soir : c'est l'arrêt du plan
  // qui range ses retraits dans un transfert interne.
  await supplyVillageByTransfer(context);
  const counter = await placeCounter(context, clients.counter, { ...day, wide });
  const deliveries = await placeDeliveryDay(context, clients.byEnseigne, day.orderedAt, day.forDay);
  return counter.length + deliveries.length;
}

/**
 * **Étape 1 — le plan du soir d'hier.** Sans lui, la fournée du jour refuse
 * chaque coche (« la journée n'est pas arrêtée ») : constaté le 2026-09-28, en
 * démonstration. Les tournées que l'arrêt compose tout seul sont effacées : la
 * démonstration compose les siennes à l'étape 2. La boîte d'envoi est attendue : la liste à coliser part à la
 * clôture, et l'étape suivante s'appuie dessus.
 */
export async function closeTodayPlan(
  context: StepContext & { readonly prisma: AutoComposedRounds & PlanStopSettings },
  day: ScenarioDay,
): Promise<void> {
  await asStaff(await planCloseInstant(context.prisma, day), () =>
    context.commands.execute(new CloseProductionDayCommand(day.forDay)),
  );
  await context.settle();
  await clearAutoComposed(context.prisma, day.forDay);
}

/**
 * Efface les tournées de CE jour que l'arrêt du plan vient de composer tout
 * seul (`DayAutoComposition`, 2026-10-07). Le scénario lit son étape dans la
 * base : avec elles, l'étape 1 se lirait comme la 2. L'étape 2 rejoue la MÊME
 * composition (depuis le 2026-10-14), après avoir semé la flotte et le départ,
 * et affecte une tournée au requérant. Aucun bac n'existe à cette étape. Dev
 * seulement : ses appelants refusent toute cible non locale.
 */
async function clearAutoComposed(prisma: AutoComposedRounds, forDay: string): Promise<void> {
  const rounds = await prisma.deliveryRound.findMany({
    where: { serviceDay: forDay },
    select: { id: true },
  });
  // Leurs faits au journal d'activité AVANT elles : la purge du scénario les
  // retrouve par identifiant de tournée, et ces identifiants vont disparaître.
  await prisma.activityEvent.deleteMany({
    where: { subjectType: "delivery_round", subjectId: { in: rounds.map((round) => round.id) } },
  });
  await prisma.deliveryRoundStop.deleteMany({ where: { round: { serviceDay: forDay } } });
  await prisma.deliveryRound.deleteMany({ where: { serviceDay: forDay } });
}

/**
 * **Étape 3 — toutes les fournées du jour sorties du four**, et remises au
 * colisage : chaque ligne du compte cochée, comme à l'atelier. Cocher une ligne
 * déjà complète ne fait rien (`MarkWorksheetLineHandler`).
 *
 * @returns le nombre d'articles du compte.
 */
export async function bakeToday(
  context: StepContext & { readonly prisma: ProductionCountTable },
  day: ScenarioDay,
): Promise<number> {
  const counts = await context.prisma.productionCount.findMany({
    where: { serviceDay: day.forDay },
    select: { sku: true },
    orderBy: { sku: "asc" },
  });
  for (const { sku } of counts) {
    await asStaff(atHour(day.today, PACKED_HOUR), () =>
      context.commands.execute(
        new MarkWorksheetLineCommand(day.forDay, sku, SEED_INITIALS, SEED_STAFF_SUB),
      ),
    );
  }
  // Les fournées sont des remises : le colisage doit les avoir reçues.
  await context.settle();
  return counts.length;
}

/** La file du comptoir et la journée de livraison, relues par leurs clés. */
async function readToday(context: SeedContext, day: ScenarioDay) {
  const counter = await readCounter(context, day.forDay);
  const deliveries = await readDeliveryDay(context, day.forDay);
  const counterDelivery = counter.find((placed) => placed.entry.point === null) ?? null;
  return { counter, deliveries, counterDelivery };
}

/**
 * **Étape 2 — les tournées composées par le calcul**, sans bacs : la
 * composition automatique (`DayComposer`, celle de l'arrêt du plan), puis une
 * tournée affectée au requérant. Avant la production et le colisage, parce
 * que le code l'impose : un demi-bac ne se partage qu'entre deux arrêts
 * consécutifs d'une tournée qui existe déjà.
 */
export async function composeToday(
  context: SeedContext,
  day: ScenarioDay,
  composer: DayComposer,
): Promise<ComposedDay> {
  const { deliveries, counterDelivery } = await readToday(context, day);
  const counter =
    counterDelivery === null
      ? null
      : { order: counterDelivery.order, ready: counterDelivery.entry.outcome !== "expected" };
  return composeTodayRounds(context, {
    today: day.today,
    composer,
    notReady: notReadyDeliveries(deliveries, counter),
  });
}

/**
 * **Étape 4 — le colisage complet** : le comptoir en sacs et ses variantes
 * (déjà retirée, en retard), une fournée reprise, puis les livraisons prêtes
 * en bacs (demi-bac partagé compris). Les « pas encore prêtes » restent hors
 * colisage. Rend le nombre de moitiés partagées.
 */
export async function packToday(context: SeedContext, day: ScenarioDay): Promise<number> {
  const { counter, deliveries } = await readToday(context, day);
  // Vide : `packFully` coche ce qui ne l'est pas encore, et une ligne déjà
  // complète (étape 3) ne fait rien. Partagé entre comptoir et livraison.
  const baked = new Set<string>();
  // Les types de bacs AVANT le colisage : une livraison ouvre ses bacs au
  // colisage depuis K3c, celle du comptoir comprise.
  const binTypes = await seedBinTypes(context);
  await packCounter(context, counter, { today: day.today, baked, binTypes });
  // Une fournée de trop, reprise : l'annulation que le colisage tranche (K2).
  await asStaff(atHour(day.today, PACKED_HOUR), () => seedReturnedBatch(context, day.forDay));
  return packDeliveryDay(context, { today: day.today, placed: deliveries, baked, binTypes });
}

/**
 * **Étape 5 — les tournées chargées**, prêtes à partir : tous les bacs de
 * toutes les tournées que le calcul a composées (un second passage à midi),
 * et ceux des transferts internes placés. Sans départ. Rend le nombre de bacs
 * chargés.
 */
export async function loadToday(context: SeedContext, day: ScenarioDay): Promise<number> {
  const rounds = await readTodayRounds(context, day.forDay);
  return loadTodayRounds(context, { today: day.today, rounds });
}

/** Toute la journée après le plan du soir, d'une traite — ce que rejouent les rechargements. */
export async function advanceToday(
  context: SeedContext,
  day: ScenarioDay,
  composer: DayComposer,
): Promise<DeliveryDayReport> {
  const composed = await composeToday(context, day, composer);
  await bakeToday(context, day);
  const sharedBins = await packToday(context, day);
  const loadedBins = await loadToday(context, day);
  const { deliveries } = await readToday(context, day);
  return deliveryDayReport({
    forDay: day.forDay,
    placed: deliveries,
    counterDeliveries: COUNTER.filter((entry) => entry.point === null).length,
    composed,
    sharedBins,
    loadedBins,
  });
}
