import {
  type CardPaymentRow,
  toDomain,
  UnknownCardPaymentValueError,
} from "../card-payment-rows.js";
import { chargedOf } from "../prisma-card-settlement.reader.js";

/** Comparées entre elles seulement. */
const AT = new Date("2030-01-10T09:00:00.000Z");

const ROW: CardPaymentRow = {
  id: "pay_1",
  subjectType: "order",
  subjectId: "ord_1",
  account: "lfc-stripe",
  providerRef: "pi_1",
  role: "first",
  amountCents: 2_340,
  state: "paid",
  createdAt: AT,
  paidAt: AT,
};

describe("toDomain", () => {
  it("relit la ligne telle qu'écrite", () => {
    expect(toDomain(ROW).toPersistence()).toEqual(ROW);
  });

  it.each([
    ["state", { state: "created" }],
    ["role", { role: "second" }],
  ])("refuse une valeur de %s que ce binaire ne connaît pas", (_, patch) => {
    expect(() => toDomain({ ...ROW, ...patch })).toThrow(UnknownCardPaymentValueError);
  });
});

describe("chargedOf", () => {
  it("ne compte que les paiements encaissés", () => {
    const line = {
      paymentId: "pay_1",
      account: "lfc-stripe",
      providerRef: "pi_1",
      role: "first" as const,
      amountCents: 1_000,
      paidAt: null,
    };
    expect(
      chargedOf([
        { ...line, state: "paid" },
        { ...line, paymentId: "pay_2", state: "paid", amountCents: 500 },
        { ...line, paymentId: "pay_3", state: "closed" },
        { ...line, paymentId: "pay_4", state: "failed" },
      ]),
    ).toBe(1_500);
  });

  it("rend 0 sans paiement", () => {
    expect(chargedOf([])).toBe(0);
  });
});
