import { orderCutoffInstant, resolveOrderCutoff } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { OrderCutoffSettingsReader } from "../../order-cutoffs/domain/order-cutoff-settings.reader.js";
import { OrderCutoffsInForce } from "../../order-cutoffs/domain/order-cutoffs-in-force.js";
import { ResupplyCutoff } from "../domain/resupply-cutoff.js";

/**
 * {@link ResupplyCutoff} sur la règle du commerce : la règle générale en
 * vigueur (`OrderCutoffsInForce`, celle que la passation oppose) et le
 * réglage `resupply_subject_to_cutoff`. L'heure annoncée, grâce non comprise :
 * le rattrapage d'une commande est un geste humain sur une commande client,
 * pas une seconde heure pour le réassort.
 */
@Injectable()
export class GeneralResupplyCutoff extends ResupplyCutoff {
  constructor(
    private readonly rules: OrderCutoffsInForce,
    private readonly settings: OrderCutoffSettingsReader,
  ) {
    super();
  }

  async deadlineFor(serviceDay: string): Promise<Date | null> {
    const settings = await this.settings.current();
    if (!settings.resupplySubjectToCutoff) {
      return null;
    }
    const rule = resolveOrderCutoff(await this.rules.list());
    return rule === null ? null : orderCutoffInstant(rule, serviceDay);
  }
}
