import { OrderInscriptionReader } from "../../../../../production/channels/commerce/index.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { RevisableOrder } from "../../../revision/domain/entities/order-revision.js";
import { OrderChangeNotQuotableError } from "../../../domain/errors/order-change-quote-errors.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  CardOrderNotRevisableError,
  OrderNotRevisableError,
} from "../../../revision/domain/errors/order-revision-errors.js";
import type { OrderPlanGate } from "../../services/order-plan-gate.service.js";
import { OrderRevisabilityReading } from "../../../revision/application/services/order-revisability-reading.js";
import { RevisionWall } from "../../../revision/application/services/revision-wall.js";
import { FixedClosedPlans, gateOf } from "../../commands/__tests__/plan-doubles.js";
import { ItemLimitPassedOnRevisionError } from "../../../domain/errors/item-limit-override-errors.js";
import {
  AFTER_CUTOFF,
  CATALOG,
  content,
  DAY,
  FixedRevisableOrders,
  NOW,
  OneRoleAccess,
  placedOrder,
  revisingAt,
} from "../../../revision/application/commands/__tests__/revision-scene.js";
import { QuoteOrderChangeRequestHandler } from "../quote-order-change-request.handler.js";
import { QuoteOrderChangeRequestQuery } from "../quote-order-change-request.query.js";

/**
 * **Le devis d'une demande de modification** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.5 « La demande après l'heure limite » (M4)) — ouvert au
 * seul « trop tard », derrière le mur du client, chiffré par la MÊME
 * recomposition que la modification. Instants de la scène, horloge FIXE.
 */

/**
 * La limite de la scène portée par la RÈGLE GÉNÉRALE (la veille, 18 h) et non
 * par les articles : l'équipe qui applique une demande se voit opposer la
 * limite propre d'un produit ajouté (plan des dépassements, § 3.6), jamais la
 * règle générale.
 */
const GENERAL_RULE = {
  list: () =>
    Promise.resolve([
      {
        id: "general",
        pickupAddressId: null,
        pickupLabel: null,
        weekday: null,
        daysBefore: 1,
        time: "18:00",
        graceMinutes: 0,
      },
    ]),
};
const WITHOUT_ITEM_LIMITS = CATALOG.map((item) => ({ ...item, orderTimeLimit: null }));

class FixedInscription extends OrderInscriptionReader {
  constructor(private readonly day: string | null = null) {
    super();
  }

  inscribedDayOf(): Promise<string | null> {
    return Promise.resolve(this.day);
  }
}

function handlerFor(
  order: RevisableOrder,
  options: {
    readonly now?: Date;
    readonly plans?: OrderPlanGate;
    readonly inscribedDay?: string | null;
    readonly role?: "orders" | null;
    /** Par défaut, des articles sans limite propre : seule la règle générale juge. */
    readonly catalogItems?: typeof CATALOG;
  } = {},
): QuoteOrderChangeRequestHandler {
  const orders = new FixedRevisableOrders(order);
  const clock = new FixedClock(options.now ?? AFTER_CUTOFF);
  const revising = revisingAt(clock, {
    ...(options.plans === undefined ? {} : { plans: options.plans }),
    cutoffs: GENERAL_RULE,
    catalogItems: options.catalogItems ?? WITHOUT_ITEM_LIMITS,
  });
  return new QuoteOrderChangeRequestHandler(
    new RevisionWall(
      orders,
      new OneRoleAccess(options.role === undefined ? "orders" : options.role),
    ),
    new OrderRevisabilityReading(
      orders,
      new FixedInscription(options.inscribedDay ?? null),
      revising,
    ),
    revising,
    clock,
  );
}

const MORE = content({
  lines: [
    { sku: "VIE-001", quantity: 20 },
    { sku: "PAI-001", quantity: 1 },
  ],
});

describe("QuoteOrderChangeRequestHandler", () => {
  it("après l'heure limite : chiffre la demande, prix d'origine gardé, prix du jour pour l'ajout", async () => {
    const order = await placedOrder({ revision: 2 });

    const quote = await handlerFor(order).execute(
      new QuoteOrderChangeRequestQuery("ord_1", "usr_1", MORE),
    );

    expect(quote.revision).toBe(2);
    expect(quote.previousTotalCents).toBe(order.totalCents);
    expect(quote.differenceCents).toBe(quote.totalCents - order.totalCents);
    expect(quote.differenceCents).toBeGreaterThan(0);
    expect(quote.lines.map((line) => [line.sku, line.priceFrozen])).toEqual([
      ["VIE-001", true],
      ["PAI-001", false],
    ]);
  });

  it("refuse d'ajouter un produit dont la limite propre est passée : l'équipe qui applique n'a pas le droit", async () => {
    const order = await placedOrder({ revision: 2 });

    await expect(
      handlerFor(order, { catalogItems: CATALOG }).execute(
        new QuoteOrderChangeRequestQuery("ord_1", "usr_1", MORE),
      ),
    ).rejects.toBeInstanceOf(ItemLimitPassedOnRevisionError);
  });

  it("avant l'heure limite : refusé, la commande se modifie directement", async () => {
    const order = await placedOrder();

    await expect(
      handlerFor(order, { now: NOW }).execute(
        new QuoteOrderChangeRequestQuery("ord_1", "usr_1", MORE),
      ),
    ).rejects.toThrow(OrderChangeNotQuotableError);
  });

  it("le plan du jour arrêté : refusé, même sur demande", async () => {
    const order = await placedOrder();
    const plans = gateOf(new FixedClosedPlans([DAY]));

    await expect(
      handlerFor(order, { plans }).execute(
        new QuoteOrderChangeRequestQuery("ord_1", "usr_1", MORE),
      ),
    ).rejects.toThrow(OrderChangeNotQuotableError);
  });

  it("inscrite au fournil : refusée avec la phrase du geste", async () => {
    const order = await placedOrder();

    await expect(
      handlerFor(order, { inscribedDay: DAY }).execute(
        new QuoteOrderChangeRequestQuery("ord_1", "usr_1", MORE),
      ),
    ).rejects.toThrow(OrderNotRevisableError);
  });

  it("réglée par carte : refusée comme la modification", async () => {
    const order = await placedOrder({ paymentStatus: "paid", stripePaymentIntentId: "pi_1" });

    await expect(
      handlerFor(order).execute(new QuoteOrderChangeRequestQuery("ord_1", "usr_1", MORE)),
    ).rejects.toThrow(CardOrderNotRevisableError);
  });

  it("le mur : un client sans accès à la société ne la trouve pas (404)", async () => {
    const order = await placedOrder();

    await expect(
      handlerFor(order, { role: null }).execute(
        new QuoteOrderChangeRequestQuery("ord_1", "usr_1", MORE),
      ),
    ).rejects.toThrow(OrderNotFoundError);
  });
});
