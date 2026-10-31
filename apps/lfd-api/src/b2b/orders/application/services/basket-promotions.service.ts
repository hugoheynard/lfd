import type { LocalMoment } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import {
  PromotionAudienceFactsResolver,
  type KnownBuyerFacts,
} from "../../../promotions/application/promotion-audience-facts.resolver.js";
import {
  promotionsAdmitted,
  promotionsAdmittedAtAnyHour,
} from "../../../promotions/domain/live-promotion.js";
import { BasketPromotionReader } from "../../../promotions/domain/ports/basket-promotion.reader.js";
import { endedBasketPromotions } from "../../domain/services/ended-basket-promotions.js";
import {
  chooseBasketPromotion,
  needsClassifications,
  type BasketLine,
  type BasketPromotionOutcome,
} from "../../domain/services/basket-promotion-choice.js";
import {
  type OrderLineClassification,
  OrderLineClassificationReader,
} from "../../domain/ports/order-line-classification.reader.js";

/** Ce que la caisse sait du panier quand elle demande sa promotion panier. */
export interface BasketPromotionRequest {
  readonly lines: readonly BasketLine[];
  /** Établis au serveur — l'acheminement retenu compris (point présélectionné inclus). */
  readonly buyer: KnownBuyerFacts;
  /** Le rangement que la passation a déjà lu ; `null` au devis. */
  readonly known: ReadonlyMap<string, OrderLineClassification> | null;
  /**
   * Le créneau choisi, lu à la pendule de Paris — son début, sa fin sans
   * début ; `null` sans créneau (le devis de la boutique, une livraison sans
   * tranche) : une promotion jugée au créneau ne s'applique pas
   * (`plan-jours-et-heures.md`, § 8.3).
   */
  readonly handoverAt: LocalMoment | null;
}

/**
 * **Le point PANIER** (`documentation/promotions/promotions.md`, § 2.2, lots L5 et L12) : la promotion panier de ce panier. Depuis L12, la
 * seule source — la remise d'un site n'est plus lue.
 *
 * La fenêtre se juge à l'instant de la question — le `now` du `Clock`, comme
 * les règles de prix au présent. Aucune lecture datée d'un panier n'existe
 * encore : quand elle viendra, elle passera son `at` (§ 14 S-instant).
 *
 * Les jours et heures (`plan-jours-et-heures.md`, § 8) se jugent au même
 * `now` — la commande — ou au créneau de la requête (`handoverAt`).
 */
@Injectable()
export class BasketPromotions {
  private readonly logger = new Logger(BasketPromotions.name);

  constructor(
    private readonly promotions: BasketPromotionReader,
    private readonly facts: PromotionAudienceFactsResolver,
    private readonly classifications: OrderLineClassificationReader,
    private readonly clock: Clock,
  ) {}

  /** La promotion panier de ce panier. */
  async resolve(request: BasketPromotionRequest): Promise<BasketPromotionOutcome> {
    const at = this.clock.now();
    const all = await this.promotions.live();
    const facts = await this.facts.factsFor(request.buyer, all);
    const candidates = promotionsAdmitted(all, at, facts, request.handoverAt);
    // Jours et heures non jugés : ce qui a pris fin aujourd'hui se dit (§ 8).
    const atAnyHour = promotionsAdmittedAtAnyHour(all, at, facts);
    const known =
      request.known ??
      (needsClassifications(atAnyHour)
        ? await this.classifications.classify(request.lines.map((line) => line.sku))
        : new Map<string, OrderLineClassification>());
    const outcome = chooseBasketPromotion(candidates, request.lines, known);
    if (outcome.beyondCap !== undefined) {
      // La pose refuse une sixième cumulable ; si l'on en trouve plus de cinq
      // ici, la caisse ne tombe pas : elle garde les cinq premières, et
      // l'équipe doit l'apprendre (plan des promotions, M7, 2026-10-31).
      this.logger.warn(
        `Plus de cinq promotions panier cumulables pour ce panier : écartées ${outcome.beyondCap.join(", ")}. ` +
          "Archiver ou restreindre l'une d'elles à l'écran Promotions.",
      );
    }
    const ended = endedBasketPromotions(atAnyHour, at, request.lines, known);
    return ended.length === 0 ? outcome : { ...outcome, ended };
  }
}
