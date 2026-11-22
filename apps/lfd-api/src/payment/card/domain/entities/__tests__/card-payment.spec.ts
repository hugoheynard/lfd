import { CardPayment, type CardPaymentAttachment } from "../card-payment.js";
import {
  CardPaymentTransitionRefusedError,
  InvalidPaymentAmountError,
  InvalidPaymentSubjectError,
  MissingProviderRefError,
} from "../../errors/card-payment-errors.js";
import {
  CARD_PAYMENT_STATES,
  type CardPaymentState,
} from "../../value-objects/card-payment-state.js";
import { PaymentAccount } from "../../value-objects/payment-account.js";
import { PaymentSubject } from "../../value-objects/payment-subject.js";

/** Comparées entre elles seulement : aucune n'est confrontée à l'horloge. */
const ATTACHED_AT = new Date("2030-01-10T09:00:00.000Z");
const PAID_AT = new Date("2030-01-10T09:05:00.000Z");

function attachment(overrides: Partial<CardPaymentAttachment> = {}): CardPaymentAttachment {
  return {
    id: "pay_1",
    subject: PaymentSubject.of("order", "ord_1"),
    account: PaymentAccount.of("lfc-stripe"),
    providerRef: "pi_1",
    role: "first",
    amountCents: 2_340,
    at: ATTACHED_AT,
    ...overrides,
  };
}

/** Un paiement posé dans l'état voulu, par la factory qui adopte. */
function inState(state: CardPaymentState): CardPayment {
  return CardPayment.adopt(attachment(), state);
}

/**
 * Les six transitions du §3.4 — la même liste que le déclencheur
 * `payment_guard` de la migration `20261109030000_…`.
 */
const ALLOWED: readonly (readonly [CardPaymentState, CardPaymentState])[] = [
  ["pending", "paid"],
  ["pending", "failed"],
  ["failed", "paid"],
  ["pending", "closed"],
  ["failed", "closed"],
  ["closed", "paid"],
];

const PAIRS = CARD_PAYMENT_STATES.flatMap((from) =>
  CARD_PAYMENT_STATES.map((to) => [from, to] as const),
);

describe("CardPayment — la machine (toutes les paires)", () => {
  it.each(PAIRS)("%s → %s", (from, to) => {
    const expected =
      from === to
        ? "replay"
        : ALLOWED.some(([a, b]) => a === from && b === to)
          ? "transition"
          : "refused";
    expect(inState(from).moveTo(to)).toBe(expected);
  });
});

describe("CardPayment.attach", () => {
  it("naît `pending`, sans instant d'encaissement", () => {
    const payment = CardPayment.attach(attachment());
    expect(payment.state).toBe("pending");
    expect(payment.paidAt).toBeNull();
    expect(payment.toPersistence()).toEqual({
      id: "pay_1",
      subjectType: "order",
      subjectId: "ord_1",
      account: "lfc-stripe",
      providerRef: "pi_1",
      role: "first",
      amountCents: 2_340,
      state: "pending",
      createdAt: ATTACHED_AT,
      paidAt: null,
    });
  });

  it.each([0, -5, 12.5, Number.NaN])("refuse le montant %p", (amountCents) => {
    expect(() => CardPayment.attach(attachment({ amountCents }))).toThrow(
      InvalidPaymentAmountError,
    );
  });

  it("refuse une référence vide", () => {
    expect(() => CardPayment.attach(attachment({ providerRef: "  " }))).toThrow(
      MissingProviderRefError,
    );
  });
});

describe("CardPayment.adopt", () => {
  it("naît à l'état déclaré ; encaissé, à l'instant de l'adoption", () => {
    const payment = CardPayment.adopt(attachment(), "paid");
    expect(payment.state).toBe("paid");
    expect(payment.paidAt).toEqual(ATTACHED_AT);
  });

  it("naît fermé sans instant d'encaissement", () => {
    expect(CardPayment.adopt(attachment(), "closed").paidAt).toBeNull();
  });
});

describe("CardPayment.markPaid", () => {
  it.each<CardPaymentState>(["pending", "failed", "closed"])("depuis %s : encaissé", (from) => {
    const payment = inState(from);
    expect(payment.markPaid(PAID_AT)).toBe(true);
    expect(payment.state).toBe("paid");
    expect(payment.paidAt).toEqual(PAID_AT);
  });

  it("un rejeu ne change rien, l'instant d'origine reste", () => {
    const payment = inState("paid");
    expect(payment.markPaid(PAID_AT)).toBe(false);
    expect(payment.paidAt).toEqual(ATTACHED_AT);
  });
});

describe("CardPayment.markFailed", () => {
  it("pending → failed", () => {
    const payment = inState("pending");
    expect(payment.markFailed()).toBe(true);
    expect(payment.state).toBe("failed");
  });

  it("un refus rejoué ne change rien", () => {
    expect(inState("failed").markFailed()).toBe(false);
  });

  it.each<CardPaymentState>(["paid", "closed"])("refuse depuis %s", (from) => {
    expect(() => inState(from).markFailed()).toThrow(CardPaymentTransitionRefusedError);
  });
});

describe("CardPayment.close", () => {
  it.each<CardPaymentState>(["pending", "failed"])("%s → closed", (from) => {
    const payment = inState(from);
    expect(payment.close()).toBe(true);
    expect(payment.state).toBe("closed");
  });

  it("déjà fermé : rien", () => {
    expect(inState("closed").close()).toBe(false);
  });

  it("refuse un paiement encaissé : l'argent se rend par un remboursement", () => {
    expect(() => inState("paid").close()).toThrow(CardPaymentTransitionRefusedError);
  });
});

describe("CardPayment.catchUp — en avant seulement", () => {
  it("avance pending → paid et pose l'instant", () => {
    const payment = inState("pending");
    expect(payment.catchUp("paid", PAID_AT)).toBe("advanced");
    expect(payment.paidAt).toEqual(PAID_AT);
  });

  it("avance failed → closed", () => {
    const payment = inState("failed");
    expect(payment.catchUp("closed", PAID_AT)).toBe("advanced");
    expect(payment.state).toBe("closed");
  });

  it("dit `in_step` quand ils s'accordent", () => {
    expect(inState("failed").catchUp("failed", PAID_AT)).toBe("in_step");
  });

  it.each<[CardPaymentState, CardPaymentState]>([
    ["paid", "failed"],
    ["paid", "pending"],
    ["failed", "pending"],
    ["closed", "failed"],
  ])("ne recule jamais : %s vu %s est un écart, la ligne ne bouge pas", (from, target) => {
    const payment = inState(from);
    expect(payment.catchUp(target, PAID_AT)).toBe("diverged");
    expect(payment.state).toBe(from);
  });
});

describe("CardPayment.rehydrate", () => {
  it("relit ce que toPersistence a écrit", () => {
    const written = inState("paid").toPersistence();
    expect(CardPayment.rehydrate(written).toPersistence()).toEqual(written);
  });

  it("revalide le sujet", () => {
    const row = { ...inState("pending").toPersistence(), subjectType: "Order" };
    expect(() => CardPayment.rehydrate(row)).toThrow(InvalidPaymentSubjectError);
  });
});
