import { OrderTotalChangedError } from "../../../domain/errors/order-total-changed.error.js";
import { CardOrderNotRevisableError } from "../../../domain/errors/order-revision-errors.js";
import { ReviseOrderCommand } from "../revise-order.command.js";
import { content, placedOrder, reviseScene } from "./revision-scene.js";

/**
 * **Le total vu, sur toute modification** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.3 (R14), §2.7.2) :
 * la modification porte le TTC de son devis ; un écart d'un centime refuse
 * avant toute écriture, et le refus de règlement parle d'abord.
 */

const CUSTOMER = { kind: "customer", userId: "usr_1" } as const;
const MORE = content({ lines: [{ sku: "VIE-001", quantity: 20 }] });

describe("ReviseOrderHandler — le total vu (R14)", () => {
  it("refuse un total qui n'est plus celui du devis, nomme les deux, et n'écrit rien", async () => {
    const order = await placedOrder();
    const { handler, asSeen, trace, revisions, durable } = reviseScene(order);
    const seen = await asSeen("ord_1", CUSTOMER, 0, MORE);
    const stale = seen.expectedTotalCents - 1;

    const attempt = handler.execute(
      new ReviseOrderCommand("ord_1", CUSTOMER, 0, MORE, stale, "direct"),
    );

    await expect(attempt).rejects.toBeInstanceOf(OrderTotalChangedError);
    await expect(attempt).rejects.toMatchObject({
      code: "orders.total_changed",
      facts: { expectedTotalCents: stale, totalCents: seen.expectedTotalCents },
    });
    expect(trace).toEqual([]);
    expect(revisions.saved).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("passe quand le total envoyé est celui du devis", async () => {
    const order = await placedOrder();
    const { handler, asSeen, revisions } = reviseScene(order);

    const seen = await asSeen("ord_1", CUSTOMER, 0, MORE);

    const result = await handler.execute(seen);

    expect(revisions.saved).toHaveLength(1);
    expect(result.totalCents).toBe(seen.expectedTotalCents);
  });

  it("R15 : une commande carte est refusée pour son règlement, pas pour son total", async () => {
    const order = await placedOrder({ paymentStatus: "pending", stripePaymentIntentId: "pi_1" });
    const { handler, trace } = reviseScene(order);

    // Un total faux exprès : le règlement doit parler avant lui.
    const wrongTotal = order.totalCents + 1;
    await expect(
      handler.execute(new ReviseOrderCommand("ord_1", CUSTOMER, 0, MORE, wrongTotal, "direct")),
    ).rejects.toBeInstanceOf(CardOrderNotRevisableError);
    expect(trace).toEqual([]);
  });
});
