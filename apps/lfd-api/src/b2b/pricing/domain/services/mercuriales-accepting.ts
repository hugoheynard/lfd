import type { CompanyMercuriale } from "../entities/company-mercuriale.js";
import {
  admitsPromotion,
  type MercurialePromotionMode,
} from "../entities/mercuriale-promotion-policy.js";

/** Une mercuriale qui accepte la promotion, et comment. */
export interface AcceptingMercuriale {
  readonly mercurialeId: string;
  readonly companyId: string;
  readonly label: string;
  readonly mode: Exclude<MercurialePromotionMode, "none">;
}

/**
 * **Les mercuriales qui laissent passer cette promotion** — chacune à sa
 * politique de `at`, ou de son début si elle n'a pas commencé
 * (`plan-la-mercuriale-decide.md`, § 7). Pur.
 */
export function mercurialesAccepting(
  mercuriales: readonly CompanyMercuriale[],
  promotionId: string,
  at: Date,
): AcceptingMercuriale[] {
  return mercuriales.flatMap((mercuriale) => {
    const start = mercuriale.toPersistence().validFrom;
    const policy = mercuriale.promotionPolicyAt(start.getTime() > at.getTime() ? start : at);
    if (policy.mode === "none" || !admitsPromotion(policy, promotionId)) {
      return [];
    }
    return [
      {
        mercurialeId: mercuriale.id,
        companyId: mercuriale.companyId,
        label: mercuriale.label,
        mode: policy.mode,
      },
    ];
  });
}
