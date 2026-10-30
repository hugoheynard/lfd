import type { StandingCompanyStatus } from "../../../shared/company-standing/domain/company-standing.js";
import type { LivePromotion } from "../../domain/live-promotion.js";
import { BasketPromotionReader } from "../../domain/ports/basket-promotion.reader.js";
import { LinePromotionReader } from "../../domain/ports/line-promotion.reader.js";
import { PromotionCompanyStatusReader } from "../../domain/ports/promotion-company-status.reader.js";
import { PromotionPrincipalReader } from "../../domain/ports/promotion-principal.reader.js";
import {
  PromotionShadowJournal,
  type PromotionShadowDivergence,
} from "../../domain/ports/promotion-shadow.journal.js";
import { PromotionsSourceReader } from "../../domain/ports/promotions-source.reader.js";
import type { PromotionsSource } from "../../domain/promotions-source.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { LinePromotionSupply } from "../line-promotion-supply.js";
import { ShelfPromotionOffers } from "../shelf-promotion-offers.js";
import { PromotionAudienceFactsResolver } from "../promotion-audience-facts.resolver.js";

/**
 * **Les doublés des lecteurs de promotions au calcul** (plan des promotions,
 * L5) — chacun hérite du port qu'il joue, aucun `jest.fn()`. Partagés par les
 * suites qui assemblent le vrai chargeur des prix.
 */

export class FixedPromotionsSource extends PromotionsSourceReader {
  constructor(private readonly source: PromotionsSource) {
    super();
  }

  current(): Promise<PromotionsSource> {
    return Promise.resolve(this.source);
  }
}

export class FixedLinePromotions extends LinePromotionReader {
  /** Combien de fois le présent a été lu — l'ombre et `legacy` le surveillent. */
  reads = 0;

  constructor(private readonly promotions: readonly LivePromotion[] = []) {
    super();
  }

  live(): Promise<readonly LivePromotion[]> {
    this.reads += 1;
    return Promise.resolve(this.promotions);
  }

  liveAt(): Promise<readonly LivePromotion[]> {
    this.reads += 1;
    return Promise.resolve(this.promotions);
  }
}

export class FixedBasketPromotions extends BasketPromotionReader {
  /** Combien de fois le présent a été lu — `legacy` ne doit rien lire. */
  reads = 0;

  constructor(private readonly promotions: readonly LivePromotion[] = []) {
    super();
  }

  live(): Promise<readonly LivePromotion[]> {
    this.reads += 1;
    return Promise.resolve(this.promotions);
  }

  liveAt(at: Date): Promise<readonly LivePromotion[]> {
    return Promise.resolve(this.promotions.filter((promotion) => promotion.validFrom <= at));
  }
}

export class FixedCompanyStatuses extends PromotionCompanyStatusReader {
  /** Les sociétés dont le statut a été demandé, dans l'ordre. */
  readonly asked: string[] = [];

  constructor(private readonly statuses: ReadonlyMap<string, StandingCompanyStatus> = new Map()) {
    super();
  }

  companyStatusOf(companyId: string): Promise<StandingCompanyStatus | null> {
    this.asked.push(companyId);
    return Promise.resolve(this.statuses.get(companyId) ?? null);
  }
}

export class FixedPrincipals extends PromotionPrincipalReader {
  /** Les sociétés dont le principal a été demandé, dans l'ordre. */
  readonly asked: string[] = [];

  constructor(private readonly principals: ReadonlyMap<string, string> = new Map()) {
    super();
  }

  principalOf(companyId: string): Promise<string | null> {
    this.asked.push(companyId);
    return Promise.resolve(this.principals.get(companyId) ?? null);
  }
}

export class RecordingShadowJournal extends PromotionShadowJournal {
  readonly entries: PromotionShadowDivergence[] = [];

  divergence(entry: PromotionShadowDivergence): void {
    this.entries.push(entry);
  }
}

/** La fourniture de la source `legacy` : l'existant, rien de lu. */
export function legacyLinePromotionSupply(): LinePromotionSupply {
  return linePromotionSupply("legacy", []);
}

export function linePromotionSupply(
  source: PromotionsSource,
  promotions: readonly LivePromotion[],
  journal: PromotionShadowJournal = new RecordingShadowJournal(),
  statuses: PromotionCompanyStatusReader = new FixedCompanyStatuses(),
): LinePromotionSupply {
  return new LinePromotionSupply(
    new FixedPromotionsSource(source),
    new FixedLinePromotions(promotions),
    new PromotionAudienceFactsResolver(statuses, new FixedPrincipals()),
    journal,
  );
}

/**
 * Ce que le rayon mentionne (L10) — par défaut `legacy`, qui ne lit rien :
 * les suites d'avant L10.
 */
export function shelfPromotionOffers(
  source: PromotionsSource = "legacy",
  basket: readonly LivePromotion[] = [],
  at: Date = new Date(Date.UTC(2030, 0, 1)),
  statuses: PromotionCompanyStatusReader = new FixedCompanyStatuses(),
): ShelfPromotionOffers {
  return new ShelfPromotionOffers(
    new FixedPromotionsSource(source),
    new FixedBasketPromotions(basket),
    new PromotionAudienceFactsResolver(statuses, new FixedPrincipals()),
    new FixedClock(at),
  );
}
