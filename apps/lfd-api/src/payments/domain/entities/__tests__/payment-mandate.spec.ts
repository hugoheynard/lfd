import {
  MandateAcceptanceInFutureError,
  MandateNotRevocableError,
} from "../../errors/mandate-errors.js";
import {
  draftMandate,
  PaymentMandate,
  type MandateSnapshot,
  type RegisteredMandate,
} from "../payment-mandate.js";

const NOW = new Date("2026-08-11T10:00:00.000Z");

const REGISTRATION: RegisteredMandate = {
  stripeCustomerId: "cus_1",
  paymentMethodId: "pm_1",
  reference: "RUM-123",
  last4: "3000",
  bankCode: "BNPA",
  country: "FR",
  status: "active",
};

function snapshot(overrides: Partial<MandateSnapshot> = {}): MandateSnapshot {
  return {
    ...REGISTRATION,
    id: "mdt_1",
    companyId: "cmp_1",
    acceptedAt: new Date("2024-03-12T00:00:00.000Z"),
    revokedAt: null,
    proofStorageKey: null,
    proofFileName: null,
    ...overrides,
  };
}

describe("draftMandate — la date qu'on opposera", () => {
  it("accepte une signature ANCIENNE", () => {
    // Le cas central : on reprend un portefeuille dont les mandats papier ont
    // deux ans. Exiger une date récente rendrait la reprise impossible.
    const draft = draftMandate({
      companyId: "cmp_1",
      registration: REGISTRATION,
      acceptedAt: new Date("2024-03-12T00:00:00.000Z"),
      now: NOW,
    });

    expect(draft.acceptedAt.getFullYear()).toBe(2024);
    expect(draft.proofStorageKey).toBeNull();
  });

  it("refuse une signature dans le FUTUR", () => {
    // C'est la date qu'on présentera en contestation : une faute de frappe s'y
    // voit maintenant, ou devant la banque.
    expect(() =>
      draftMandate({
        companyId: "cmp_1",
        registration: REGISTRATION,
        acceptedAt: new Date("2026-08-12T00:00:00.000Z"),
        now: NOW,
      }),
    ).toThrow(MandateAcceptanceInFutureError);
  });

  it("ne porte AUCUNE coordonnée bancaire", () => {
    // Le contrat central du design : ce qu'on écrit ne permet à personne de
    // reconstituer un IBAN.
    const draft = draftMandate({
      companyId: "cmp_1",
      registration: REGISTRATION,
      acceptedAt: NOW,
      now: NOW,
    });

    expect(JSON.stringify(draft)).not.toMatch(/iban/iu);
    expect(draft.last4).toBe("3000");
  });
});

describe("PaymentMandate — prélever, ou ne plus prélever", () => {
  it("n'est débitable qu'ACTIF", () => {
    expect(PaymentMandate.reconstitute(snapshot()).debitable()).toBe(true);
    expect(PaymentMandate.reconstitute(snapshot({ status: "pending" })).debitable()).toBe(false);
    expect(PaymentMandate.reconstitute(snapshot({ status: "revoked" })).debitable()).toBe(false);
  });

  it("révoque en datant, et refuse de révoquer deux fois", () => {
    // La seconde révocation écraserait la date qui fait foi.
    const mandate = PaymentMandate.reconstitute(snapshot());

    mandate.revoke(NOW);

    expect(mandate.status).toBe("revoked");
    expect(mandate.toSnapshot().revokedAt).toEqual(NOW);
    expect(() => mandate.revoke(new Date("2026-09-01T00:00:00.000Z"))).toThrow(
      MandateNotRevocableError,
    );
    expect(mandate.toSnapshot().revokedAt).toEqual(NOW);
  });

  it("distingue le mandat PROUVÉ du mandat nu", () => {
    // Un mandat actif sans pièce est un mandat sans filet : la fiche doit
    // pouvoir le dire, donc l'agrégat doit pouvoir le distinguer.
    const mandate = PaymentMandate.reconstitute(snapshot());
    expect(mandate.proven()).toBe(false);

    mandate.attachProof({ storageKey: "companies/cmp_1/mandates/mdt_1/x", fileName: "mandat.pdf" });

    expect(mandate.proven()).toBe(true);
    expect(mandate.toView().proofFileName).toBe("mandat.pdf");
  });
});

describe("PaymentMandate — ce qui sort vers l'écran", () => {
  it("ne laisse fuir NI le moyen de paiement NI le client Stripe", () => {
    // Ces deux identifiants servent à débiter. Ce qui ne sort pas ne fuit pas.
    const view = PaymentMandate.reconstitute(snapshot()).toView();

    expect(JSON.stringify(view)).not.toContain("pm_1");
    expect(JSON.stringify(view)).not.toContain("cus_1");
    expect(view.reference).toBe("RUM-123");
  });
});
