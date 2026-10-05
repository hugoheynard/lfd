import { PricingAccountReader } from "../../domain/ports/pricing-account.reader.js";
import { PricingPartiesResolver } from "../pricing-parties.resolver.js";

/** Une période de suivi `pricing` : début inclus, fin exclue, `null` = en cours. */
export interface FollowedSpan {
  readonly companyId: string;
  readonly parentId: string;
  readonly from: Date;
  readonly to: Date | null;
}

/**
 * Le compte de tarif lu sur des périodes données à la main — le double du
 * port, sans base. Sans période qui couvre l'instant, la société paie le sien.
 */
export class SpannedPricingAccounts extends PricingAccountReader {
  readonly asked: { companyId: string; at: Date }[] = [];

  constructor(private readonly spans: readonly FollowedSpan[] = []) {
    super();
  }

  pricingAccountOf(companyId: string, at: Date): Promise<string> {
    this.asked.push({ companyId, at });
    const span = this.spans.find(
      (candidate) =>
        candidate.companyId === companyId &&
        candidate.from.getTime() <= at.getTime() &&
        (candidate.to === null || at.getTime() < candidate.to.getTime()),
    );
    return Promise.resolve(span?.parentId ?? companyId);
  }
}

/** Le résolveur où chaque société paie son propre tarif — aucun sous-compte. */
export function ownPricingParties(): PricingPartiesResolver {
  return new PricingPartiesResolver(new SpannedPricingAccounts());
}
