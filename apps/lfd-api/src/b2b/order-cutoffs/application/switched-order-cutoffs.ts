import type { OrderCutoffView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { OrderCutoffSettingsReader } from "../domain/order-cutoff-settings.reader.js";
import { OrderCutoffsInForce } from "../domain/order-cutoffs-in-force.js";
import { StoredOrderCutoffReader } from "../domain/stored-order-cutoff.reader.js";

/**
 * {@link OrderCutoffsInForce}, composé de deux ports : l'interrupteur, puis la
 * table. Désactivée, la table n'est pas lue — la règle dort, elle n'est pas
 * filtrée : la règle du commerce s'éteint d'un bloc (plan, §8.1). Depuis le
 * 2026-10-21, la liste rendue tient au plus une ligne, la générale.
 */
@Injectable()
export class SwitchedOrderCutoffs extends OrderCutoffsInForce {
  constructor(
    private readonly settings: OrderCutoffSettingsReader,
    private readonly stored: StoredOrderCutoffReader,
  ) {
    super();
  }

  async list(): Promise<readonly OrderCutoffView[]> {
    const { enabled } = await this.settings.current();
    if (!enabled) {
      return [];
    }
    const general = await this.stored.general();
    return general === null ? [] : [general];
  }
}
