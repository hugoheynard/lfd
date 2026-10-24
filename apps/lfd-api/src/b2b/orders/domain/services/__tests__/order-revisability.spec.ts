import type { OrderCutoffDecision } from "@lfd/contracts";

import type { CancellationDecision } from "../order-cancellation.js";
import {
  customerRevisionRefusalOf,
  revisabilityOf,
  revisionBlockReasonOf,
  standingBlockOf,
} from "../order-revisability.js";

/**
 * **La modificabilité d'une commande** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, R1, §6, §9) — la
 * règle pure que le geste et les deux vues partagent.
 *
 * Les instants ne sont comparés qu'entre eux : la règle ne lit aucune horloge
 * (exception étroite du CLAUDE.md §5).
 */

const OPEN: CancellationDecision = { cancellable: true, regime: "account" };
const ACCOUNT = { paymentStatus: "not_required", totalCents: 1_200, hasSalesTerms: true } as const;
const LIMIT = new Date("2026-11-09T17:00:00.000Z");

function cutoff(status: OrderCutoffDecision["status"]): OrderCutoffDecision {
  return { status, rule: null, limit: LIMIT, graceEnd: LIMIT };
}

describe("standingBlockOf — ce qui vaut pour le client comme pour l'équipe", () => {
  it("une commande au compte, libre, avec ses CGV : rien ne bloque", () => {
    expect(standingBlockOf(OPEN, ACCOUNT)).toBeNull();
  });

  it("reprend le blocage de l'annulation tel quel (R1)", () => {
    const inscribed: CancellationDecision = {
      cancellable: false,
      block: { kind: "inscribed", day: "2026-11-10" },
    };

    expect(standingBlockOf(inscribed, ACCOUNT)).toEqual({
      kind: "order",
      block: { kind: "inscribed", day: "2026-11-10" },
    });
  });

  it("refuse une commande payable par carte, payée ou attendue (§9)", () => {
    expect(standingBlockOf(OPEN, { ...ACCOUNT, paymentStatus: "paid" })).toEqual({
      kind: "card_settled",
    });
    expect(standingBlockOf(OPEN, { ...ACCOUNT, paymentStatus: "pending" })).toEqual({
      kind: "card_settled",
    });
  });

  it("une commande à total nul se modifie", () => {
    expect(standingBlockOf(OPEN, { ...ACCOUNT, totalCents: 0 })).toBeNull();
  });

  it("refuse une commande d'avant les CGV figées", () => {
    expect(standingBlockOf(OPEN, { ...ACCOUNT, hasSalesTerms: false })).toEqual({
      kind: "without_sales_terms",
    });
  });
});

describe("revisabilityOf — le verdict", () => {
  it("l'équipe (ni plan ni heure) : modifiable, sans échéance", () => {
    expect(revisabilityOf({ standing: null, planClosedDay: null, cutoff: null })).toEqual({
      revisable: true,
      until: null,
    });
  });

  it("le client avant l'heure limite : modifiable jusqu'à elle", () => {
    expect(revisabilityOf({ standing: null, planClosedDay: null, cutoff: cutoff("open") })).toEqual(
      { revisable: true, until: LIMIT },
    );
  });

  it("le client pendant la grâce ou après : trop tard — une modification ne dépense aucune dérogation", () => {
    for (const status of ["grace", "closed"] as const) {
      expect(
        revisabilityOf({ standing: null, planClosedDay: null, cutoff: cutoff(status) }),
      ).toEqual({ revisable: false, block: { kind: "past_cutoff", until: LIMIT } });
    }
  });

  it("le plan arrêté passe avant l'heure ; le blocage commun passe avant tout", () => {
    expect(
      revisabilityOf({ standing: null, planClosedDay: "2026-11-10", cutoff: cutoff("closed") }),
    ).toEqual({ revisable: false, block: { kind: "plan_closed", day: "2026-11-10" } });
    expect(
      revisabilityOf({
        standing: { kind: "card_settled" },
        planClosedDay: "2026-11-10",
        cutoff: cutoff("closed"),
      }),
    ).toEqual({ revisable: false, block: { kind: "card_settled" } });
  });
});

describe("les mots du refus", () => {
  it("l'équipe lit la phrase du geste ; le client reçoit un code", () => {
    const inscribed = { kind: "order", block: { kind: "inscribed", day: "2026-11-10" } } as const;

    expect(revisionBlockReasonOf(inscribed)).toContain("Le fournil a déjà inscrit cette commande");
    expect(revisionBlockReasonOf({ kind: "card_settled" })).toContain("réglée par carte");
    expect(customerRevisionRefusalOf(inscribed)).toBe("in_preparation");
    expect(customerRevisionRefusalOf({ kind: "card_settled" })).toBe("card_settled");
    expect(customerRevisionRefusalOf({ kind: "past_cutoff", until: LIMIT })).toBe("too_late");
    expect(customerRevisionRefusalOf({ kind: "plan_closed", day: "2026-11-10" })).toBe(
      "in_preparation",
    );
  });

  it("un engagement comptable se dit « comptabilité » au client", () => {
    expect(
      customerRevisionRefusalOf({
        kind: "order",
        block: { kind: "invoiced", invoiceNumber: "F-1", issuedOn: "2026-11-30" },
      }),
    ).toBe("accounting");
  });
});
