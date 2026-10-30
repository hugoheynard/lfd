import { Injectable } from "@nestjs/common";

import type { StandingCompanyStatus } from "../../shared/company-standing/domain/company-standing.js";
import type { LivePromotion } from "../domain/live-promotion.js";
import { PromotionCompanyStatusReader } from "../domain/ports/promotion-company-status.reader.js";
import {
  audienceNeedsStatus,
  type FulfillmentFact,
  type PromotionAudienceFacts,
  type PromotionBuyerKind,
} from "../domain/promotion-targeting.js";

/** Ce que l'appelant sait déjà — établi au serveur, jamais reçu d'un corps. */
export interface KnownBuyerFacts {
  readonly companyId: string | null;
  readonly buyerKind: PromotionBuyerKind;
  readonly fulfillment: FulfillmentFact | null;
  /**
   * Le statut, si l'appelant l'a déjà lu (la caisse lit la clientèle) —
   * absent, il est lu ici, et seulement si une promotion le demande.
   */
  readonly companyStatus?: StandingCompanyStatus | null;
}

/**
 * **La seule fabrique des faits du ciblage** (plan des promotions, § 13.3),
 * à côté de `PricingPartiesResolver` et pour la même raison : deux endroits
 * qui décident « qui est pro » finiraient par annoncer une promotion que la
 * caisse refuse.
 *
 * Paresseuse : le statut n'est lu que si l'une des promotions candidates a
 * un public qui le demande — après la reprise, aucune promotion de ligne
 * n'en a (publics `everyone` et `company`), et le devis ne paie rien.
 *
 * Le principal suivi (`company_and_sites`) n'est pas lu en L5 : `unknown`,
 * donc un tel public ne vise que la société elle-même. Aucun geste ne pose
 * encore ce public (l'éditeur est le lot L7).
 */
@Injectable()
export class PromotionAudienceFactsResolver {
  constructor(private readonly statuses: PromotionCompanyStatusReader) {}

  async factsFor(
    known: KnownBuyerFacts,
    candidates: readonly LivePromotion[],
  ): Promise<PromotionAudienceFacts> {
    return {
      companyId: known.companyId,
      companyStatus: await this.statusOf(known, candidates),
      principal: known.companyId === null ? { companyId: null } : "unknown",
      buyerKind: known.buyerKind,
      fulfillment: known.fulfillment,
    };
  }

  private async statusOf(
    known: KnownBuyerFacts,
    candidates: readonly LivePromotion[],
  ): Promise<StandingCompanyStatus | null | "unknown"> {
    if (known.companyId === null) {
      return null;
    }
    if (known.companyStatus !== undefined) {
      return known.companyStatus;
    }
    if (!candidates.some(needsStatus)) {
      return "unknown";
    }
    return this.statuses.companyStatusOf(known.companyId);
  }
}

/**
 * Une promotion demande le statut si l'une de ses cibles le demande, ou si
 * elle porte un libellé d'audience : le libellé Pros ou Particuliers se
 * choisit sur le statut (L8b, § 15.8), sans quoi l'acheteur lirait le commun.
 */
function needsStatus(promotion: LivePromotion): boolean {
  return (
    promotion.audiences.some(audienceNeedsStatus) ||
    promotion.audienceLabels.individuals !== null ||
    promotion.audienceLabels.pros !== null
  );
}
