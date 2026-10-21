import { generalOrderCutoff } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  type GeneralOrderCutoff,
  GeneralOrderCutoffReader,
} from "../../../pim/channels/b2b-platform/general-order-cutoff/general-order-cutoff.reader.js";
import { OrderCutoffSettingsReader } from "../domain/order-cutoff-settings.reader.js";
import { OrderCutoffRepository } from "../domain/order-cutoff.repository.js";

/**
 * Le commerce sert au référentiel **sa règle générale** — la ligne par défaut
 * (ni point, ni jour), et l'état de l'interrupteur.
 *
 * Lue sur le dépôt et non sur `OrderCutoffsInForce` : la page doit pouvoir
 * dire « désactivée » et montrer ce que la réactivation remettra, comme
 * l'écran des réglages.
 */
@Injectable()
export class CommerceGeneralOrderCutoffReader extends GeneralOrderCutoffReader {
  constructor(
    private readonly settings: OrderCutoffSettingsReader,
    private readonly cutoffs: OrderCutoffRepository,
  ) {
    super();
  }

  async read(): Promise<GeneralOrderCutoff> {
    const [{ enabled }, rules] = await Promise.all([this.settings.current(), this.cutoffs.list()]);
    const general = generalOrderCutoff(rules);
    return {
      enabled,
      rule:
        general === null
          ? null
          : {
              daysBefore: general.daysBefore,
              time: general.time,
              graceMinutes: general.graceMinutes,
            },
    };
  }
}
