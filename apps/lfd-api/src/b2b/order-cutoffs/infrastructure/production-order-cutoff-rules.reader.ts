import { resolveOrderCutoff } from "@lfd/contracts";
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
 * ses tables. Depuis le 2026-10-21, la règle générale seule (schéma des
 * réglages §4, point 4) : une ligne résiduelle à point ou à jour est ignorée,
 * elle ne repousse plus l'heure d'arrêt.
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
    const general = resolveOrderCutoff(await this.cutoffs.list());
    return general === null
      ? []
      : [
          {
            daysBefore: general.daysBefore,
            time: general.time,
            graceMinutes: general.graceMinutes,
          },
        ];
  }
}
