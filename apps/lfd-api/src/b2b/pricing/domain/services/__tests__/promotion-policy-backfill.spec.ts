import type { PromotionAudienceFacts } from "../../../../promotions/domain/promotion-targeting.js";
import { NO_PROMOTION_ADMITTED } from "../../entities/mercuriale-promotion-policy.js";
import {
  describePolicyBackfill,
  planPolicyBackfill,
  type PolicyBackfillTarget,
  type StackedPromotion,
} from "../promotion-policy-backfill.js";

/**
 * **La reprise des politiques** (`plan-la-mercuriale-decide.md`, § 8) : une
 * mercuriale en cours ou à venir, ou un brouillon, reçoit « Au choix » avec
 * exactement les promotions cochées qui visent sa société ; sinon « Aucune ».
 * Le chargement (non archivées, programmées et en pause comprises ; mercuriales
 * non closes et non terminées) est celui de l'adaptateur ; ici, le jugement.
 */

function facts(
  companyId: string,
  over: Partial<PromotionAudienceFacts> = {},
): PromotionAudienceFacts {
  return {
    companyId,
    companyStatus: "active",
    principal: { companyId: null },
    buyerKind: "registered",
    fulfillment: null,
    ...over,
  };
}

function target(over: Partial<PolicyBackfillTarget> = {}): PolicyBackfillTarget {
  return {
    kind: "mercuriale",
    id: "merc_1",
    companyId: "co_folie",
    label: "Mercuriale 2027",
    current: NO_PROMOTION_ADMITTED,
    decidedByAmendment: false,
    facts: facts("co_folie"),
    ...over,
  };
}

const PROS: StackedPromotion = {
  id: "p_pros",
  internalName: "Pros",
  audiences: [{ kind: "pros" }],
};
const FOLIE: StackedPromotion = {
  id: "p_folie",
  internalName: "Folie",
  audiences: [{ kind: "company", companyId: "co_folie" }],
};
const OTHER: StackedPromotion = {
  id: "p_other",
  internalName: "Autre",
  audiences: [{ kind: "company", companyId: "co_other" }],
};
const GROUP: StackedPromotion = {
  id: "p_group",
  internalName: "Groupe",
  audiences: [{ kind: "company_and_sites", companyId: "co_parent" }],
};

describe("planPolicyBackfill", () => {
  it("une mercuriale (en cours ou à venir) visée : « Au choix » avec ces promotions-là, triées", () => {
    const [decision] = planPolicyBackfill([target()], [PROS, FOLIE, OTHER]);
    expect(decision?.outcome).toBe("set");
    expect(decision?.policy).toEqual({ mode: "selected", promotionIds: ["p_folie", "p_pros"] });
  });

  it("aucune promotion cochée ne la vise : elle reste « Aucune »", () => {
    const [decision] = planPolicyBackfill([target()], [OTHER]);
    expect(decision?.outcome).toBe("none");
    expect(decision?.policy).toEqual(NO_PROMOTION_ADMITTED);
  });

  it("un brouillon est réglé comme une mercuriale", () => {
    const [decision] = planPolicyBackfill([target({ kind: "draft", id: "co_folie" })], [FOLIE]);
    expect(decision?.outcome).toBe("set");
    expect(describePolicyBackfill(decision ?? fail())).toBe(
      "Brouillon « Mercuriale 2027 » (co_folie) — au choix : « Folie »",
    );
  });

  it("un site est visé par un public « société et ses sites » de son principal", () => {
    const site = target({
      companyId: "co_site",
      facts: facts("co_site", { principal: { companyId: "co_parent" } }),
    });
    expect(planPolicyBackfill([site], [GROUP])[0]?.outcome).toBe("set");
  });

  it("rejouable : déjà réglée, par la pose ou par un avenant, elle n'est pas touchée", () => {
    const decisions = planPolicyBackfill(
      [
        target({ current: { mode: "all", promotionIds: [] } }),
        target({ id: "merc_2", decidedByAmendment: true }),
      ],
      [FOLIE],
    );
    expect(decisions.map((decision) => decision.outcome)).toEqual(["decided", "decided"]);
  });
});

function fail(): never {
  throw new Error("décision attendue");
}
