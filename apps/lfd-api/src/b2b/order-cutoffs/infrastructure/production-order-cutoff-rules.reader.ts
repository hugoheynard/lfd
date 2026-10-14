import { Injectable } from "@nestjs/common";

import {
  type OrderCutoffRule,
  OrderCutoffRulesReader,
} from "../../../production/channels/commerce/index.js";
import { OrderCutoffsInForce } from "../domain/order-cutoffs-in-force.js";

/**
 * **Les heures limites, rendues au fournil** — ce que l'arrêt automatique du
 * plan ne doit pas précéder (`documentation/production/arret-du-plan.md`,
 * Q5).
 *
 * Le commerce implémente le port que la production déclare : elle ne lit pas
 * ses tables. Toutes les règles, sans point ni jour — l'heure d'arrêt est une
 * pour la maison, elle suit la plus tardive.
 *
 * Les règles EN VIGUEUR (lot O3, 2026-10-14) : l'heure limite générale
 * désactivée, il n'en rend aucune, et plus rien ne borne l'heure d'arrêt —
 * c'est voulu (`plan-reglages-commandes.md`, §8.1, B2).
 */
@Injectable()
export class ProductionOrderCutoffRulesReader extends OrderCutoffRulesReader {
  constructor(private readonly cutoffs: OrderCutoffsInForce) {
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
