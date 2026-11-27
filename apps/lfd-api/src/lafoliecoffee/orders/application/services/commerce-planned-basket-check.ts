import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import type { BusinessError } from "../../../../platform/shared/errors/app-error.js";
import {
  PlannedBasketCheck,
  type PlannedBasketCheckItem,
  type PlannedBasketCheckRequest,
  type PlannedLineBlocking,
  type PlannedLineCheck,
} from "../../../../recurring/channels/commerce/index.js";
import { ReservedArticleGuard } from "../../../catalog/application/reserved-article-guard.service.js";
import {
  OrderDeadline,
  type LineVerdict,
  type OrderDeadlineVerdict,
} from "../../../order-cutoffs/index.js";
import { OrderCutoffGraceError, PastOrderCutoffError } from "../../domain/errors/order-errors.js";
import { recurringRefusalOf } from "./recurring-refusal.js";

/**
 * **Ce que dirait la passation** d'un panier planifié — l'implémentation, par
 * le commerce, du port que le planificateur déclare (plan du planificateur,
 * § 4 bis).
 *
 * Les juges sont ceux de la passation d'une échéance, sans passe-droit :
 *
 * - l'heure limite, par `OrderDeadline`, en clientèle `pro`, **sans
 *   dérogation** (`waiver: "ignore"`) ni droit de passer outre — comme
 *   `RECURRING_OCCURRENCE_POLICY` ; un rattrapage est un refus pour une
 *   machine ;
 * - l'article servi à la société, par le mur des articles réservés.
 *
 * La phrase est celle de `recurringRefusalOf` appliquée à l'erreur même que
 * la passation lèverait : l'avertissement et le refus ne divergent pas.
 *
 * Une lecture des articles pour toute la grille, une question au délai de
 * commande **par jour** affiché (le délai ne sait pas répondre à plusieurs
 * jours à la fois).
 */
@Injectable()
export class CommercePlannedBasketCheck extends PlannedBasketCheck {
  constructor(
    private readonly deadline: OrderDeadline,
    private readonly articles: ReservedArticleGuard,
    private readonly clock: Clock,
  ) {
    super();
  }

  async check(request: PlannedBasketCheckRequest): Promise<readonly PlannedLineCheck[]> {
    const { companyId, items } = request;
    if (items.length === 0) {
      return [];
    }
    const at = this.clock.now();
    const days = [...new Set(items.map((item) => item.day))];
    const [refusals, verdicts] = await Promise.all([
      this.articles.refusalsFor(
        companyId,
        items.map((item) => item.sku),
      ),
      Promise.all(days.map((day) => this.verdictOf(companyId, day, items, at))),
    ]);
    const byDay = new Map(days.map((day, index) => [day, verdicts[index]]));
    return items.map((item) => lineCheck(item, refusals.get(item.sku), byDay.get(item.day)));
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

/**
 * La réponse d'un article : l'article fermé à la société d'abord (la
 * passation le refuse au chargement, avant l'heure), puis l'heure limite.
 * Tous deux tiennent à l'article et au jour, jamais à la quantité.
 */
function lineCheck(
  item: PlannedBasketCheckItem,
  articleRefusal: BusinessError | undefined,
  verdict: OrderDeadlineVerdict | undefined,
): PlannedLineCheck {
  const line = verdict?.lines.get(item.sku);
  const deadlineError =
    line === undefined || verdict === undefined ? null : deadlineRefusal(item.day, line, verdict);
  const error = articleRefusal ?? deadlineError;
  return {
    sku: item.sku,
    day: item.day,
    columnId: item.columnId,
    closesAt: line?.limit ?? verdict?.limit ?? null,
    blocking: error === null ? null : blockingOf(error),
    quantityIndependent: true,
  };
}

/** L'erreur que `admitWithinDeadline` lèverait pour cette ligne, sans dérogation. */
function deadlineRefusal(
  day: string,
  line: LineVerdict,
  verdict: OrderDeadlineVerdict,
): BusinessError | null {
  if (line.status === "open") {
    return null;
  }
  if (line.status === "grace" && verdict.graceEnd !== null) {
    return new OrderCutoffGraceError(day, verdict.graceEnd);
  }
  return new PastOrderCutoffError(day);
}

function blockingOf(error: BusinessError): PlannedLineBlocking | null {
  const refusal = recurringRefusalOf(error);
  return refusal === null ? null : { cause: refusal.cause, reason: refusal.reason };
}
