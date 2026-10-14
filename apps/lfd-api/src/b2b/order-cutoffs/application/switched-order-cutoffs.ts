import type { OrderCutoffView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { OrderCutoffSettingsReader } from "../domain/order-cutoff-settings.reader.js";
import { OrderCutoffRepository } from "../domain/order-cutoff.repository.js";
import { OrderCutoffsInForce } from "../domain/order-cutoffs-in-force.js";

/**
 * {@link OrderCutoffsInForce}, composé de deux ports : l'interrupteur, puis la
 * table. Désactivée, la table n'est pas lue — la règle dort, elle n'est pas
 * filtrée ligne à ligne : toute la règle du commerce s'éteint ensemble,
 * lignes par point ou par jour comprises (plan, §8.1).
 */
@Injectable()
export class SwitchedOrderCutoffs extends OrderCutoffsInForce {
  constructor(
    private readonly settings: OrderCutoffSettingsReader,
    private readonly cutoffs: OrderCutoffRepository,
  ) {
    super();
  }

  async list(): Promise<readonly OrderCutoffView[]> {
    const { enabled } = await this.settings.current();
    return enabled ? this.cutoffs.list() : [];
  }
}
