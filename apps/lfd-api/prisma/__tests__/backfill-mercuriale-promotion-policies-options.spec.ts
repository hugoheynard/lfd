import { NO_PROMOTION_ADMITTED } from "../../src/b2b/pricing/domain/entities/mercuriale-promotion-policy.js";
import type { PolicyBackfillDecision } from "../../src/b2b/pricing/domain/services/promotion-policy-backfill.js";
import {
  assertPolicyBackfillTarget,
  parsePolicyBackfillArgs,
  policyBackfillReport,
} from "../backfill-mercuriale-promotion-policies-options.js";

/**
 * La reprise des politiques (`plan-la-mercuriale-decide.md`, § 8) : à blanc
 * par défaut, cible locale seulement, sauf `--production` ET le nom retapé.
 */

const LOCAL = "postgresql://lfd:lfd@localhost:5433/lfc_b2b";
const REMOTE = "postgres://user:secret@pooled.db.prisma.io:5432/lfd_prod?sslmode=require";

const SET: PolicyBackfillDecision = {
  target: {
    kind: "mercuriale",
    id: "merc_1",
    companyId: "co_folie",
    label: "M",
    current: NO_PROMOTION_ADMITTED,
    decidedByAmendment: false,
    facts: {
      companyId: "co_folie",
      companyStatus: "active",
      principal: { companyId: null },
      buyerKind: "registered",
      fulfillment: null,
    },
  },
  outcome: "set",
  policy: { mode: "selected", promotionIds: ["p"] },
  promotions: [{ id: "p", internalName: "Rentrée", audiences: [{ kind: "pros" }] }],
};

describe("les options", () => {
  it("à blanc par défaut ; `--write` écrit ; le `--` de pnpm est ignoré", () => {
    expect(parsePolicyBackfillArgs([])).toEqual({ write: false, production: null });
    expect(parsePolicyBackfillArgs(["--", "--write"])).toEqual({ write: true, production: null });
  });

  it("refuse une option inconnue et `--production` sans nom", () => {
    expect(() => parsePolicyBackfillArgs(["--force"])).toThrow(/Option inconnue/);
    expect(() => parsePolicyBackfillArgs(["--production"])).toThrow(/nom de la base/);
  });

  it("distant sans `--production` : refusé ; avec le bon nom : admis", () => {
    expect(() => assertPolicyBackfillTarget(REMOTE, { write: false, production: null })).toThrow();
    expect(() => assertPolicyBackfillTarget(REMOTE, { write: true, production: "autre" })).toThrow(
      /retapé/,
    );
    expect(() =>
      assertPolicyBackfillTarget(REMOTE, { write: true, production: "lfd_prod" }),
    ).not.toThrow();
    expect(() =>
      assertPolicyBackfillTarget(LOCAL, { write: true, production: null }),
    ).not.toThrow();
  });
});

describe("le rapport", () => {
  it("compte, puis nomme ; signale une ligne changée entre-temps", () => {
    expect(policyBackfillReport([SET], new Set(), false)).toEqual([
      "Reprise des politiques de promotions — À BLANC (rien n'est écrit)",
      "  1 mercuriale(s) en cours ou à venir et brouillon(s)",
      "  au choix 1 · aucune 0 · déjà réglées 0",
      "  Mercuriale « M » (co_folie) — au choix : « Rentrée »",
    ]);
    expect(policyBackfillReport([SET], new Set(), true).at(-1)).toContain("non écrite");
  });
});
