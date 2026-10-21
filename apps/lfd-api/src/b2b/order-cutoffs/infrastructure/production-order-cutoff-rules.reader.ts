import { resolveOrderCutoff } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  type OrderCutoffRule,
  OrderCutoffRulesReader,
} from "../../../production/channels/commerce/index.js";
import { OrderCutoffsInForce } from "../domain/order-cutoffs-in-force.js";

/**
 * **Les heures limites, rendues au fournil** — ce qui déclenche l'arrêt
 * automatique du plan, et en deçà de quoi un arrêt à la main est refusé
 * (2026-10-21, `limites-de-commande/plan-une-seule-heure.md` §5).
 *
 * Le commerce implémente le port que la production déclare : elle ne lit pas
 * ses tables. Depuis le 2026-10-21, la règle générale seule (schéma des
 * réglages §4, point 4) : une ligne résiduelle à point ou à jour est ignorée,
 * elle ne repousse plus l'heure d'arrêt. Aucune règle posée : il n'en rend
 * aucune, et rien n'arrête le plan tout seul.
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
