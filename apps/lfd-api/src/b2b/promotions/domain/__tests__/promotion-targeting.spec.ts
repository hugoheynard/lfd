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
    expect(fulfillmentAdmits({ kind: "displayed_price" }, null)).toBe(true);
    expect(fulfillmentAdmits({ kind: "basket", pickup: "all", delivery: "none" }, null)).toBe(
      false,
    );
    expect(
      fulfillmentAdmits({ kind: "basket", pickup: { points: ["pk_1"] }, delivery: "none" }, null),
    ).toBe(false);
    expect(fulfillmentAdmits({ kind: "basket", pickup: "none", delivery: "all" }, null)).toBe(
      false,
    );
  });

  it("vise le point retenu, pas un autre", () => {
    const atPoint = { method: "pickup", pickupId: "pk_1" } as const;
    expect(
      fulfillmentAdmits(
        { kind: "basket", pickup: { points: ["pk_1"] }, delivery: "none" },
        atPoint,
      ),
    ).toBe(true);
    expect(
      fulfillmentAdmits(
        { kind: "basket", pickup: { points: ["pk_2"] }, delivery: "none" },
        atPoint,
      ),
    ).toBe(false);
    expect(fulfillmentAdmits({ kind: "basket", pickup: "all", delivery: "none" }, atPoint)).toBe(
      true,
    );
    expect(fulfillmentAdmits({ kind: "basket", pickup: "none", delivery: "all" }, atPoint)).toBe(
      false,
    );
    expect(
      fulfillmentAdmits(
        { kind: "basket", pickup: "none", delivery: "all" },
        { method: "delivery", zoneId: null },
      ),
    ).toBe(true);
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

describe("promotionsAdmitted — un public à plusieurs cibles (L8b, § 15.6)", () => {
  const both = livePromotion({
    id: "both",
    audiences: [{ kind: "individuals_registered" }, { kind: "pros_active" }],
  });

  it("admet dès qu'UNE cible admet, et écarte quand aucune n'admet", () => {
    const registered = facts({ ...PARTICULIER, buyerKind: "registered" });
    const guest = facts({ ...PARTICULIER, buyerKind: "guest" });
    expect(promotionsAdmitted([both], ASKED_AT, registered)).toHaveLength(1);
    expect(promotionsAdmitted([both], ASKED_AT, facts())).toHaveLength(1);
    expect(promotionsAdmitted([both], ASKED_AT, guest)).toHaveLength(0);
  });

  it("prend le rang le plus HAUT parmi les cibles qui admettent", () => {
    const mixed = livePromotion({
      audiences: [{ kind: "pros" }, { kind: "company", companyId: "co_1" }],
    });
    const [forCo1] = promotionsAdmitted([mixed], ASKED_AT, facts());
    const [forOther] = promotionsAdmitted([mixed], ASKED_AT, facts({ companyId: "co_2" }));
    expect(forCo1?.publicRank).toBe(4);
    expect(forOther?.publicRank).toBe(1);
  });

  it("une cible seule garde le rang d'avant L8b", () => {
    const [admitted] = promotionsAdmitted(
      [livePromotion({ audience: { kind: "pros_active" } })],
      ASKED_AT,
      facts(),
    );
    expect(admitted?.publicRank).toBe(2);
  });

  it("fige le libellé de l'audience de l'acheteur, le commun si le statut n'est pas lu", () => {
    const labelled = livePromotion({
      audiences: [{ kind: "everyone" }],
      audienceLabels: {
        individuals: { fr: "Particuliers", en: null, it: null },
        pros: { fr: "Pros", en: "Pros EN", it: null },
      },
    });
    const pro = promotionsAdmitted([labelled], ASKED_AT, facts())[0]?.servedLabel;
    const individual = promotionsAdmitted([labelled], ASKED_AT, PARTICULIER)[0]?.servedLabel;
    const unknown = promotionsAdmitted([labelled], ASKED_AT, facts({ companyStatus: "unknown" }))[0]
      ?.servedLabel;
    expect(pro).toEqual({ fr: "Pros", en: "Pros EN", it: "Pros" });
    expect(individual?.fr).toBe("Particuliers");
    expect(unknown?.fr).toBe("−20 % sur tout");
  });
});
