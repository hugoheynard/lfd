import type { OrderCutoffDecision } from "@lfd/contracts";

import type { CancellationDecision } from "../order-cancellation.js";
import {
  customerRevisionRefusalOf,
  revisabilityOf,
  revisionBlockReasonOf,
  standingBlockOf,
} from "../order-revisability.js";

/**
 * **La modificabilité d'une commande** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.3 « Les règles », R1) — la
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
    expect(standingBlockOf(OPEN, ACCOUNT, "revise")).toBeNull();
  });

  it("reprend le blocage de l'annulation tel quel (R1)", () => {
    const inscribed: CancellationDecision = {
      cancellable: false,
      block: { kind: "inscribed", day: "2026-11-10" },
    };

    expect(standingBlockOf(inscribed, ACCOUNT, "revise")).toEqual({
      kind: "order",
      block: { kind: "inscribed", day: "2026-11-10" },
    });
  });

  it("plan S2, R2 ter — modifier : une carte attendue est refusée, une carte encaissée passe (l'agrégat trie)", () => {
    expect(standingBlockOf(OPEN, { ...ACCOUNT, paymentStatus: "paid" }, "revise")).toBeNull();
    expect(standingBlockOf(OPEN, { ...ACCOUNT, paymentStatus: "pending" }, "revise")).toEqual({
      kind: "card_settled",
      unsettled: true,
    });
  });

  it("plan S2, R4 — demander (M4) : toute carte, payée ou attendue, reste refusée", () => {
    expect(standingBlockOf(OPEN, { ...ACCOUNT, paymentStatus: "paid" }, "request")).toEqual({
      kind: "card_settled",
      unsettled: false,
    });
    expect(standingBlockOf(OPEN, { ...ACCOUNT, paymentStatus: "pending" }, "request")).toEqual({
      kind: "card_settled",
      unsettled: false,
    });
  });

  it("plan S1, R12 — une carte encaissée est simplement modifiable", () => {
    const paid = { ...ACCOUNT, paymentStatus: "paid" } as const;
    const standing = standingBlockOf(OPEN, paid, "revise");
    expect(standing).toBeNull();
    expect(revisabilityOf({ standing, planClosedDay: null, cutoff: null })).toEqual({
      revisable: true,
      until: null,
    });
  });

  it("une commande à total nul se modifie", () => {
    expect(standingBlockOf(OPEN, { ...ACCOUNT, totalCents: 0 }, "revise")).toBeNull();
  });

  it("refuse une commande d'avant les CGV figées", () => {
    expect(standingBlockOf(OPEN, { ...ACCOUNT, hasSalesTerms: false }, "revise")).toEqual({
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
        standing: { kind: "card_settled", unsettled: false },
        planClosedDay: "2026-11-10",
        cutoff: cutoff("closed"),
      }),
    ).toEqual({ revisable: false, block: { kind: "card_settled", unsettled: false } });
  });
});

describe("les mots du refus", () => {
  it("l'équipe lit la phrase du geste ; le client reçoit un code", () => {
    const inscribed = { kind: "order", block: { kind: "inscribed", day: "2026-11-10" } } as const;

    expect(revisionBlockReasonOf(inscribed)).toContain("Le fournil a déjà inscrit cette commande");
    expect(revisionBlockReasonOf({ kind: "card_settled", unsettled: false })).toContain(
      "réglée par carte",
    );
    expect(customerRevisionRefusalOf(inscribed)).toBe("in_preparation");
    expect(customerRevisionRefusalOf({ kind: "card_settled", unsettled: false })).toBe(
      "card_settled",
    );
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

describe("plan E7 reliquat (L5a) — la commande en partie retirée", () => {
  it.each(["partially_handed_over", "remainder_handed_over"] as const)(
    "%s : l'équipe lit une phrase qui nomme ce qui est parti, le client un code à part",
    (kind) => {
      const blocked = { kind: "order", block: { kind } } as const;

      expect(revisionBlockReasonOf(blocked)).toMatch(/déjà retiré/);
      expect(customerRevisionRefusalOf(blocked)).toBe("partially_handed_over");
    },
  );
});
