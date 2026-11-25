import type { CreateSubscriptionPayload, Recurrence } from "@lfd/contracts";
import { randomUUID } from "node:crypto";

import { runWithRequestContext } from "../../platform/context/request-context.store.js";
import { newTraceId } from "../../platform/context/trace-context.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import { OpenBasketCommand } from "../../recurring/basket/application/commands/open-basket.command.js";
import type { OpenedBasket } from "../../recurring/basket/application/commands/open-basket.command.js";
import { OverrideOccurrenceCommand } from "../../recurring/occurrence/application/commands/override-occurrence.command.js";
import {
  SweepDueOccurrencesCommand,
  type RecurringOccurrencesSweepReport,
} from "../../recurring/occurrence/application/commands/sweep-due-occurrences.command.js";
import { carnetWindowOf } from "./carnet-window.seed.js";
import { LABO, PICKUP_WINDOW } from "./counter-day.seed.js";
import {
  isoDay,
  type SeedContext,
  type SeedLine,
  type SeedWindow,
  shiftDays,
  type Target,
} from "./order-placing.seed.js";
import { ensureProSalesTerms } from "./pro-sales-terms.seed.js";
import { withSaleSkus } from "./sale-references.seed.js";
import type { ScenarioDay } from "./today.seed.js";

/** Une semaine : l'échéance suivante d'un panier hebdomadaire. */
const DAYS_PER_WEEK = 7;
const WEEKLY: Recurrence = "weekly";

/** Ce que le client fait de l'échéance de la semaine prochaine. */
type NextWeekGesture =
  | { readonly kind: "skip" }
  | { readonly kind: "override"; readonly lines: readonly SeedLine[] }
  | { readonly kind: "none" };

/** Un panier que le scénario ouvre, comme le client l'ouvrirait. */
interface ScenarioBasket {
  readonly enseigne: string;
  /** Le premier jour servi, en jours depuis aujourd'hui. */
  readonly startsIn: number;
  readonly method: "pickup" | "delivery";
  readonly lines: readonly SeedLine[];
  readonly nextWeek: NextWeekGesture;
}

/** Les enseignes, telles que leurs semis les nomment (`neighbour-clients`, `delivery-clients`). */
const PETIT_CHAUDRON = "Le Petit Chaudron";
const LAC_BLANC = "Hôtel Le Lac Blanc";
const FROMAGERIE = "La Fromagerie du Parc";

/**
 * Jusqu'où le balayage de la veille porte : une échéance se passe à partir de
 * `service_day − 7`, donc la veille sert jusqu'à aujourd'hui + 6.
 */
const SWEEP_REACH_DAYS = DAYS_PER_WEEK - 1;

/**
 * **Les paniers du scénario.** Trois clients au compte (terme mensuel accordé
 * par leur semis) ; aucun client pro du scénario n'est sans crédit, donc aucun
 * refus `no_settlement` n'est fabriqué.
 *
 * - le Petit Chaudron, au comptoir dès aujourd'hui — sa commande d'aujourd'hui
 *   entre au plan du soir ; il saute la semaine prochaine ;
 * - l'Hôtel Le Lac Blanc, au comptoir dès demain — il change ses quantités la
 *   semaine prochaine ;
 * - la Fromagerie du Parc, en livraison à partir de la semaine prochaine.
 *   Pas plus tôt : une livraison de plus aujourd'hui ou demain déplacerait les
 *   tournées que le scénario compose et charge, et rien ne la colise.
 */
const SCENARIO_BASKETS: readonly ScenarioBasket[] = [
  {
    enseigne: PETIT_CHAUDRON,
    startsIn: 0,
    method: "pickup",
    lines: [
      { sku: "VIE-001", quantity: 20 },
      { sku: "VIE-002", quantity: 15 },
      { sku: "PAI-001", quantity: 10 },
    ],
    nextWeek: { kind: "skip" },
  },
  {
    enseigne: LAC_BLANC,
    startsIn: 1,
    method: "pickup",
    lines: [
      { sku: "PAI-001", quantity: 12 },
      { sku: "VIE-009", quantity: 8 },
      { sku: "VIE-005", quantity: 6 },
    ],
    nextWeek: {
      kind: "override",
      lines: [
        { sku: "PAI-001", quantity: 18 },
        { sku: "VIE-009", quantity: 4 },
        { sku: "VIE-005", quantity: 6 },
      ],
    },
  },
  {
    enseigne: FROMAGERIE,
    startsIn: DAYS_PER_WEEK,
    method: "delivery",
    lines: [
      { sku: "PAI-001", quantity: 10 },
      { sku: "PAI-013", quantity: 6 },
    ],
    nextWeek: { kind: "none" },
  },
];

/** Ce que le semis des paniers a posé. */
export interface RecurringBasketsReport {
  readonly baskets: number;
  /** Les commandes que le balayage a passées pour les paniers du scénario. */
  readonly placed: number;
}

/** Un panier ouvert, et le jour où il commence. */
interface OpenedScenarioBasket {
  readonly id: string;
  readonly target: Target;
  readonly seed: ScenarioBasket;
}

/**
 * **Les paniers récurrents du scénario**, par les vrais gestes et à l'heure
 * où se passent les commandes du jour (la veille, `ORDER_HOUR`) : chaque
 * acheteur ouvre son panier, saute ou modifie l'échéance de la semaine
 * prochaine, puis le balayage passe ce qui est dû — les échéances
 * d'aujourd'hui et de demain deviennent des commandes au compte, qui entrent
 * au plan du soir comme les autres.
 *
 * À appeler AVANT l'arrêt du plan du jour.
 */
export async function seedRecurringBaskets(
  context: SeedContext,
  byEnseigne: ReadonlyMap<string, Target>,
  day: ScenarioDay,
): Promise<RecurringBasketsReport> {
  await ensureProSalesTerms(context);
  const opened: OpenedScenarioBasket[] = [];
  for (const seed of SCENARIO_BASKETS) {
    const target = byEnseigne.get(seed.enseigne);
    if (target === undefined) {
      throw new RecurringSeedClientMissingError(seed.enseigne);
    }
    opened.push({ id: await openBasket(context, target, seed, day), target, seed });
  }
  for (const basket of opened) {
    await changeNextWeek(context, basket, day);
  }
  await sweep(context, day.orderedAt);
  const placed = await antedateOccurrenceOrders(
    context,
    opened.map((basket) => basket.id),
    day.orderedAt,
  );
  const due = SCENARIO_BASKETS.filter((seed) => seed.startsIn <= SWEEP_REACH_DAYS).length;
  if (placed !== due) {
    throw new RecurringSeedIncompleteError(due, placed);
  }
  return { baskets: opened.length, placed };
}

/** L'ouverture, comme le client la fait depuis son espace. */
async function openBasket(
  context: SeedContext,
  target: Target,
  seed: ScenarioBasket,
  day: ScenarioDay,
): Promise<string> {
  const startDate = isoDay(shiftDays(day.today, seed.startsIn));
  const delivery = seed.method === "delivery" ? target.defaultDelivery : null;
  if (seed.method === "delivery" && delivery === null) {
    throw new RecurringSeedClientMissingError(seed.enseigne);
  }
  const payload: CreateSubscriptionPayload = {
    fromOrderId: null,
    recurrence: WEEKLY,
    startDate,
    endDate: null,
    fulfillmentMethod: seed.method,
    deliveryAddress: delivery?.postal ?? null,
    pickupAddressId: seed.method === "pickup" ? (target.pickupIds.get(LABO) ?? null) : null,
    requestedWindow: await windowOf(context, delivery?.id ?? null, startDate, seed.enseigne),
    lines: await saleLines(context, seed.lines),
    note: "",
  };
  const basket = await asBuyer(target, day.orderedAt, () =>
    context.commands.execute<OpenBasketCommand, OpenedBasket>(
      new OpenBasketCommand(target.buyerUserId, payload, target.companyId, randomUUID()),
    ),
  );
  return basket.id;
}

/** En retrait, la tranche pro du Labo ; en livraison, celle du carnet du client. */
async function windowOf(
  context: SeedContext,
  addressId: string | null,
  day: string,
  enseigne: string,
): Promise<SeedWindow> {
  if (addressId === null) {
    return PICKUP_WINDOW;
  }
  const window = await carnetWindowOf(context.prisma, addressId, day);
  if (window === null) {
    throw new RecurringSeedClientMissingError(enseigne);
  }
  return window;
}

/** La dérogation de la semaine prochaine, par le geste du client. */
async function changeNextWeek(
  context: SeedContext,
  { id, target, seed }: OpenedScenarioBasket,
  day: ScenarioDay,
): Promise<void> {
  const gesture = seed.nextWeek;
  if (gesture.kind === "none") {
    return;
  }
  const date = isoDay(shiftDays(day.today, seed.startsIn + DAYS_PER_WEEK));
  const payload =
    gesture.kind === "skip"
      ? { skipped: true, lines: [], note: "Fermeture pour inventaire." }
      : {
          skipped: false,
          lines: await saleLines(context, gesture.lines),
          note: "Groupe de séminaire : plus de pain, moins de viennoiseries.",
        };
  await asBuyer(target, day.orderedAt, () =>
    context.commands.execute(new OverrideOccurrenceCommand(target.buyerUserId, id, date, payload)),
  );
}

/** Le balayage horaire, joué à l'instant donné : c'est la machine, pas un acteur. */
async function sweep(context: SeedContext, at: Date): Promise<void> {
  await runWithRequestContext({ now: at, traceId: newTraceId() }, () =>
    context.commands.execute<SweepDueOccurrencesCommand, RecurringOccurrencesSweepReport>(
      new SweepDueOccurrencesCommand(),
    ),
  );
}

/**
 * Les commandes des paniers, datées de l'heure du balayage — même raison que
 * `place` : `created_at` a un défaut SQL que le contexte ne devance pas.
 * Après que les abonnés de la passation ont fini.
 *
 * @returns combien de commandes les paniers ont reçues.
 */
async function antedateOccurrenceOrders(
  context: SeedContext,
  basketIds: readonly string[],
  at: Date,
): Promise<number> {
  await context.settle();
  const updated = await context.prisma.order.updateMany({
    where: { fromSubscriptionId: { in: [...basketIds] } },
    data: { createdAt: at },
  });
  return updated.count;
}

/** Le corpus nomme la fiche ; le panier, comme la boutique, la référence de vente. */
async function saleLines(
  context: SeedContext,
  lines: readonly SeedLine[],
): Promise<{ sku: string; quantity: number }[]> {
  const sale = await withSaleSkus(context.prisma, lines);
  return sale.map((line) => ({ sku: line.sku, quantity: line.quantity }));
}

function asBuyer<T>(target: Target, now: Date, run: () => Promise<T>): Promise<T> {
  return runWithRequestContext(
    { now, traceId: newTraceId(), actor: { type: "customer", id: target.buyerUserId } },
    run,
  );
}

/** Un client que les paniers du scénario visent manque au semis. */
class RecurringSeedClientMissingError extends TechnicalError {
  constructor(enseigne: string) {
    super(
      "dev_seed.recurring_client_missing",
      `Le client « ${enseigne} » (ou son adresse de livraison et son créneau) manque au ` +
        "scénario : semer les clients avant leurs paniers récurrents.",
    );
  }
}

/** Le balayage n'a pas passé toutes les échéances dues des paniers du scénario. */
class RecurringSeedIncompleteError extends TechnicalError {
  constructor(expected: number, placed: number) {
    super(
      "dev_seed.recurring_incomplete",
      `Le balayage des paniers récurrents a passé ${String(placed)} commande(s) sur ` +
        `${String(expected)} attendue(s) : lire les échéances refusées sur la fiche client ` +
        "(cause et phrase du refus), corriger, puis remettre le scénario à l'état de base.",
    );
  }
}
