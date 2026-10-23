import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CardOrderNotRevisableError } from "../../../domain/errors/order-revision-errors.js";
import { RevisionWall } from "../../services/revision-wall.js";
import {
  content,
  FixedRevisableOrders,
  NOW,
  OneRoleAccess,
  placedOrder,
  revisingAt,
} from "../../commands/__tests__/revision-scene.js";
import type { RevisableOrder } from "../../../domain/entities/order-revision.js";
import { QuoteOrderRevisionHandler } from "../quote-order-revision.handler.js";
import { QuoteOrderRevisionQuery } from "../quote-order-revision.query.js";

/**
 * **Le devis de révision** (plan `documentation/commandes/plan-modifier-une-commande.md`,
 * M1) : la même recomposition que la modification, l'écart, la révision à
 * renvoyer — et un panier intact se chiffre sans refus.
 */

const CUSTOMER = { kind: "customer", userId: "usr_1" } as const;

function handlerFor(order: RevisableOrder): QuoteOrderRevisionHandler {
  return new QuoteOrderRevisionHandler(
    new RevisionWall(new FixedRevisableOrders(order), new OneRoleAccess("orders")),
    revisingAt(new FixedClock(NOW)),
  );
}

describe("QuoteOrderRevisionHandler", () => {
  it("chiffre la commande modifiée, dit l'écart et la révision sur laquelle il est calculé", async () => {
    const order = await placedOrder({ revision: 3 });

    const quote = await handlerFor(order).execute(
      new QuoteOrderRevisionQuery(
        "ord_1",
        CUSTOMER,
        content({
          lines: [
            { sku: "VIE-001", quantity: 20 },
            { sku: "PAI-001", quantity: 1 },
          ],
        }),
      ),
    );

    expect(quote.revision).toBe(3);
    expect(quote.previousTotalCents).toBe(order.totalCents);
    expect(quote.differenceCents).toBe(quote.totalCents - order.totalCents);
    expect(quote.lines.map((line) => [line.sku, line.priceFrozen])).toEqual([
      ["VIE-001", true],
      ["PAI-001", false],
    ]);
    expect(quote.changes).toEqual(["lines"]);
  });

  it("un panier intact se chiffre : écart nul, aucun changement, aucun refus", async () => {
    const order = await placedOrder();

    const quote = await handlerFor(order).execute(
      new QuoteOrderRevisionQuery("ord_1", CUSTOMER, content()),
    );

    expect(quote.differenceCents).toBe(0);
    expect(quote.changes).toEqual([]);
  });

  it("refuse comme la modification une commande payable par carte", async () => {
    const order = await placedOrder({ paymentStatus: "paid", stripePaymentIntentId: "pi_1" });

    await expect(
      handlerFor(order).execute(new QuoteOrderRevisionQuery("ord_1", CUSTOMER, content())),
    ).rejects.toThrow(CardOrderNotRevisableError);
  });
});
