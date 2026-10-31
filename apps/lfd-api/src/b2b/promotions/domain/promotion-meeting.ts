import type { StandingCompanyStatus } from "../../shared/company-standing/domain/company-standing.js";
import { audienceCompanyIdOf, type PromotionAudience } from "./promotion-audience.js";
import type { PromotionAudienceSet } from "./promotion-audience-set.js";
import {
  listedPointsOf,
  listedZonesOf,
  type PromotionFulfillment,
} from "./promotion-fulfillment.js";
import {
  audienceAdmits,
  fulfillmentAdmits,
  type FulfillmentFact,
  type PromotionAudienceFacts,
  type PromotionBuyerKind,
} from "./promotion-targeting.js";

/**
 * **Deux promotions peuvent-elles viser un même acheteur, servi d'une même
 * façon ?** — pur. Sorti de `promotion-overlap.ts` (2026-10-31) quand les
 * jours et heures l'ont fait passer les 300 lignes ; les refus y restent.
 */

/** Les statuts d'une société qui commande encore ; une société close ne commande plus. */
const ORDERING_STATUSES: readonly StandingCompanyStatus[] = ["pending", "active", "suspended"];
const BUYER_KINDS: readonly PromotionBuyerKind[] = ["guest", "registered"];
/** Une société qu'aucun des deux publics ne nomme. */
const ANY_OTHER = "__unnamed__";

/**
 * **Deux publics à plusieurs cibles peuvent-ils admettre un même acheteur ?**
 * Une paire de cibles qui se rencontre (§ 15.6) — les sociétés nommées des
 * DEUX ensembles sont énumérées : sans elles, un acheteur de la société de
 * droite ne le serait jamais.
 */
export function audienceSetsMeet(left: PromotionAudienceSet, right: PromotionAudienceSet): boolean {
  const named = [...left.targets, ...right.targets]
    .map(audienceCompanyIdOf)
    .filter((id): id is string => id !== null);
  return left.targets.some((mine) =>
    right.targets.some((theirs) => audiencesMeet(mine, theirs, named)),
  );
}

/**
 * **Un acheteur peut-il être admis par les deux publics ?** Jugé en
 * énumérant les acheteurs possibles et en posant à chacun la question même
 * du calcul (`audienceAdmits`) : une seconde écriture de la règle aurait fini
 * par la contredire. `extraCompanies` : les sociétés nommées ailleurs dans
 * les deux ensembles.
 */
export function audiencesMeet(
  left: PromotionAudience,
  right: PromotionAudience,
  extraCompanies: readonly string[] = [],
): boolean {
  const named = [audienceCompanyIdOf(left), audienceCompanyIdOf(right), ...extraCompanies].filter(
    (id): id is string => id !== null,
  );
  const companies = [...new Set([...named, ANY_OTHER])];
  return possibleBuyers(companies).some(
    (facts) => audienceAdmits(left, facts) && audienceAdmits(right, facts),
  );
}

function possibleBuyers(companies: readonly string[]): PromotionAudienceFacts[] {
  const buyers: PromotionAudienceFacts[] = [];
  for (const buyerKind of BUYER_KINDS) {
    buyers.push(buyer(null, null, null, buyerKind));
    for (const companyId of companies) {
      for (const status of ORDERING_STATUSES) {
        for (const principal of [null, ...companies.filter((id) => id !== companyId)]) {
          buyers.push(buyer(companyId, status, principal, buyerKind));
        }
      }
    }
  }
  return buyers;
}

function buyer(
  companyId: string | null,
  companyStatus: StandingCompanyStatus | null,
  principal: string | null,
  buyerKind: PromotionBuyerKind,
): PromotionAudienceFacts {
  return {
    companyId,
    companyStatus,
    principal: { companyId: principal },
    buyerKind,
    fulfillment: null,
  };
}

/**
 * **Une commande peut-elle être servie d'une façon que les deux admettent ?**
 * Témoins (`promotions.md`, § 2.14) : chaque point et chaque zone
 * nommés, « un autre point », « une autre zone », « livraison sans zone ».
 */
export function fulfillmentsMeet(left: PromotionFulfillment, right: PromotionFulfillment): boolean {
  const points = [...listedPointsOf(left), ...listedPointsOf(right), ANY_OTHER];
  const zones = [...listedZonesOf(left), ...listedZonesOf(right), ANY_OTHER];
  const facts: FulfillmentFact[] = [
    ...[...new Set(points)].map((pickupId): FulfillmentFact => ({ method: "pickup", pickupId })),
    ...[...new Set(zones)].map((zoneId): FulfillmentFact => ({ method: "delivery", zoneId })),
    { method: "delivery", zoneId: null },
  ];
  return facts.some((fact) => fulfillmentAdmits(left, fact) && fulfillmentAdmits(right, fact));
}
