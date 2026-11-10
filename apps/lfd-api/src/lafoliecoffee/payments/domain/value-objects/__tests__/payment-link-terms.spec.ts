import {
  InvalidPaymentLinkAmountError,
  InvalidPaymentLinkLabelError,
  PaymentLinkAboveCapError,
} from "../../errors/payment-link-errors.js";
import { PaymentLinkTerms } from "../payment-link-terms.js";

describe("PaymentLinkTerms — ce qu'un lien demande", () => {
  it("accepte un montant entier positif et rogne le libellé", () => {
    const terms = PaymentLinkTerms.create(12_000, "  Régularisation août  ", null);
    expect(terms.amountCents).toBe(12_000);
    expect(terms.label).toBe("Régularisation août");
  });

  it.each([0, -100, 12.5, Number.NaN])("refuse le montant %p", (amount) => {
    expect(() => PaymentLinkTerms.create(amount, "Régularisation", null)).toThrow(
      InvalidPaymentLinkAmountError,
    );
  });

  it("refuse un libellé vide ou au-delà de 140 caractères", () => {
    expect(() => PaymentLinkTerms.create(100, "   ", null)).toThrow(InvalidPaymentLinkLabelError);
    expect(() => PaymentLinkTerms.create(100, "x".repeat(141), null)).toThrow(
      InvalidPaymentLinkLabelError,
    );
    expect(PaymentLinkTerms.create(100, "x".repeat(140), null).label).toHaveLength(140);
  });

  it("sans plafond, laisse passer n'importe quel montant positif", () => {
    expect(PaymentLinkTerms.create(99_999_999, "Gros solde", null).amountCents).toBe(99_999_999);
  });

  it("refuse au-delà du plafond, en le nommant, et accepte le plafond lui-même", () => {
    expect(PaymentLinkTerms.create(50_000, "Au plafond", 50_000).amountCents).toBe(50_000);
    expect(() => PaymentLinkTerms.create(50_001, "Au-delà", 50_000)).toThrow(
      PaymentLinkAboveCapError,
    );
    expect(() => PaymentLinkTerms.create(50_001, "Au-delà", 50_000)).toThrow(/500,00/u);
  });

  it("relit un lien ancien sans le confronter au plafond du jour", () => {
    // Un lien créé sous un plafond plus haut reste lisible quand il baisse.
    expect(PaymentLinkTerms.reconstitute(90_000, "Ancien").amountCents).toBe(90_000);
  });
});
