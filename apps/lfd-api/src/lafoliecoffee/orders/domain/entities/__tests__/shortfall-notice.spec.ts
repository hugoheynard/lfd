import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";
import { ShortfallCustomerAlreadyNotifiedError } from "../../errors/shortfall-letter-errors.js";
import { ShortfallNotice } from "../shortfall-notice.js";

// Instants comparés entre eux, jamais à l'horloge.
const SENT_AT = new Date(5_000);

const fresh = (): ShortfallNotice =>
  ShortfallNotice.fromSnapshot({
    decisionId: "dec_1",
    orderId: "ord_1",
    reference: "ORD-0001",
    notifiedAt: null,
    notifiedBy: null,
  });

describe("ShortfallNotice — le client prévenu, une fois par décision (E6d)", () => {
  it("trace l'instant et l'auteur de l'envoi", () => {
    const notice = fresh();

    notice.notify(SENT_AT, "staff_1");

    expect(notice.toSnapshot()).toMatchObject({ notifiedAt: SENT_AT, notifiedBy: "staff_1" });
  });

  it("porte une clé d'idempotence par décision", () => {
    expect(fresh().letterKey).toBe("order-shortfall:dec_1");
  });

  it("refuse un second envoi, en 409 nommé, sans changer la trace", () => {
    const notice = fresh();
    notice.notify(SENT_AT, "staff_1");

    expect(() => notice.notify(new Date(6_000), "staff_2")).toThrow(
      ShortfallCustomerAlreadyNotifiedError,
    );
    let refusal: unknown = null;
    try {
      notice.notify(new Date(6_000), "staff_2");
    } catch (error: unknown) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(BusinessError);
    expect(notice.toSnapshot()).toMatchObject({ notifiedAt: SENT_AT, notifiedBy: "staff_1" });
  });
});
