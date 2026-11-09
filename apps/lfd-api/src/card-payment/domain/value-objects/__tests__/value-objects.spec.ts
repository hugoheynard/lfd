import {
  InvalidPaymentAccountError,
  InvalidPaymentSubjectError,
} from "../../errors/card-payment-errors.js";
import {
  cardPaymentRoleOf,
  cardPaymentStateOf,
  isCardPaymentTransition,
} from "../card-payment-state.js";
import { PaymentAccount } from "../payment-account.js";
import { PaymentSubject } from "../payment-subject.js";

describe("PaymentSubject", () => {
  it("garde un type en minuscules et un identifiant", () => {
    const subject = PaymentSubject.of("revision_proposal", "rp_1");
    expect(subject.toString()).toBe("revision_proposal:rp_1");
    expect(subject.equals(PaymentSubject.of("revision_proposal", "rp_1"))).toBe(true);
    expect(subject.equals(PaymentSubject.of("order", "rp_1"))).toBe(false);
  });

  it.each([
    ["", "ord_1"],
    ["Order", "ord_1"],
    ["order-1", "ord_1"],
    ["order", ""],
    ["order", "   "],
  ])("refuse (%p, %p)", (type, id) => {
    expect(() => PaymentSubject.of(type, id)).toThrow(InvalidPaymentSubjectError);
  });
});

describe("PaymentAccount", () => {
  it.each(["lfc-stripe", "lfc-caisse-epargne", "acme2"])("admet %p", (name) => {
    expect(PaymentAccount.of(name).name).toBe(name);
  });

  it.each(["", "LFC-stripe", "lfc_stripe", "-lfc", "lfc-", "lfc--stripe", "../x"])(
    "refuse %p",
    (name) => {
      expect(() => PaymentAccount.of(name)).toThrow(InvalidPaymentAccountError);
    },
  );
});

describe("les valeurs écrites en base", () => {
  it("relit les états et rôles connus, et rien d'autre", () => {
    expect(cardPaymentStateOf("closed")).toBe("closed");
    expect(cardPaymentStateOf("created")).toBeNull();
    expect(cardPaymentRoleOf("complement")).toBe("complement");
    expect(cardPaymentRoleOf("second")).toBeNull();
  });

  it("`(x, x)` n'est pas une transition : c'est un rejeu", () => {
    expect(isCardPaymentTransition("paid", "paid")).toBe(false);
    expect(isCardPaymentTransition("closed", "paid")).toBe(true);
    expect(isCardPaymentTransition("paid", "closed")).toBe(false);
  });
});
