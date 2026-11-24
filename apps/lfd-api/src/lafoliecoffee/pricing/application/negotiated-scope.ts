import { Injectable } from "@nestjs/common";
import { localToInstant } from "@lfd/contracts";

import { Clock } from "../../../platform/time/clock.js";
import { NegotiatedScopeDayError } from "../../orders/domain/errors/outside-negotiated-scope.error.js";
import { NegotiatedScope } from "../../orders/domain/ports/negotiated-scope.js";
import { PayerCommitmentRequirements } from "../../orders/domain/ports/payer-commitment-requirements.js";
import { CompanyMercurialeReader } from "../domain/ports/company-mercuriale.reader.js";
import { actsAt } from "./board-category.js";

/** Le milieu du jour de livraison (Paris) : une mercuriale qui le couvre couvre la livraison. */
const DELIVERY_MOMENT = "12:00";

/**
 * **Le tarif convenu, lu dans la mercuriale** (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD8). Seul un payeur sur
 * devis de période est borné ; pour lui, ce qu'il peut commander est ce que
 * cite la mercuriale qui AGIT au jour de livraison — une mercuriale suspendue
 * ne tient aucun prix convenu, et n'en admet donc aucun article.
 */
@Injectable()
export class PricingNegotiatedScope extends NegotiatedScope {
  constructor(
    private readonly requirements: PayerCommitmentRequirements,
    private readonly mercuriales: CompanyMercurialeReader,
    private readonly clock: Clock,
  ) {
    super();
  }

  async scopeFor(payerCompanyId: string, day: string | null): Promise<ReadonlySet<string> | null> {
    const terms = await this.requirements.of(payerCompanyId);
    if (terms.kind !== "public" || terms.timing !== "on_period_quote") {
      return null;
    }
    const at = day === null ? this.clock.now() : deliveryMomentOf(day);
    const mercuriale = await this.mercuriales.liveFor(payerCompanyId, at);
    if (mercuriale === null || !actsAt(mercuriale.suspendedFrom, at)) {
      return new Set();
    }
    return new Set(mercuriale.linesAt(at).map((line) => line.sku));
  }
}

/** @throws {NegotiatedScopeDayError} le jour n'est pas une date lisible. */
function deliveryMomentOf(day: string): Date {
  const instant = localToInstant(day, DELIVERY_MOMENT);
  if (instant === null) {
    throw new NegotiatedScopeDayError(day);
  }
  return instant;
}
