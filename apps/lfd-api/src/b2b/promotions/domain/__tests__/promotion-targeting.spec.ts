import type { StandingCompanyStatus } from "../../../shared/company-standing/domain/company-standing.js";
import { promotionsAdmitted } from "../live-promotion.js";
import type { PromotionAudience } from "../promotion-audience.js";
import {
  audienceAdmits,
  fulfillmentAdmits,
  type PromotionAudienceFacts,
  type PromotionBuyerKind,
} from "../promotion-targeting.js";
import { ASKED_AT, livePromotion } from "./live-promotion.fixture.js";

/**
 * Le ciblage (plan des promotions, § 13.3 et § 13.11, lot L5) : chaque public
 * contre chaque statut et chaque porte d'entrée, et la règle « un fait
 * inconnu ne s'applique pas ».
 */

function facts(over: Partial<PromotionAudienceFacts> = {}): PromotionAudienceFacts {
  return {
    companyId: "co_1",
    companyStatus: "active",
    principal: "unknown",
    buyerKind: "registered",
    fulfillment: null,
    ...over,
  };
}

const PARTICULIER = facts({ companyId: null, companyStatus: null, principal: { companyId: null } });

type StatusKind = Exclude<PromotionAudience["kind"], "company" | "company_and_sites">;
type Row = [StatusKind, StandingCompanyStatus | null, PromotionBuyerKind, boolean];

describe("audienceAdmits — les publics de clientèle contre le statut relu en base", () => {
  it.each<Row>([
    ["pros", "active", "registered", true],
    // P0 : une société en attente est servie en pro, une suspendue au public.
    ["pros", "pending", "registered", true],
    ["pros", "suspended", "registered", false],
    ["pros", null, "guest", false],
    ["pros_active", "active", "registered", true],
    ["pros_active", "pending", "registered", false],
    ["pros_pending", "pending", "registered", true],
    ["pros_pending", "active", "registered", false],
    ["individuals", null, "guest", true],
    ["individuals", "suspended", "registered", true],
    ["individuals", "pending", "registered", false],
    ["individuals_guest", null, "guest", true],
    ["individuals_guest", null, "registered", false],
    ["individuals_registered", null, "registered", true],
    ["individuals_registered", null, "guest", false],
    ["individuals_registered", null, "unknown", false],
    // `audienceOf` : la remise de retrait des particuliers allait à TOUT ce qui
    // n'est pas une société active — en attente et suspendue comprises.
    ["everyone_but_active_pros", null, "guest", true],
    ["everyone_but_active_pros", "pending", "registered", true],
    ["everyone_but_active_pros", "suspended", "registered", true],
    ["everyone_but_active_pros", "active", "registered", false],
  ])("%s · statut %s · %s → %s", (kind, status, buyerKind, expected) => {
    const audience: PromotionAudience = { kind };
    const subject = facts({
      companyId: status === null ? null : "co_1",
      companyStatus: status,
      buyerKind,
    });
    expect(audienceAdmits(audience, subject)).toBe(expected);
  });

  it("ne vise personne sur un statut qu'on n'a pas lu", () => {
    const unknown = facts({ companyStatus: "unknown" });
    expect(audienceAdmits({ kind: "pros" }, unknown)).toBe(false);
    expect(audienceAdmits({ kind: "individuals" }, unknown)).toBe(false);
    expect(audienceAdmits({ kind: "everyone_but_active_pros" }, unknown)).toBe(false);
    expect(audienceAdmits({ kind: "everyone" }, unknown)).toBe(true);
  });

  it("vise une société nommément, et ses sites seulement si le principal est connu", () => {
    expect(audienceAdmits({ kind: "company", companyId: "co_1" }, facts())).toBe(true);
    expect(audienceAdmits({ kind: "company", companyId: "co_2" }, facts())).toBe(false);
    expect(audienceAdmits({ kind: "company", companyId: "co_1" }, PARTICULIER)).toBe(false);
    const site = facts({ companyId: "co_site", principal: { companyId: "co_1" } });
    expect(audienceAdmits({ kind: "company_and_sites", companyId: "co_1" }, site)).toBe(true);
    expect(
      audienceAdmits(
        { kind: "company_and_sites", companyId: "co_1" },
        facts({ companyId: "co_site", principal: "unknown" }),
      ),
    ).toBe(false);
  });
});

describe("fulfillmentAdmits — l'acheminement retenu", () => {
  it("n'applique qu'un acheminement « tous » quand il est inconnu", () => {
    expect(fulfillmentAdmits({ kind: "any" }, null)).toBe(true);
    expect(fulfillmentAdmits({ kind: "pickup" }, null)).toBe(false);
    expect(fulfillmentAdmits({ kind: "pickup_point", pickupId: "pk_1" }, null)).toBe(false);
    expect(fulfillmentAdmits({ kind: "delivery" }, null)).toBe(false);
  });

  it("vise le point retenu, pas un autre", () => {
    const atPoint = { method: "pickup", pickupId: "pk_1" } as const;
    expect(fulfillmentAdmits({ kind: "pickup_point", pickupId: "pk_1" }, atPoint)).toBe(true);
    expect(fulfillmentAdmits({ kind: "pickup_point", pickupId: "pk_2" }, atPoint)).toBe(false);
    expect(fulfillmentAdmits({ kind: "pickup" }, atPoint)).toBe(true);
    expect(fulfillmentAdmits({ kind: "delivery" }, atPoint)).toBe(false);
    expect(fulfillmentAdmits({ kind: "delivery" }, { method: "delivery", pickupId: null })).toBe(
      true,
    );
  });
});

describe("promotionsAdmitted — fenêtre et pause à l'instant de la question", () => {
  it("garde borne basse incluse, écarte borne haute et pause antérieure", () => {
    const kept = promotionsAdmitted(
      [
        livePromotion({ id: "a", validFrom: ASKED_AT }),
        livePromotion({ id: "b", validTo: ASKED_AT }),
        livePromotion({ id: "c", suspendedFrom: ASKED_AT }),
        livePromotion({ id: "d", suspendedFrom: new Date(ASKED_AT.getTime() + 1) }),
      ],
      ASKED_AT,
      facts(),
    );
    expect(kept.map((promotion) => promotion.id)).toEqual(["a", "d"]);
  });
});
