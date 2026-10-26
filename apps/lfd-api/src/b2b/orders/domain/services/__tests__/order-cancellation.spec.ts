import { BEFORE_INSCRIPTION } from "../cancellation-allowance.js";
import {
  cancellationBlocker,
  cancellationOf,
  cancellationRefusalOf,
  type CancellationState,
} from "../order-cancellation.js";

/**
 * La règle de l'annulation staff (doc `documentation/commandes/annulation/annulation-par-le-staff.md`,
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
    fulfillmentMethod: "pickup",
    cancelledAt: null,
    inscribedDay: null,
    engagement: null,
    refunds: { refundableCents: 0, inFlightCents: 0 },
    packed: false,
    ...overrides,
  };
}

describe("cancellationOf — ce qui s'annule", () => {
  it.each([
    ["carte en attente", state(), "due"],
    ["carte refusée, intention vivante", state({ paymentStatus: "failed" }), "due"],
    ["total nul", state({ paymentStatus: "not_required", totalCents: 0 }), "free"],
    [
      "au compte, rien d'engagé (lot C5)",
      state({ paymentStatus: "not_required", engagement: { kind: "free" } }),
      "account",
    ],
    // Lot C4 : la branche qui refusait une payée est INVERSÉE (C4.11 bis).
    [
      "payée par carte (lot C4)",
      state({ paymentStatus: "paid", refunds: { refundableCents: 2_110, inFlightCents: 0 } }),
      "paid",
    ],
    ["remboursée en entier depuis Stripe (lot C4)", state({ paymentStatus: "refunded" }), "paid"],
  ] as const)("%s → annulable, régime %s", (_, subject, regime) => {
    expect(cancellationOf(subject, BEFORE_INSCRIPTION)).toEqual({ cancellable: true, regime });
  });
});

describe("cancellationBlocker — les refus, dans l'ordre du plan (C3.3)", () => {
  it.each([
    ["déjà annulée", state({ status: "cancelled" }), "already_cancelled"],
    ["brouillon", state({ status: "draft" }), "draft"],
    ["prête", state({ status: "ready" }), "ready"],
    ["retirée", state({ status: "fulfilled" }), "fulfilled"],
    [
      "au compte, facturée",
      state({
        paymentStatus: "not_required",
        engagement: { kind: "invoiced", invoiceNumber: "FA-1", issuedOn: "2026-09-30" },
      }),
      "invoiced",
    ],
    [
      "au compte, engagement illisible",
      state({ paymentStatus: "not_required" }),
      "engagement_unknown",
    ],
    [
      "payée, un remboursement en vol (lot C4)",
      state({ paymentStatus: "paid", refunds: { refundableCents: 2_110, inFlightCents: 500 } }),
      "refund_in_flight",
    ],
    [
      "payée et inscrite au fournil (lot C4)",
      state({ paymentStatus: "paid", inscribedDay: "2026-10-13" }),
      "inscribed",
    ],
    ["inscrite au fournil, encore placed", state({ inscribedDay: "2026-10-13" }), "inscribed"],
    ["confirmée par le plan du soir", state({ status: "confirmed" }), "inscribed"],
    ["en production", state({ status: "in_production" }), "inscribed"],
  ] as const)("%s → %s", (_, subject, kind) => {
    expect(cancellationBlocker(subject, BEFORE_INSCRIPTION)?.kind).toBe(kind);
  });

  it("un remboursement en vol n'est lu que sur une payée : une carte attendue l'ignore", () => {
    expect(
      cancellationBlocker(
        state({ refunds: { refundableCents: 0, inFlightCents: 500 } }),
        BEFORE_INSCRIPTION,
      ),
    ).toBeNull();
  });

  it("le statut annulé l'emporte sur tout le reste", () => {
    expect(
      cancellationBlocker(
        state({ status: "cancelled", paymentStatus: "paid", inscribedDay: "x" }),
        BEFORE_INSCRIPTION,
      ),
    ).toEqual({ kind: "already_cancelled", at: null });
  });

  it("au compte, engagée ET inscrite : la comptabilité est dite d'abord (C5.2)", () => {
    const blocked = state({
      paymentStatus: "not_required",
      inscribedDay: "2026-10-13",
      engagement: { kind: "written_off" },
    });

    expect(cancellationBlocker(blocked, BEFORE_INSCRIPTION)?.kind).toBe("written_off");
  });

  it("au compte, rien d'engagé mais inscrite : le fournil refuse", () => {
    const blocked = state({
      paymentStatus: "not_required",
      inscribedDay: "2026-10-13",
      engagement: { kind: "free" },
    });

    expect(cancellationBlocker(blocked, BEFORE_INSCRIPTION)?.kind).toBe("inscribed");
  });

  it("un engagement `null` hors du compte ne refuse rien : seule la carte et le total nul y ont droit", () => {
    expect(cancellationBlocker(state({ engagement: null }), BEFORE_INSCRIPTION)).toBeNull();
  });

  it("au compte, le statut l'emporte sur l'engagement", () => {
    expect(
      cancellationBlocker(
        state({ status: "cancelled", paymentStatus: "not_required", engagement: null }),
        BEFORE_INSCRIPTION,
      )?.kind,
    ).toBe("already_cancelled");
  });

  it("le jour de l'inscription vient du fournil, sinon du jour de service", () => {
    expect(cancellationBlocker(state({ inscribedDay: "2026-10-14" }), BEFORE_INSCRIPTION)).toEqual({
      kind: "inscribed",
      day: "2026-10-14",
    });
    expect(cancellationBlocker(state({ status: "confirmed" }), BEFORE_INSCRIPTION)).toEqual({
      kind: "inscribed",
      day: "2026-10-13",
    });
  });

  it("rien n'empêche : null", () => {
    expect(cancellationBlocker(state(), BEFORE_INSCRIPTION)).toBeNull();
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

  it("un remboursement en vol nomme son montant et le geste de sortie (C4.4)", () => {
    const sentence = cancellationRefusalOf({ kind: "refund_in_flight", amountCents: 2_340 });

    expect(sentence).toMatch(/^Un remboursement de 23,40\s€ est en cours chez Stripe/u);
    expect(sentence).toContain("Attendez son issue, puis annulez.");
  });

  it("une carte qui aboutit pendant le clic dit de recharger (C4.6)", () => {
    expect(cancellationRefusalOf({ kind: "paid_just_now" })).toContain(
      "l'annulation proposera le remboursement",
    );
  });

  it("au compte, la phrase est celle de la comptabilité (C5.6)", () => {
    expect(cancellationRefusalOf({ kind: "settled_otherwise" })).toContain(
      "voyez avec la comptabilité",
    );
  });

  it("cas 5 du lot C3b : ne propose d'annuler l'autre commande que si elle s'annule", () => {
    const engaged = {
      kind: "voucher_remainder_engaged",
      remainderValueCents: 450,
      order: { id: "ord_2", number: "C-2" },
    } as const;

    expect(cancellationRefusalOf({ ...engaged, otherCancellable: true })).toMatch(
      /^Le reste de 4,50\s€ du bon utilisé ici a servi sur la commande C-2 : annulez-la d'abord, puis celle-ci\.$/u,
    );
    const stuck = cancellationRefusalOf({ ...engaged, otherCancellable: false });
    expect(stuck).toContain("qui ne peut plus être annulée");
    expect(stuck).toContain("Voyez avec la direction.");
    expect(stuck).not.toContain("annulez-la");
  });

  it("cas 6 du lot C3b : le reste annulé par l'équipe", () => {
    expect(
      cancellationRefusalOf({ kind: "voucher_remainder_cancelled", remainderValueCents: 450 }),
    ).toMatch(
      /^Le reste de ce bon \(4,50\s€\) a été annulé par l'équipe : l'annulation de la commande n'est plus possible\. Voyez avec la direction\.$/u,
    );
  });
});

describe("cancellationOf — l'autorisation du plan A1", () => {
  it.each([
    ["inscrite au fournil", state({ inscribedDay: "2026-10-14" })],
    ["confirmée au plan", state({ status: "confirmed" })],
  ] as const)("étape production_plan, commande %s : refusée", (_, inscribed) => {
    expect(cancellationBlocker(inscribed, BEFORE_INSCRIPTION)?.kind).toBe("inscribed");
  });

  it.each([
    ["inscrite au fournil", state({ inscribedDay: "2026-10-14" })],
    ["confirmée au plan", state({ status: "confirmed" })],
  ] as const)("étape ready, retrait %s : annulable — le colisage tranchera", (_, inscribed) => {
    expect(cancellationOf(inscribed, { allowance: "before_packing" })).toEqual({
      cancellable: true,
      regime: "due",
    });
  });

  it("étape ready, livraison inscrite : `delivery_after_plan`, avec le jour", () => {
    expect(
      cancellationBlocker(state({ inscribedDay: "2026-10-14", fulfillmentMethod: "delivery" }), {
        allowance: "before_packing",
      }),
    ).toEqual({ kind: "delivery_after_plan", day: "2026-10-14" });
  });

  it("étape ready, commande prête : « prête », jamais au-delà", () => {
    expect(
      cancellationBlocker(state({ status: "ready" }), { allowance: "before_packing" })?.kind,
    ).toBe("ready");
  });

  it.each(["delivery_after_plan", "packed", "delivery_bin", "state_changed"] as const)(
    "« %s » a sa phrase, qui nomme le geste de sortie",
    (kind) => {
      const block = kind === "delivery_after_plan" ? { kind, day: "2026-10-14" } : { kind };
      expect(cancellationRefusalOf(block)).toMatch(/Voyez|Rechargez/);
    },
  );

  it("lot A1.3 : l'aperçu qui sait le bac fermé dit « packed » avant le geste", () => {
    expect(
      cancellationBlocker(state({ inscribedDay: "2026-10-14", packed: true }), {
        allowance: "before_packing",
      }),
    ).toEqual({ kind: "packed" });
  });

  it("lot A1.3 : sous l'étape « arrêt du plan », un bac fermé reste « inscrite »", () => {
    expect(
      cancellationBlocker(state({ inscribedDay: "2026-10-14", packed: true }), BEFORE_INSCRIPTION)
        ?.kind,
    ).toBe("inscribed");
  });

  it("étape ready : ce qui s'annulait s'annule toujours", () => {
    expect(cancellationOf(state(), { allowance: "before_packing" })).toEqual({
      cancellable: true,
      regime: "due",
    });
  });
});

describe("plan E7 reliquat (L5a) — la commande en partie retirée", () => {
  /**
   * Régression : `statusBlock` finissait par `default: return null`. Une
   * commande au compte dont un envoi est retiré, sous l'étape « avant
   * colisage », passait pour annulable — le compilateur ne disait rien.
   */
  it("au compte, rien d'engagé, étape « avant colisage » : refusée, pas annulable", () => {
    const partial = state({
      status: "partially_handed_over",
      paymentStatus: "not_required",
      engagement: { kind: "free" },
    });
    expect(cancellationOf(partial, { allowance: "before_packing" })).toEqual({
      cancellable: false,
      block: { kind: "partially_handed_over" },
    });
  });

  it("le refus nomme la partie retirée et le geste de sortie", () => {
    expect(cancellationRefusalOf({ kind: "partially_handed_over" })).toBe(
      "Une partie de cette commande est déjà retirée : elle ne s'annule plus. Voyez avec la Supervision pour le reste.",
    );
  });

  it("un reste retiré avant la commande a son propre mot", () => {
    expect(cancellationRefusalOf({ kind: "remainder_handed_over" })).toBe(
      "Le reste de cette commande est déjà retiré : elle ne s'annule plus.",
    );
  });
});
