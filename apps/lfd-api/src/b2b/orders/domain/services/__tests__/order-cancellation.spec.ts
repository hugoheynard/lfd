import {
  cancellationBlocker,
  cancellationOf,
  cancellationRefusalOf,
  type CancellationState,
} from "../order-cancellation.js";

/**
 * La règle de l'annulation staff (plan `order/plan-annulation-de-commande.md`,
 * C3.2, C3.3, C3.7), pure : statut × régime × inscrite au fournil.
 */

/** Comparé à rien d'autre qu'à sa propre mise en forme — exception étroite du §5. */
const CANCELLED_AT = new Date("2026-10-12T15:05:00.000Z");

function state(overrides: Partial<CancellationState> = {}): CancellationState {
  return {
    status: "placed",
    paymentStatus: "pending",
    totalCents: 2_110,
    serviceDay: "2026-10-13",
    cancelledAt: null,
    carriesVoucher: false,
    inscribedDay: null,
    ...overrides,
  };
}

describe("cancellationOf — ce qui s'annule", () => {
  it.each([
    ["carte en attente", state(), "due"],
    ["carte refusée, intention vivante", state({ paymentStatus: "failed" }), "due"],
    ["total nul", state({ paymentStatus: "not_required", totalCents: 0 }), "free"],
    ["carte non payée qui porte un bon", state({ carriesVoucher: true }), "due"],
  ] as const)("%s → annulable, régime %s", (_, subject, regime) => {
    expect(cancellationOf(subject)).toEqual({ cancellable: true, regime });
  });
});

describe("cancellationBlocker — les refus, dans l'ordre du plan (C3.3)", () => {
  it.each([
    ["déjà annulée", state({ status: "cancelled" }), "already_cancelled"],
    ["brouillon", state({ status: "draft" }), "draft"],
    ["prête", state({ status: "ready" }), "ready"],
    ["retirée", state({ status: "fulfilled" }), "fulfilled"],
    ["au compte", state({ paymentStatus: "not_required" }), "account"],
    ["payée", state({ paymentStatus: "paid" }), "paid"],
    ["remboursée (payée d'abord)", state({ paymentStatus: "refunded" }), "paid"],
    ["inscrite au fournil, encore placed", state({ inscribedDay: "2026-10-13" }), "inscribed"],
    ["confirmée par le plan du soir", state({ status: "confirmed" }), "inscribed"],
    ["en production", state({ status: "in_production" }), "inscribed"],
    [
      "total nul qui porte un bon déjà soldé",
      state({ paymentStatus: "not_required", totalCents: 0, carriesVoucher: true }),
      "voucher_settled",
    ],
  ] as const)("%s → %s", (_, subject, kind) => {
    expect(cancellationBlocker(subject)?.kind).toBe(kind);
  });

  it("le statut annulé l'emporte sur tout le reste", () => {
    expect(
      cancellationBlocker(state({ status: "cancelled", paymentStatus: "paid", inscribedDay: "x" })),
    ).toEqual({ kind: "already_cancelled", at: null });
  });

  it("au compte ET inscrite : le compte est dit d'abord", () => {
    const blocked = state({ paymentStatus: "not_required", inscribedDay: "2026-10-13" });

    expect(cancellationBlocker(blocked)?.kind).toBe("account");
  });

  it("le jour de l'inscription vient du fournil, sinon du jour de service", () => {
    expect(cancellationBlocker(state({ inscribedDay: "2026-10-14" }))).toEqual({
      kind: "inscribed",
      day: "2026-10-14",
    });
    expect(cancellationBlocker(state({ status: "confirmed" }))).toEqual({
      kind: "inscribed",
      day: "2026-10-13",
    });
  });

  it("rien n'empêche : null", () => {
    expect(cancellationBlocker(state())).toBeNull();
  });
});

describe("cancellationRefusalOf — les phrases (C3.7)", () => {
  it("dit quand elle a été annulée, à l'heure de Paris", () => {
    expect(cancellationRefusalOf({ kind: "already_cancelled", at: CANCELLED_AT })).toBe(
      "Cette commande est déjà annulée (le 12/10 à 17:05).",
    );
  });

  it("une annulation automatique n'a pas d'instant à dire", () => {
    expect(cancellationRefusalOf({ kind: "already_cancelled", at: null })).toBe(
      "Cette commande est déjà annulée.",
    );
  });

  it("nomme le jour du compte à produire, sans fuseau", () => {
    expect(cancellationRefusalOf({ kind: "inscribed", day: "2026-10-13" })).toBe(
      "Le fournil a déjà inscrit cette commande au compte à produire du 13/10 : elle sera fabriquée. Voyez avec le fournil.",
    );
  });

  it("au compte et payée nomment le geste de sortie", () => {
    expect(cancellationRefusalOf({ kind: "account" })).toContain("voyez avec la comptabilité");
    expect(cancellationRefusalOf({ kind: "paid" })).toContain("remboursez depuis Stripe");
  });
});
