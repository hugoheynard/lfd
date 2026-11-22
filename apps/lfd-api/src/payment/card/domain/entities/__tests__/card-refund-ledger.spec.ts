import { CardRefundRejectedError } from "../../errors/card-refund-errors.js";
import { PaymentSubject } from "../../value-objects/payment-subject.js";
import {
  CardRefundLedger,
  type CardRefundLine,
  type CardRefundReport,
} from "../card-refund-ledger.js";

/** Les instants ne sont comparés qu'entre eux, jamais à l'horloge. */
const AT = new Date("2030-01-10T09:00:00.000Z");
const CHARGED = 2_340;

function ledger(lines: readonly CardRefundLine[] = []): CardRefundLedger {
  return CardRefundLedger.rehydrate({
    paymentId: "pay_1",
    subject: PaymentSubject.of("order", "ord_1"),
    account: "lfc-stripe",
    paymentRef: "pi_1",
    amountCents: CHARGED,
    paid: true,
    lines,
  });
}

function report(overrides: Partial<CardRefundReport> = {}): CardRefundReport {
  return {
    providerRef: "re_1",
    amountCents: 1_000,
    currency: "eur",
    status: "pending",
    refundedAt: AT,
    ...overrides,
  };
}

function line(overrides: Partial<CardRefundLine> = {}): CardRefundLine {
  return {
    id: "ref_1",
    requestId: "req_1",
    nature: "return",
    source: "provider",
    providerRef: "re_1",
    amountCents: 1_000,
    currency: "eur",
    status: "pending",
    refundedAt: AT,
    recordedAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function rejection(gesture: () => unknown): string | null {
  try {
    gesture();
    return null;
  } catch (error) {
    return error instanceof CardRefundRejectedError ? error.reason : "autre";
  }
}

describe("CardRefundLedger — le carnet d'un paiement (§3.4, G2)", () => {
  it("note un `re_…` neuf, attribué à sa demande, à insérer", () => {
    const carnet = ledger();

    const recording = carnet.record(
      report(),
      { requestId: "req_1", nature: "return" },
      "ref_1",
      AT,
    );

    expect(recording).toMatchObject({
      kind: "recorded",
      before: null,
      line: {
        id: "ref_1",
        requestId: "req_1",
        nature: "return",
        source: "provider",
        status: "pending",
      },
    });
    expect(carnet.toPersistence().created).toHaveLength(1);
    expect(carnet.inFlightLines()).toHaveLength(1);
  });

  it("est idempotent : le même statut rejoué ne change rien", () => {
    const carnet = ledger([line()]);

    expect(carnet.record(report(), null, "ref_x", AT)).toEqual({ kind: "unchanged" });
    expect(carnet.toPersistence()).toEqual({ created: [], updated: [] });
  });

  it("fait avancer un statut connu ; garde sa demande et sa nature", () => {
    const carnet = ledger([line()]);

    const recording = carnet.record(report({ status: "succeeded" }), null, "ref_x", AT);

    expect(recording).toMatchObject({
      kind: "recorded",
      before: "pending",
      line: { id: "ref_1", status: "succeeded", requestId: "req_1", nature: "return" },
    });
    expect(carnet.toPersistence().updated).toHaveLength(1);
    expect(carnet.succeededCents()).toBe(1_000);
    expect(carnet.remainderCents()).toBe(CHARGED - 1_000);
  });

  it("un statut qui recule est périmé — ignoré, pas refusé", () => {
    const carnet = ledger([line({ status: "succeeded" })]);

    expect(carnet.record(report({ status: "pending" }), null, "ref_x", AT)).toEqual({
      kind: "unchanged",
    });
  });

  it("🔴 l'inversion : `succeeded → failed` s'applique, et le reste remonte", () => {
    const carnet = ledger([line({ status: "succeeded" })]);

    const recording = carnet.record(report({ status: "failed" }), null, "ref_x", AT);

    expect(recording).toMatchObject({
      kind: "recorded",
      before: "succeeded",
      line: { status: "failed" },
    });
    expect(carnet.remainderCents()).toBe(CHARGED);
  });

  it.each<[string, () => CardRefundLedger, CardRefundReport, string]>([
    ["une autre devise", () => ledger(), report({ currency: "usd" }), "currency"],
    [
      "un cumul au-delà du montant encaissé",
      () => ledger([line({ status: "succeeded", amountCents: 2_000 })]),
      report({ providerRef: "re_2", amountCents: 500, status: "succeeded" }),
      "exceeds_charge",
    ],
    ["un montant changé", () => ledger([line()]), report({ amountCents: 999 }), "amount_changed"],
    [
      "`succeeded → canceled` (illégal chez le prestataire comme chez nous)",
      () => ledger([line({ status: "succeeded" })]),
      report({ status: "canceled" }),
      "reversed_after_success",
    ],
  ])("refuse %s — et n'écrit rien", (_, make, refused, reason) => {
    const carnet = make();

    expect(rejection(() => carnet.record(refused, null, "ref_x", AT))).toBe(reason);
    expect(carnet.toPersistence()).toEqual({ created: [], updated: [] });
  });

  it("le plafond tient au centime près : rendre EXACTEMENT l'encaissé passe", () => {
    const carnet = ledger([line({ status: "succeeded", amountCents: 2_000 })]);

    carnet.record(
      report({ providerRef: "re_2", amountCents: 340, status: "succeeded" }),
      null,
      "ref_2",
      AT,
    );

    expect(carnet.remainderCents()).toBe(0);
  });

  it("« rendu autrement » : une ligne `manual`, réussie, sans `re_…`, en euros — sous le même plafond", () => {
    const carnet = ledger();

    const manual = carnet.recordManual(
      { requestId: "req_1", nature: "return" },
      CHARGED,
      "ref_m",
      AT,
    );

    expect(manual).toMatchObject({
      source: "manual",
      providerRef: null,
      status: "succeeded",
      currency: "eur",
      refundedAt: AT,
    });
    expect(carnet.remainderCents()).toBe(0);
    expect(
      rejection(() =>
        carnet.recordManual({ requestId: "req_2", nature: "return" }, 1, "ref_n", AT),
      ),
    ).toBe("exceeds_charge");
  });
});
