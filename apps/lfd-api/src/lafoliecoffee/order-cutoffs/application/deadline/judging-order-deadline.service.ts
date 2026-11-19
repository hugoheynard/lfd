import type { OrderCutoffStatus } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  generalRuleStatus,
  judgeOrderDeadline,
  priceLateness,
} from "../../domain/deadline/judge-order-deadline.js";
import type {
  OrderDeadlineVerdict,
  WaiverAvailable,
} from "../../domain/deadline/order-deadline-verdict.js";
import {
  ItemOrderLimitsReader,
  LateFeeSettingReader,
  OpenWaiverReader,
} from "../../domain/deadline/ports/deadline-sources.js";
import { OrderCutoffsInForce } from "../../domain/order-cutoffs-in-force.js";
import { OrderDeadline, type OrderDeadlineQuestion } from "./order-deadline.js";

/**
 * {@link OrderDeadline} : lit ce que la question demande, en parallèle, puis
 * laisse juger le juge pur.
 *
 * Ce qui n'est pas lu, et pourquoi :
 * - la dérogation, pour une question qui l'ignore ou sans société : elle
 *   n'appartient qu'à une société, et l'avis ne dit que l'état de la journée ;
 * - la surtaxe, hors d'un rattrapage qu'une dérogation ferait passer : une
 *   requête de plus sur chaque commande à l'heure, pour un réglage que la
 *   plupart des maisons n'ont pas, se paierait partout.
 */
@Injectable()
export class JudgingOrderDeadline extends OrderDeadline {
  constructor(
    private readonly rules: OrderCutoffsInForce,
    private readonly items: ItemOrderLimitsReader,
    private readonly waivers: OpenWaiverReader,
    private readonly lateFees: LateFeeSettingReader,
  ) {
    super();
  }

  async verdict(question: OrderDeadlineQuestion): Promise<OrderDeadlineVerdict> {
    const skus = [...new Set(question.skus)];
    const [generalRules, limits, waiver] = await Promise.all([
      this.rules.list(),
      this.items.limitsOf(skus, question.asker.audience),
      this.waiverFor(question),
    ]);
    const settled = new Set(question.settledItemLimits ?? []);
    const verdict = judgeOrderDeadline({
      lines: question.skus.map((sku) => ({
        sku,
        limit: settled.has(sku) ? null : (limits.get(sku) ?? null),
      })),
      generalRules,
      serviceDay: question.serviceDay,
      at: question.at,
      waiver,
      exceedItemLimits: question.asker.exceedItemLimits,
    });
    if (verdict.kind !== "grace" || verdict.waiver === null) {
      return verdict;
    }
    return priceLateness(verdict, await this.lateFees.current());
  }

  async generalRuleStatuses(
    serviceDays: readonly string[],
    at: Date,
  ): Promise<ReadonlyMap<string, OrderCutoffStatus>> {
    const rules = await this.rules.list();
    return new Map(serviceDays.map((day) => [day, generalRuleStatus(rules, day, at)]));
  }

  private waiverFor(question: OrderDeadlineQuestion): Promise<WaiverAvailable | null> {
    const { companyId, waiver } = question.asker;
    return waiver === "ignore" || companyId === null
      ? Promise.resolve(null)
      : this.waivers.openFor(companyId, question.serviceDay);
  }
}
