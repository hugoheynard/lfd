import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  CustomerCancellationNotRecordedError,
  CustomerCancellationReasonCodeUnknownError,
  CustomerCancellationRefusedError,
} from "../../../domain/errors/customer-cancellation-errors.js";
import { OrderCancelledEvent } from "../../../domain/events/order-cancelled.event.js";
import { CancelOrderByCustomerCommand } from "../cancel-order-by-customer.command.js";
import { CancelOrderByCustomerHandler } from "../cancel-order-by-customer.handler.js";
import { customerScene, type CustomerScene } from "./customer-cancellation-scene.js";

/**
 * L'annulation par le client connecté (plan, C6.2, C6.3, C6.6) : le mur et
 * P1/P2 AVANT le noyau, le noyau staff à l'identique, ses refus traduits.
 *
 * Les dates sont relatives à `NOW`, l'horloge figée de la scène : aucune
 * n'est comparée au mur.
 */
const NOW = new Date(Date.UTC(2030, 0, 10, 9));
/** Le jour de service, cinq jours après `NOW`. */
const SERVICE_DAY = "2030-01-15";

function handlerOf(options: Partial<CustomerScene> = {}) {
  const scene = customerScene({
    now: NOW,
    order: { serviceDay: SERVICE_DAY },
    customer: { serviceDay: SERVICE_DAY },
    settings: { delayEnabled: true, hoursBefore: 24 },
    ...options,
  });
  const handler = new CancelOrderByCustomerHandler(
    scene.customers,
    scene.wall,
    scene.cancellation,
    scene.clock,
  );
  return { ...scene, handler };
}

const by = (userId: string, code?: string) =>
  new CancelOrderByCustomerCommand(userId, "ord_1", code, undefined);

function factOf(scene: { durable: { facts: readonly { payload: Record<string, unknown> }[] } }) {
  const fact = scene.durable.facts[0];
  if (fact === undefined) {
    throw new Error("aucun fait publié");
  }
  return OrderCancelledEvent.fromPayload(fact.payload);
}

describe("CancelOrderByCustomerHandler — le mur (C6.2)", () => {
  it("l'auteur d'une commande personnelle annule, et l'acteur va jusqu'au fait", async () => {
    const scene = handlerOf();

    await scene.handler.execute(by("usr_1", "wrong_date"));

    expect(scene.rows.records).toEqual([
      {
        cancelledBy: null,
        reason: null,
        cancelledAt: NOW,
        customer: { kind: "customer", userId: "usr_1", reasonCode: "wrong_date" },
      },
    ]);
    const event = factOf(scene);
    expect(event.cancelledByKind).toBe("customer");
    expect(event.cancelledByUserId).toBe("usr_1");
    expect(event.cancelledBy).toBeNull();
    expect(event.policy).toEqual({ hoursBefore: 24 });
  });

  it("un autre particulier reçoit 404, et le noyau n'est pas touché", async () => {
    const scene = handlerOf();

    await expect(scene.handler.execute(by("usr_9"))).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(scene.trace).toEqual([]);
    expect(scene.settings.reads).toBe(0);
  });

  it("commande d'une société : un non-membre (ou non accepté, ou société inactive) reçoit 404", async () => {
    const scene = handlerOf({ customer: { companyId: "co_1", serviceDay: SERVICE_DAY } });

    await expect(scene.handler.execute(by("usr_1"))).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(scene.trace).toEqual([]);
  });

  it("commande inconnue : 404", async () => {
    const scene = handlerOf({ customer: { orderId: "ord_autre" } });

    await expect(scene.handler.execute(by("usr_1"))).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("un motif hors liste est refusé avant toute lecture", async () => {
    const scene = handlerOf();

    await expect(scene.handler.execute(by("usr_1", "caprice"))).rejects.toBeInstanceOf(
      CustomerCancellationReasonCodeUnknownError,
    );
    expect(scene.customers.reads).toEqual([]);
  });
});

describe("CancelOrderByCustomerHandler — le délai P2 (C6.3)", () => {
  /**
   * Décision de Hugo du 2026-10-13 : il n'y a plus de réglage « fermé ». Sans
   * délai imposé, un particulier annule jusqu'à l'arrêt du plan de production,
   * comme un pro — même avec un délai de 168 h que P2 aurait refusé.
   */
  it("délai désactivé : un délai dépassé ne refuse rien, aucun délai figé", async () => {
    const scene = handlerOf({ settings: { delayEnabled: false, hoursBefore: 168 } });

    await scene.handler.execute(by("usr_1"));

    expect(factOf(scene).cancelledByUserId).toBe("usr_1");
    expect(factOf(scene).policy).toBeNull();
  });

  it("P2 : délai dépassé → `too_late`, la phrase dit jusqu'à quand", async () => {
    const scene = handlerOf({ settings: { delayEnabled: true, hoursBefore: 168 } });

    const refusal = scene.handler.execute(by("usr_1"));
    await expect(refusal).rejects.toBeInstanceOf(CustomerCancellationRefusedError);
    await expect(refusal).rejects.toMatchObject({
      code: "orders.customer_cancel.too_late",
      message: expect.stringContaining("jusqu'au 08/01 à 00:00") as unknown,
    });
    expect(scene.trace).toEqual([]);
  });

  it("un pro n'a pas de délai : même dépassé, il annule quand même", async () => {
    const scene = handlerOf({
      customer: { companyId: "co_1", serviceDay: SERVICE_DAY },
      members: ["usr_2:co_1"],
      settings: { delayEnabled: true, hoursBefore: 168 },
    });

    await scene.handler.execute(by("usr_2"));

    expect(scene.settings.reads).toBe(0);
    expect(factOf(scene).cancelledByUserId).toBe("usr_2");
    expect(factOf(scene).policy).toBeNull();
    expect(factOf(scene).cancelledFromPrincipal).toBeNull();
  });

  /** Lot C1 des sous-comptes (`plan-commandes-des-sites.md`, §7.9). */
  it("admis par le compte PRINCIPAL : le fait porte le principal, pour le courriel et le journal", async () => {
    const principal = { companyId: "co_alpes", name: "Groupe Alpes" };
    const scene = handlerOf({
      customer: { companyId: "co_site", serviceDay: SERVICE_DAY },
      principals: { "usr_9:co_site": principal },
    });

    await scene.handler.execute(by("usr_9"));

    expect(factOf(scene).cancelledByUserId).toBe("usr_9");
    expect(factOf(scene).cancelledFromPrincipal).toEqual(principal);
  });
});

describe("CancelOrderByCustomerHandler — les refus du noyau, traduits (C6.7)", () => {
  it("inscrite au fournil → `in_preparation`, sans nommer le fournil", async () => {
    const scene = handlerOf({ desk: "inscribed" });

    const refusal = scene.handler.execute(by("usr_1"));
    await expect(refusal).rejects.toMatchObject({ code: "orders.customer_cancel.in_preparation" });
    await expect(refusal).rejects.not.toMatchObject({
      message: expect.stringContaining("fournil") as unknown,
    });
  });

  it("déjà annulée → `already_cancelled`", async () => {
    const scene = handlerOf({ order: { status: "cancelled", serviceDay: SERVICE_DAY } });

    await expect(scene.handler.execute(by("usr_1"))).rejects.toMatchObject({
      code: "orders.customer_cancel.already_cancelled",
    });
  });

  it("Stripe en cours → `payment_in_progress`", async () => {
    const scene = handlerOf({ stripe: { kind: "in_progress" } });

    await expect(scene.handler.execute(by("usr_1"))).rejects.toMatchObject({
      code: "orders.customer_cancel.payment_in_progress",
    });
  });

  it("payée à l'instant → `paid_just_now`", async () => {
    const scene = handlerOf({ stripe: { kind: "already_paid" } });

    await expect(scene.handler.execute(by("usr_1"))).rejects.toMatchObject({
      code: "orders.customer_cancel.paid_just_now",
    });
  });

  it("Stripe injoignable → `not_recorded`, en 409", async () => {
    const scene = handlerOf({ stripe: { kind: "unavailable", reason: "timeout" } });

    await expect(scene.handler.execute(by("usr_1"))).rejects.toBeInstanceOf(
      CustomerCancellationRefusedError,
    );
  });

  it("Stripe fermé mais écriture ratée deux fois → `not_recorded`, en 500", async () => {
    const scene = handlerOf({ failures: 2 });

    await expect(scene.handler.execute(by("usr_1"))).rejects.toBeInstanceOf(
      CustomerCancellationNotRecordedError,
    );
  });

  it("un brouillon est un 404 pour un client", async () => {
    const scene = handlerOf({ order: { status: "draft", serviceDay: SERVICE_DAY } });

    await expect(scene.handler.execute(by("usr_1"))).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
