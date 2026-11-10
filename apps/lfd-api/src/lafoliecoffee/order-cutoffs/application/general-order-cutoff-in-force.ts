import type { OrderCutoffView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { OrderCutoffsInForce } from "../domain/order-cutoffs-in-force.js";
import { StoredOrderCutoffReader } from "../domain/stored-order-cutoff.reader.js";

/**
 * {@link OrderCutoffsInForce} : la règle générale enregistrée, toujours.
 *
 * Elle lisait l'interrupteur d'abord (`SwitchedOrderCutoffs`, lot O3) et ne
 * servait rien quand il était coupé. Retiré le 2026-10-21 : l'heure limite
 * générale déclenche l'arrêt du plan, une heure limite qu'on coupe ne
 * l'arrêterait plus (`limites-de-commande/plan-une-seule-heure.md` §5). La
 * colonne `order_cutoff_settings.enabled` reste en base ; elle n'est plus lue.
 */
@Injectable()
export class GeneralOrderCutoffInForce extends OrderCutoffsInForce {
  constructor(private readonly stored: StoredOrderCutoffReader) {
    super();
  }

  async list(): Promise<readonly OrderCutoffView[]> {
    const general = await this.stored.general();
    return general === null ? [] : [general];
  }
}
