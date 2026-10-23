import type { OrderRevisionQuoteView } from "@lfd/contracts";

import { CustomerRequestNotFoundError } from "../../../domain/errors/contact-errors.js";
import { ChangedOrderNotFoundError } from "../../../domain/errors/order-change-errors.js";
import { LATER, orderChange } from "../../../domain/__tests__/request-fixtures.js";
import { MemoryRequests, VisibleOrders } from "../../commands/__tests__/contact-doubles.js";
import { FixedQuoter, PendingChanges } from "../../commands/__tests__/order-change-doubles.js";
import { GetMyOrderChangeRequestHandler } from "../get-my-order-change-request.handler.js";
import { GetMyOrderChangeRequestQuery } from "../get-my-order-change-request.query.js";
import { QuoteOrderChangeHandler } from "../quote-order-change.handler.js";
import { QuoteOrderChangeQuery } from "../quote-order-change.query.js";

const QUOTE: OrderRevisionQuoteView = {
  revision: 1,
  lines: [],
  subtotalCents: 0,
  discountCents: 0,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  voucherDiscountCents: 0,
  vatCents: 0,
  totalCents: 0,
  previousTotalCents: 0,
  differenceCents: 0,
  changes: ["lines"],
};

/** Les lectures de la demande de modification (M4) : l'écart pour l'équipe, l'état pour le client. */
describe("QuoteOrderChangeHandler", () => {
  it("rend le devis de l'équipe sur la commande de la demande", async () => {
    const quoter = new FixedQuoter(QUOTE);
    const view = await new QuoteOrderChangeHandler(
      new MemoryRequests([orderChange()]),
      quoter,
    ).execute(new QuoteOrderChangeQuery("q1", "staff_1"));
    expect(view).toBe(QUOTE);
    expect(quoter.asked).toEqual(["o1 staff_1"]);
  });

  it("ne chiffre pas une demande déjà répondue, ni une demande inconnue", async () => {
    const answered = orderChange();
    answered.recordChangeApplied(2, { staffUserId: "s", name: "", role: "" }, LATER);
    const quoter = new FixedQuoter(QUOTE);
    await expect(
      new QuoteOrderChangeHandler(new MemoryRequests([answered]), quoter).execute(
        new QuoteOrderChangeQuery("q1", "staff_1"),
      ),
    ).rejects.toThrow("déjà traitée");
    await expect(
      new QuoteOrderChangeHandler(new MemoryRequests(), quoter).execute(
        new QuoteOrderChangeQuery("q404", "staff_1"),
      ),
    ).rejects.toThrow(CustomerRequestNotFoundError);
    expect(quoter.asked).toEqual([]);
  });
});

describe("GetMyOrderChangeRequestHandler", () => {
  it("hors du mur du client : 404, sans rien dire de la demande", async () => {
    await expect(
      new GetMyOrderChangeRequestHandler(new VisibleOrders({}), new PendingChanges()).execute(
        new GetMyOrderChangeRequestQuery("o1", "u1"),
      ),
    ).rejects.toThrow(ChangedOrderNotFoundError);
  });

  it("dans son mur : la dernière demande, ou `null`", async () => {
    const view = await new GetMyOrderChangeRequestHandler(
      new VisibleOrders({
        o1: { id: "o1", number: "CMD-0001", companyId: null, fulfilled: false, site: null },
      }),
      new PendingChanges(),
    ).execute(new GetMyOrderChangeRequestQuery("o1", "u1"));
    expect(view).toEqual({ request: null });
  });
});
