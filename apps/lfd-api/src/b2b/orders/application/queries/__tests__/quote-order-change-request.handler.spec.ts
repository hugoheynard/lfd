import { OrderInscriptionReader } from "../../../../../production/channels/commerce/index.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { RevisableOrder } from "../../../domain/entities/order-revision.js";
import { OrderChangeNotQuotableError } from "../../../domain/errors/order-change-quote-errors.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  CardOrderNotRevisableError,
  OrderNotRevisableError,
} from "../../../domain/errors/order-revision-errors.js";
import type { OrderPlanGate } from "../../services/order-plan-gate.service.js";
import { OrderRevisabilityReading } from "../../services/order-revisability-reading.js";
import { RevisionWall } from "../../services/revision-wall.js";
import { FixedClosedPlans, gateOf } from "../../commands/__tests__/plan-doubles.js";
import {
  AFTER_CUTOFF,
  content,
  DAY,
  FixedRevisableOrders,
  NOW,
  OneRoleAccess,
  placedOrder,
  revisingAt,
} from "../../commands/__tests__/revision-scene.js";
import { QuoteOrderChangeRequestHandler } from "../quote-order-change-request.handler.js";
import { QuoteOrderChangeRequestQuery } from "../quote-order-change-request.query.js";

/**
 * **Le devis d'une demande de modification** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, §14) — ouvert au
 * seul « trop tard », derrière le mur du client, chiffré par la MÊME
 * recomposition que la modification. Instants de la scène, horloge FIXE.
 */

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
  } = {},
): QuoteOrderChangeRequestHandler {
  const orders = new FixedRevisableOrders(order);
  const revising = revisingAt(
    new FixedClock(options.now ?? AFTER_CUTOFF),
    options.plans === undefined ? {} : { plans: options.plans },
  );
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
