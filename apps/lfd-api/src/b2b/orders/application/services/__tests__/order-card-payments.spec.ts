import { OrderPaymentAwaitsAdoptionError } from "../../../domain/errors/order-payment-errors.js";
import { OrderCardPayments } from "../order-card-payments.js";
import {
  firstLine,
  FixedStandings,
  LinePositions,
  ScriptedCardPayments,
  standing,
  TracingUnitOfWork,
} from "./order-card-doubles.js";

function build(options: { readonly known?: boolean; readonly providerRef?: string | null } = {}) {
  const payments = new ScriptedCardPayments(
    new Map(options.known === true ? [["ord_1", firstLine()]] : []),
  );
  const row = standing({
    settled: "failed",
    providerRef: options.providerRef === undefined ? "pi_1" : options.providerRef,
  });
  const cards = new OrderCardPayments(
    payments,
    new LinePositions(payments),
    new FixedStandings([row]),
    new TracingUnitOfWork(payments.calls),
  );
  return { payments, cards };
}

/**
 * **Le premier paiement d'une commande, par le bloc `card-payment`** (plan
 * M2, §4.2, §4.6) : une commande d'avant le bloc n'a pas de ligne ; les
 * commandes l'adoptent, les lectures jamais.
 */
describe("OrderCardPayments — lire", () => {
  it("retrieveFirst relit le paiement de la LIGNE chez son prestataire", async () => {
    const { payments, cards } = build({ known: true });

    await expect(cards.retrieveFirst("ord_1")).resolves.toMatchObject({
      paymentId: "pay_1",
      clientSecret: "pi_1_secret",
      publishableKey: "pk_test",
    });
    expect(payments.calls).toEqual(["retrieve:pay_1"]);
  });

  it("🔴 retrieveFirst sans ligne : « à adopter », et RIEN n'est écrit — une lecture n'adopte pas", async () => {
    const { payments, cards } = build();

    await expect(cards.retrieveFirst("ord_1")).rejects.toBeInstanceOf(
      OrderPaymentAwaitsAdoptionError,
    );
    expect(payments.calls).toEqual([]);
  });
});

describe("OrderCardPayments — adopter", () => {
  it("une ligne connue est rendue telle quelle", async () => {
    const { payments, cards } = build({ known: true });

    await expect(cards.ensureFirst("ord_1")).resolves.toMatchObject({ paymentId: "pay_1" });
    expect(payments.calls).toEqual([]);
  });

  it("sans ligne : adoptée au total, en premier paiement, au règlement que la commande voit, dans une unité de travail", async () => {
    const { payments, cards } = build();

    await expect(cards.ensureFirst("ord_1")).resolves.toMatchObject({
      paymentId: "pay_adopted",
      providerRef: "pi_1",
    });
    expect(payments.calls).toEqual(["uow:begin", "adopt:ord_1:pi_1:2340:first:failed", "uow:end"]);
  });

  it("une commande sans intention n'a rien à adopter", async () => {
    const { payments, cards } = build({ providerRef: null });

    await expect(cards.ensureFirst("ord_1")).resolves.toBeNull();
    expect(payments.calls).toEqual([]);
  });
});

describe("OrderCardPayments — annuler", () => {
  it("annule le paiement de la ligne et rend l'issue du prestataire", async () => {
    const { payments, cards } = build({ known: true });
    payments.cancellation = { kind: "already_paid" };

    await expect(cards.cancelFirst("ord_1")).resolves.toEqual({ kind: "already_paid" });
    expect(payments.calls).toEqual(["cancel:pay_1"]);
  });

  it("une intention d'avant le bloc est adoptée D'ABORD, puis annulée hors de l'unité de travail", async () => {
    const { payments, cards } = build();

    await expect(cards.cancelFirst("ord_1")).resolves.toEqual({ kind: "cancelled" });
    expect(payments.calls).toEqual([
      "uow:begin",
      "adopt:ord_1:pi_1:2340:first:failed",
      "uow:end",
      "cancel:pay_adopted",
    ]);
  });

  it("ne lève jamais : une panne rend `unavailable` et sa raison — la clôture ne s'arrête pas", async () => {
    const { payments, cards } = build({ known: true });
    payments.failure = new Error("compte non configuré");

    await expect(cards.cancelFirst("ord_1")).resolves.toEqual({
      kind: "unavailable",
      reason: "compte non configuré",
    });
  });

  it("sans intention : `unavailable`, sans appel au prestataire", async () => {
    const { payments, cards } = build({ providerRef: null });

    await expect(cards.cancelFirst("ord_1")).resolves.toMatchObject({ kind: "unavailable" });
    expect(payments.calls).toEqual([]);
  });
});
