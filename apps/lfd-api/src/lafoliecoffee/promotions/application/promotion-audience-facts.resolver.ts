import { Injectable } from "@nestjs/common";

import type { StandingCompanyStatus } from "../../shared/company-standing/domain/company-standing.js";
import type { LivePromotion } from "../domain/live-promotion.js";
import { PromotionCompanyStatusReader } from "../domain/ports/promotion-company-status.reader.js";
import { PromotionPrincipalReader } from "../domain/ports/promotion-principal.reader.js";
import {
  audienceNeedsStatus,
  type FulfillmentFact,
  type PromotionAudienceFacts,
  type PrincipalFact,
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
 * Le principal (`company_and_sites`, lot L10) est lu de même, seulement si
 * une candidate vise une société ET ses sites : sans lui, un site ne serait
 * jamais admis par le public de son principal.
 */
@Injectable()
export class PromotionAudienceFactsResolver {
  constructor(
    private readonly statuses: PromotionCompanyStatusReader,
    private readonly principals: PromotionPrincipalReader,
  ) {}

  async factsFor(
    known: KnownBuyerFacts,
    candidates: readonly LivePromotion[],
  ): Promise<PromotionAudienceFacts> {
    const [companyStatus, principal] = await Promise.all([
      this.statusOf(known, candidates),
      this.principalOf(known.companyId, candidates),
    ]);
    return {
      companyId: known.companyId,
      companyStatus,
      principal,
      buyerKind: known.buyerKind,
      fulfillment: known.fulfillment,
    };
  }

  private async principalOf(
    companyId: string | null,
    candidates: readonly LivePromotion[],
  ): Promise<PrincipalFact> {
    if (companyId === null) {
      return { companyId: null };
    }
    if (!candidates.some(namesSites)) {
      return "unknown";
    }
    return { companyId: await this.principals.principalOf(companyId) };
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

/** Une promotion qui vise une société ET ses sites demande le principal de l'acheteur. */
function namesSites(promotion: LivePromotion): boolean {
  return promotion.audiences.some((audience) => audience.kind === "company_and_sites");
}
