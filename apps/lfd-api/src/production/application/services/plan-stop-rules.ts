import { Injectable } from "@nestjs/common";

import { OrderCutoffRulesReader } from "../../channels/commerce/order-cutoff-rules.reader.js";
import { ResupplyCutoffTimeReader } from "../../channels/commerce/resupply-cutoff-time.reader.js";
import { type PlanStopRule, planStopRules } from "../../domain/services/latest-order-cutoff.js";

/**
 * **Les heures qui arrêtent le plan**, lues au commerce par les deux ports du
 * canal (lot R3a, 2026-10-21) : la règle générale et l'heure du réassort.
 *
 * Un seul endroit pour les quatre lecteurs de l'arrêt — l'arrêt automatique,
 * le refus d'un arrêt anticipé, le prévisionnel et la page Production ›
 * Réglages : s'ils combinaient chacun, l'un finirait par dire une autre heure
 * que celle où le plan s'arrête vraiment.
 */
@Injectable()
export class PlanStopRules {
  constructor(
    private readonly cutoffRules: OrderCutoffRulesReader,
    private readonly resupplyCutoff: ResupplyCutoffTimeReader,
  ) {}

  /** Vide sans règle générale : rien n'arrête le plan tout seul. */
  async rules(): Promise<readonly PlanStopRule[]> {
    const [rules, resupplyTime] = await Promise.all([
      this.cutoffRules.rules(),
      this.resupplyCutoff.eveTime(),
    ]);
    return planStopRules(rules[0] ?? null, resupplyTime);
  }
}
