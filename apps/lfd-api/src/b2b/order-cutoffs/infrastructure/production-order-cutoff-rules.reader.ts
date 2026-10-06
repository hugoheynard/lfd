import { Injectable } from "@nestjs/common";

import {
  type OrderCutoffRule,
  OrderCutoffRulesReader,
} from "../../../production/channels/commerce/index.js";
import { OrderCutoffRepository } from "../domain/order-cutoff.repository.js";

/**
 * **Les heures limites, rendues au fournil** — ce que l'arrêt automatique du
 * plan ne doit pas précéder (`documentation/production/plan-arret-du-plan.md`,
 * Q5).
 *
 * Le commerce implémente le port que la production déclare : elle ne lit pas
 * ses tables. Toutes les règles, sans point ni jour — l'heure d'arrêt est une
 * pour la maison, elle suit la plus tardive.
 */
@Injectable()
export class ProductionOrderCutoffRulesReader extends OrderCutoffRulesReader {
  constructor(private readonly cutoffs: OrderCutoffRepository) {
    super();
  }

  async rules(): Promise<readonly OrderCutoffRule[]> {
    const rules = await this.cutoffs.list();
    return rules.map((rule) => ({
      daysBefore: rule.daysBefore,
      time: rule.time,
      graceMinutes: rule.graceMinutes,
    }));
  }
}
