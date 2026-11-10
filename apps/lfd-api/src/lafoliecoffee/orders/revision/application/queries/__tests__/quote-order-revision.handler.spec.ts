import { FixedClock } from "../../../../../../platform/time/fixed-clock.js";
import { CardOrderNotRevisableError } from "../../../domain/errors/order-revision-errors.js";
import { RevisionLosesBasketDiscountError } from "../../../domain/errors/revision-price-errors.js";
import type { RevisableDiscount } from "../../../../domain/services/basket-discount-replay.js";
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
 * **Le devis de révision** (voir `documentation/commandes/modification/modifier-une-commande.md`,
 * § 2.2 « Le chemin d'une modification ») : la même recomposition que la modification, l'écart, la révision à
 * renvoyer — et un panier intact se chiffre sans refus.
 */

const CUSTOMER = { kind: "customer", userId: "usr_1" } as const;

function handlerFor(order: RevisableOrder): QuoteOrderRevisionHandler {
  return new QuoteOrderRevisionHandler(
    new RevisionWall(new FixedRevisableOrders(order), new OneRoleAccess("orders")),
    revisingAt(new FixedClock(NOW)),
    new FixedClock(NOW),
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

  it("refuse comme la modification une commande dont la carte est attendue", async () => {
    const order = await placedOrder({ paymentStatus: "pending", stripePaymentIntentId: "pi_1" });

    await expect(
      handlerFor(order).execute(new QuoteOrderRevisionQuery("ord_1", CUSTOMER, content())),
    ).rejects.toThrow(CardOrderNotRevisableError);
  });

  describe("plan S2, R3 — le devis annonce le règlement", () => {
    const MORE = content({ lines: [{ sku: "VIE-001", quantity: 20 }] });
    const LESS = content({ lines: [{ sku: "VIE-001", quantity: 5 }] });
    const paid = () => placedOrder({ paymentStatus: "paid", stripePaymentIntentId: "pi_1" });
    const STAFF = { kind: "staff", staffId: "stf_1" } as const;

    it("une hausse sur une carte payée : le complément à payer, l'écart du devis", async () => {
      const order = await paid();

      const quote = await handlerFor(order).execute(
        new QuoteOrderRevisionQuery("ord_1", CUSTOMER, MORE),
      );

      expect(quote.differenceCents).toBeGreaterThan(0);
      expect(quote.settlement).toEqual({
        kind: "card_complement",
        complementCents: quote.differenceCents,
      });
    });

    it("plan S1, R12 : une baisse se rend, un total égal se règle comme la commande", async () => {
      const order = await paid();
      const handler = handlerFor(order);

      const lower = await handler.execute(new QuoteOrderRevisionQuery("ord_1", CUSTOMER, LESS));
      const same = await handler.execute(new QuoteOrderRevisionQuery("ord_1", CUSTOMER, content()));

      expect(lower.differenceCents).toBeLessThan(0);
      expect(lower.settlement).toEqual({
        kind: "card_refund",
        refundCents: -lower.differenceCents,
      });
      expect(same.settlement).toEqual({ kind: "as_placed" });
    });

    it("R15 : la hausse composée par l'équipe n'a pas de chemin, et le devis le dit", async () => {
      const quote = await handlerFor(await paid()).execute(
        new QuoteOrderRevisionQuery("ord_1", STAFF, MORE),
      );

      expect(quote.settlement).toEqual({
        kind: "card_not_revisable",
        reason: "increase_by_staff",
      });
    });

    it("une commande au compte : réglée comme elle", async () => {
      const quote = await handlerFor(await placedOrder()).execute(
        new QuoteOrderRevisionQuery("ord_1", CUSTOMER, MORE),
      );

      expect(quote.settlement).toEqual({ kind: "as_placed" });
    });
  });

  describe("les refus de prix, rendus au lieu d'être levés (plan des remises acquises, § 10.4)", () => {
    it("une ligne dont le prix a changé : le refus et ses deux prix, la ligne au prix figé", async () => {
      const placed = await placedOrder();
      const order = {
        ...placed,
        lines: placed.lines.map((line) => ({ ...line, unitPriceMillicents: 180_000 })),
      };

      const quote = await handlerFor(order).execute(
        new QuoteOrderRevisionQuery(
          "ord_1",
          CUSTOMER,
          content({ lines: [{ sku: "VIE-001", quantity: 12 }] }),
        ),
      );

      expect(quote.lines).toEqual([
        expect.objectContaining({
          sku: "VIE-001",
          unitPriceMillicents: 180_000,
          refusal: {
            kind: "price_changed",
            frozen: { unitPriceMillicents: 180_000, vatRate: 5.5, unitPriceTtcCents: null },
            current: { unitPriceMillicents: 200_000, vatRate: 5.5, unitPriceTtcCents: null },
          },
        }),
      ]);
      expect(quote.discountRefusals).toEqual([]);
    });

    it("une remise à seuil quittée : le devis la montre, la modification la refuse", async () => {
      const label = { fr: "Dès 10", en: "From 10", it: "Da 10" };
      const fromTen: RevisableDiscount = {
        orderDiscountId: "od_1",
        promotionId: "promo_des_10",
        adjustment: { mode: "percent", bp: 1_000 },
        label: label.fr,
        servedLabel: label,
        coveredSkus: ["VIE-001"],
        amountCents: 200,
        amountTtcCents: null,
        terms: {
          cumulative: false,
          minQuantity: 10,
          pickup: "all",
          delivery: "none",
          origin: "placed",
          hours: null,
        },
      };
      const order = { ...(await placedOrder()), activeDiscounts: [fromTen] };
      const smaller = content({ lines: [{ sku: "VIE-001", quantity: 1 }] });

      const quote = await handlerFor(order).execute(
        new QuoteOrderRevisionQuery("ord_1", CUSTOMER, smaller),
      );

      expect(quote.discountRefusals).toEqual([
        { kind: "below_threshold", label, minQuantity: 10, sku: "VIE-001", quantity: 1 },
      ]);
      expect(quote.lines[0]?.refusal).toBeNull();
      await expect(
        revisingAt(new FixedClock(NOW)).compose(order, smaller, CUSTOMER, {
          requireChange: true,
          decidedAt: NOW,
        }),
      ).rejects.toBeInstanceOf(RevisionLosesBasketDiscountError);
    });
  });
});
