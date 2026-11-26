import { InvalidCardPaymentLabelError } from "../../errors/card-payment-errors.js";
import { IntentLabel } from "../intent-label.js";

const DESCRIPTION = "LFD · La Folie Coffee boutique · paiement";

describe("IntentLabel — le libellé tel que le prestataire l'accepte", () => {
  it("garde la description et les clés de l'appelant", () => {
    const label = IntentLabel.of({
      description: `  ${DESCRIPTION} `,
      metadata: { app: "la-folie-coffee", channel: "shop", order_number: "2026-01234" },
    });

    expect(label.description).toBe(DESCRIPTION);
    expect(label.metadata).toEqual({
      app: "la-folie-coffee",
      channel: "shop",
      order_number: "2026-01234",
    });
  });

  it("refuse une description vide", () => {
    expect(() => IntentLabel.of({ description: "  ", metadata: {} })).toThrow(
      InvalidCardPaymentLabelError,
    );
  });

  it.each(["companyId", "lfd_order_id", "lfd_refund_request"])(
    "refuse la clé réservée au bloc « %s »",
    (key) => {
      expect(() => IntentLabel.of({ description: DESCRIPTION, metadata: { [key]: "x" } })).toThrow(
        InvalidCardPaymentLabelError,
      );
    },
  );

  it.each(["Order", "order-number", "1app", "", "a".repeat(41)])(
    "refuse la clé mal formée « %s »",
    (key) => {
      expect(() => IntentLabel.of({ description: DESCRIPTION, metadata: { [key]: "x" } })).toThrow(
        InvalidCardPaymentLabelError,
      );
    },
  );

  it("admet une clé de 40 caractères", () => {
    const key = "a".repeat(40);
    expect(IntentLabel.of({ description: DESCRIPTION, metadata: { [key]: "x" } }).metadata).toEqual(
      { [key]: "x" },
    );
  });

  it("admet 49 clés de l'appelant, `companyId` faisant la cinquantième", () => {
    const metadata = Object.fromEntries(
      Array.from({ length: 49 }, (_, index) => [`k${String(index)}`, "v"]),
    );
    expect(
      Object.keys(IntentLabel.of({ description: DESCRIPTION, metadata }).metadata),
    ).toHaveLength(49);
  });

  it("refuse une cinquantième clé de l'appelant", () => {
    const metadata = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [`k${String(index)}`, "v"]),
    );
    expect(() => IntentLabel.of({ description: DESCRIPTION, metadata })).toThrow(
      InvalidCardPaymentLabelError,
    );
  });

  it("borne une valeur à 500 caractères plutôt que de refuser le paiement", () => {
    const label = IntentLabel.of({ description: DESCRIPTION, metadata: { note: "x".repeat(600) } });
    expect(label.metadata["note"]).toHaveLength(500);
  });
});
