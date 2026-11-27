import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import {
  PlannedBasketCheck,
  type PlannedBasketCheckItem,
  type PlannedBasketCheckRequest,
  type PlannedLineCheck,
} from "../../../../recurring/channels/commerce/index.js";
import { ReservedArticleGuard } from "../../../catalog/application/reserved-article-guard.service.js";
import { OrderDeadline, type OrderDeadlineVerdict } from "../../../order-cutoffs/index.js";
import { judgeLine } from "./planned-line-judges.js";
import { PlannedOrderingGates } from "./planned-ordering-gates.js";

/**
 * **Ce que dirait la passation** d'un panier planifié — l'implémentation, par
 * le commerce, du port que le planificateur déclare (plan du planificateur,
 * § 4 bis).
 *
 * Les juges sont ceux de la passation d'une colonne, sans passe-droit :
 *
 * - la société : acheteur encore membre, pas un payeur public, boutique
 *   ouverte ({@link PlannedOrderingGates}) ;
 * - le jour : premier jour commandable, plan arrêté, jour même ;
 * - l'article servi à la société, par le mur des articles réservés, et son
 *   unité (une ligne planifiée se compte en pièces) ;
 * - l'heure limite, par `OrderDeadline`, en clientèle `pro`, **sans
 *   dérogation** (`waiver: "ignore"`) ni droit de passer outre — un
 *   rattrapage est un refus pour une machine ;
 * - le minimum d'achat, sur la quantité de la ligne ;
 * - le règlement au compte, en dernier comme à la passation.
 *
 * La phrase est celle de `recurringRefusalOf` appliquée à l'erreur même que
 * la passation lèverait : l'avertissement et le refus ne divergent pas.
 *
 * Une lecture par porte pour toute la grille, une question au délai de
 * commande **par jour** affiché (il ne sait pas répondre à plusieurs jours).
 */
@Injectable()
export class CommercePlannedBasketCheck extends PlannedBasketCheck {
  constructor(
    private readonly deadline: OrderDeadline,
    private readonly articles: ReservedArticleGuard,
    private readonly gates: PlannedOrderingGates,
    private readonly clock: Clock,
  ) {
    super();
  }

  async check(request: PlannedBasketCheckRequest): Promise<readonly PlannedLineCheck[]> {
    const { companyId, buyerUserId, items } = request;
    if (items.length === 0) {
      return [];
    }
    const at = this.clock.now();
    const days = [...new Set(items.map((item) => item.day))];
    const skus = items.map((item) => item.sku);
    const [company, settlement, dayBlockings, articleRefusals, terms, verdicts] = await Promise.all(
      [
        this.gates.companyBlocking(companyId, buyerUserId),
        this.gates.settlementBlocking(companyId, at),
        this.gates.dayBlockings(companyId, buyerUserId, days, at),
        this.articles.refusalsFor(companyId, skus),
        this.gates.saleTerms(companyId, skus),
        Promise.all(days.map((day) => this.verdictOf(companyId, day, items, at))),
      ],
    );
    const byDay = new Map<string, OrderDeadlineVerdict>();
    days.forEach((day, index) => {
      const verdict = verdicts[index];
      if (verdict !== undefined) {
        byDay.set(day, verdict);
      }
    });
    return items.map((item) =>
      judgeLine(item, {
        company,
        settlement,
        days: dayBlockings,
        articleRefusals,
        terms,
        verdicts: byDay,
      }),
    );
  }

  private verdictOf(
    companyId: string,
    day: string,
    items: readonly PlannedBasketCheckItem[],
    at: Date,
  ): Promise<OrderDeadlineVerdict> {
    return this.deadline.verdict({
      skus: [...new Set(items.filter((item) => item.day === day).map((item) => item.sku))],
      serviceDay: day,
      at,
      asker: {
        audience: "pro",
        companyId,
        waiver: "ignore",
        exceedItemLimits: false,
        itemLimitFloor: "general_rule_open",
      },
    });
  }
}
