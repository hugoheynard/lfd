import { InvalidInvoicePaymentTermsError } from "../../errors/invoice-issuance-errors.js";
import {
  EARLY_PAYMENT_DISCOUNT_MAX_LENGTH,
  InvoicePaymentTerms,
  LATE_PENALTY_RATE_MAX_BASIS_POINTS,
  LATE_PENALTY_RATE_MIN_BASIS_POINTS,
  RECOVERY_INDEMNITY_MAX_CENTS,
  RECOVERY_INDEMNITY_MIN_CENTS,
} from "../invoice-payment-terms.js";

const FULL = {
  latePenaltyRateBasisPoints: 1_415,
  recoveryIndemnityCents: 4_000,
  earlyPaymentDiscount: "néant",
};

describe("InvoicePaymentTerms", () => {
  it("vide, tout est à renseigner — et nommé", () => {
    expect(InvoicePaymentTerms.empty().missing()).toEqual([
      "le taux des pénalités de retard",
      "l'indemnité forfaitaire de recouvrement",
      "les conditions d'escompte pour paiement anticipé",
    ]);
  });

  it("complètes, il ne manque rien", () => {
    expect(InvoicePaymentTerms.create(FULL).missing()).toEqual([]);
  });

  it("accepte les bornes, refuse juste à côté", () => {
    for (const rate of [LATE_PENALTY_RATE_MIN_BASIS_POINTS, LATE_PENALTY_RATE_MAX_BASIS_POINTS]) {
      expect(
        InvoicePaymentTerms.create({ ...FULL, latePenaltyRateBasisPoints: rate })
          .latePenaltyRateBasisPoints,
      ).toBe(rate);
    }
    for (const rate of [0, LATE_PENALTY_RATE_MAX_BASIS_POINTS + 1, 14.15]) {
      expect(() =>
        InvoicePaymentTerms.create({ ...FULL, latePenaltyRateBasisPoints: rate }),
      ).toThrow(InvalidInvoicePaymentTermsError);
    }
    for (const cents of [RECOVERY_INDEMNITY_MIN_CENTS, RECOVERY_INDEMNITY_MAX_CENTS]) {
      expect(
        InvoicePaymentTerms.create({ ...FULL, recoveryIndemnityCents: cents })
          .recoveryIndemnityCents,
      ).toBe(cents);
    }
    for (const cents of [40, RECOVERY_INDEMNITY_MIN_CENTS - 1, RECOVERY_INDEMNITY_MAX_CENTS + 1]) {
      expect(() => InvoicePaymentTerms.create({ ...FULL, recoveryIndemnityCents: cents })).toThrow(
        InvalidInvoicePaymentTermsError,
      );
    }
  });

  it("nomme le champ et l'unité dans le refus", () => {
    expect(() => InvoicePaymentTerms.create({ ...FULL, recoveryIndemnityCents: 40 })).toThrow(
      /Indemnité forfaitaire de recouvrement : .*40 € = 4000/u,
    );
  });

  it("rogne l'escompte, rend « à renseigner » un texte blanc, refuse un paragraphe", () => {
    expect(
      InvoicePaymentTerms.create({ ...FULL, earlyPaymentDiscount: "  néant " })
        .earlyPaymentDiscount,
    ).toBe("néant");
    expect(
      InvoicePaymentTerms.create({ ...FULL, earlyPaymentDiscount: "   " }).earlyPaymentDiscount,
    ).toBeNull();
    expect(() =>
      InvoicePaymentTerms.create({
        ...FULL,
        earlyPaymentDiscount: "x".repeat(EARLY_PAYMENT_DISCOUNT_MAX_LENGTH + 1),
      }),
    ).toThrow(InvalidInvoicePaymentTermsError);
  });

  it("chaque mention est indépendante : une seule renseignée laisse les deux autres manquer", () => {
    const terms = InvoicePaymentTerms.create({
      latePenaltyRateBasisPoints: null,
      recoveryIndemnityCents: 4_000,
      earlyPaymentDiscount: null,
    });
    expect(terms.missing()).toHaveLength(2);
    expect(terms.equals(InvoicePaymentTerms.create({ ...FULL }))).toBe(false);
    expect(InvoicePaymentTerms.create(FULL).equals(InvoicePaymentTerms.create(FULL))).toBe(true);
  });
});
