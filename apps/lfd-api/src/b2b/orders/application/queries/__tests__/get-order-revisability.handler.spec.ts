import { OrderInscriptionReader } from "../../../../../production/channels/commerce/index.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { RevisableOrder } from "../../../domain/entities/order-revision.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import type { OrderPlanGate } from "../../services/order-plan-gate.service.js";
import { OrderRevisabilityReading } from "../../services/order-revisability-reading.js";
import { RevisionWall } from "../../services/revision-wall.js";
import { FixedClosedPlans, gateOf } from "../../commands/__tests__/plan-doubles.js";
import {
  AFTER_CUTOFF,
  DAY,
  FixedRevisableOrders,
  NOW,
  OneRoleAccess,
  placedOrder,
  revisingAt,
} from "../../commands/__tests__/revision-scene.js";
import { GetOrderRevisabilityHandler } from "../get-order-revisability.handler.js";
import { GetOrderRevisabilityQuery } from "../get-order-revisability.query.js";

/**
 * **La modificabilité côté client** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, §6) — la règle du
 * geste, montée sur la recomposition RÉELLE de la scène : la frontière
 * commune, l'arrêt du plan, l'heure limite de la date actuelle, le mur.
 *
 * Les instants sont ceux de la scène, comparés à son horloge FIXE.
 */

/** Le fournil doublé : le jour où il a inscrit la commande, ou rien. */
class FixedInscription extends OrderInscriptionReader {
  constructor(private readonly day: string | null = null) {
    super();
  }

  inscribedDayOf(): Promise<string | null> {
    return Promise.resolve(this.day);
  }
}

/** L'heure limite d'article de la scène : la veille du jour de service, 18 h à Paris. */
const CUTOFF = "2026-11-09T17:00:00.000Z";

function handlerFor(
  order: RevisableOrder,
  options: {
    readonly now?: Date;
    readonly plans?: OrderPlanGate;
    readonly inscribedDay?: string | null;
    readonly role?: "orders" | null;
  } = {},
): GetOrderRevisabilityHandler {
  const orders = new FixedRevisableOrders(order);
  const revising = revisingAt(
    new FixedClock(options.now ?? NOW),
    options.plans === undefined ? {} : { plans: options.plans },
  );
  return new GetOrderRevisabilityHandler(
    new RevisionWall(
      orders,
      new OneRoleAccess(options.role === undefined ? "orders" : options.role),
    ),
    new OrderRevisabilityReading(
      orders,
      new FixedInscription(options.inscribedDay ?? null),
      revising,
    ),
  );
}

const query = new GetOrderRevisabilityQuery("usr_1", "ord_1");

describe("GetOrderRevisabilityHandler", () => {
  it("avant l'heure limite : modifiable jusqu'à elle, avec la révision courante", async () => {
    const order = await placedOrder({ revision: 4 });

    await expect(handlerFor(order).execute(query)).resolves.toEqual({
      revisability: { revisable: true, until: CUTOFF },
      revision: 4,
    });
  });

  it("après l'heure limite : trop tard, avec l'échéance passée", async () => {
    const order = await placedOrder();

    await expect(handlerFor(order, { now: AFTER_CUTOFF }).execute(query)).resolves.toMatchObject({
      revisability: { revisable: false, code: "too_late", until: CUTOFF },
    });
  });

  it("le plan du jour arrêté : en préparation", async () => {
    const order = await placedOrder();
    const plans = gateOf(new FixedClosedPlans([DAY]));

    await expect(handlerFor(order, { plans }).execute(query)).resolves.toMatchObject({
      revisability: { revisable: false, code: "in_preparation", until: null },
    });
  });

  it("inscrite au fournil : en préparation, avant toute question d'heure", async () => {
    const order = await placedOrder();

    await expect(
      handlerFor(order, { inscribedDay: DAY, now: AFTER_CUTOFF }).execute(query),
    ).resolves.toMatchObject({ revisability: { revisable: false, code: "in_preparation" } });
  });

  it("réglée par carte : le code qui dit pourquoi (lot M2)", async () => {
    const order = await placedOrder({ paymentStatus: "paid", stripePaymentIntentId: "pi_1" });

    await expect(handlerFor(order).execute(query)).resolves.toMatchObject({
      revisability: { revisable: false, code: "card_settled" },
    });
  });

  it("le mur : un client sans accès à la société ne la trouve pas (404)", async () => {
    const order = await placedOrder();

    await expect(handlerFor(order, { role: null }).execute(query)).rejects.toThrow(
      OrderNotFoundError,
    );
  });
});
