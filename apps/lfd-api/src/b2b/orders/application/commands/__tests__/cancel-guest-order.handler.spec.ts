import { GuestCancellationLinkNotFoundError } from "../../../domain/errors/customer-cancellation-errors.js";
import { OrderCancelledEvent } from "../../../domain/events/order-cancelled.event.js";
import { CancelGuestOrderCommand } from "../cancel-guest-order.command.js";
import { CancelGuestOrderHandler } from "../cancel-guest-order.handler.js";
import { customerScene, type CustomerScene } from "./customer-cancellation-scene.js";

/**
 * L'annulation par l'invité (plan, C6.4) : le jeton vérifié AVANT toute
 * lecture, le même 404 pour tout lien qui ne mène nulle part, S3, puis le
 * chemin commun. Dates relatives à `NOW`, l'horloge figée de la scène.
 */
const NOW = new Date(Date.UTC(2030, 0, 10, 9));
const SERVICE_DAY = "2030-01-15";
const GUEST = { hasAccount: false, active: true };

function handlerOf(options: Partial<CustomerScene> = {}) {
  const scene = customerScene({
    now: NOW,
    order: { serviceDay: SERVICE_DAY },
    customer: { serviceDay: SERVICE_DAY, buyer: GUEST, placedAt: NOW },
    settings: { openToB2c: true, hoursBefore: 24 },
    ...options,
  });
  return {
    ...scene,
    handler: new CancelGuestOrderHandler(scene.links, scene.cancellation, scene.clock),
  };
}

const confirm = (token: string, orderId = "ord_1") =>
  new CancelGuestOrderCommand(orderId, token, undefined, "Plus besoin");

describe("CancelGuestOrderHandler", () => {
  it("le bon jeton annule, l'auteur est `guest` et c'est la fiche de l'invité", async () => {
    const scene = handlerOf();

    await scene.handler.execute(confirm(scene.signer.sign("ord_1")));

    const fact = scene.durable.facts[0];
    expect(fact).toBeDefined();
    const event = OrderCancelledEvent.fromPayload(fact?.payload ?? {});
    expect(event.cancelledByKind).toBe("guest");
    expect(event.cancelledByUserId).toBe("usr_1");
    expect(event.reason).toBe("Plus besoin");
  });

  it.each([
    ["un jeton faux", "faux", "ord_1"],
    ["le jeton d'une autre commande", "sig-ord_2", "ord_1"],
    ["une commande inconnue, au jeton valide", "sig-ord_9", "ord_9"],
  ])("%s → le même 404, sans toucher le noyau", async (_label, token, orderId) => {
    const scene = handlerOf();

    await expect(scene.handler.execute(confirm(token, orderId))).rejects.toBeInstanceOf(
      GuestCancellationLinkNotFoundError,
    );
    expect(scene.trace).toEqual([]);
  });

  it("un jeton faux ne lit même pas la commande", async () => {
    const scene = handlerOf();

    await expect(scene.handler.execute(confirm("faux"))).rejects.toThrow();
    expect(scene.customers.reads).toEqual([]);
  });

  it("la commande d'une société, même au jeton valide → 404", async () => {
    const scene = handlerOf({ customer: { companyId: "co_1", buyer: GUEST, placedAt: NOW } });

    await expect(scene.handler.execute(confirm("sig-ord_1"))).rejects.toBeInstanceOf(
      GuestCancellationLinkNotFoundError,
    );
  });

  it("au-delà de 90 jours après le retrait → le même 404", async () => {
    const scene = handlerOf({
      customer: { serviceDay: "2029-09-01", buyer: GUEST, placedAt: NOW },
    });

    await expect(scene.handler.execute(confirm("sig-ord_1"))).rejects.toBeInstanceOf(
      GuestCancellationLinkNotFoundError,
    );
  });

  it("S3 : la fiche est devenue un compte → « connectez-vous »", async () => {
    const scene = handlerOf({
      customer: {
        serviceDay: SERVICE_DAY,
        buyer: { hasAccount: true, active: true },
        placedAt: NOW,
      },
    });

    await expect(scene.handler.execute(confirm("sig-ord_1"))).rejects.toMatchObject({
      code: "orders.customer_cancel.account_required",
    });
    expect(scene.trace).toEqual([]);
  });

  it("S3 : la fiche est désactivée → « contactez la boutique »", async () => {
    const scene = handlerOf({
      customer: {
        serviceDay: SERVICE_DAY,
        buyer: { hasAccount: false, active: false },
        placedAt: NOW,
      },
    });

    await expect(scene.handler.execute(confirm("sig-ord_1"))).rejects.toMatchObject({
      code: "orders.customer_cancel.account_disabled",
    });
  });

  it("P1 s'applique à l'invité : réglage fermé → `closed`", async () => {
    const scene = handlerOf({ settings: { openToB2c: false } });

    await expect(scene.handler.execute(confirm("sig-ord_1"))).rejects.toMatchObject({
      code: "orders.customer_cancel.closed",
    });
  });
});
