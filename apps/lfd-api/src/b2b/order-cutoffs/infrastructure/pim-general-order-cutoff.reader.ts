import { Injectable } from "@nestjs/common";

import {
  type GeneralOrderCutoff,
  GeneralOrderCutoffReader,
} from "../../../pim/channels/b2b-platform/general-order-cutoff/general-order-cutoff.reader.js";
import { OrderCutoffSettingsReader } from "../domain/order-cutoff-settings.reader.js";
import { StoredOrderCutoffReader } from "../domain/stored-order-cutoff.reader.js";

/**
 * Le commerce sert au référentiel **sa règle générale** — ni point, ni jour,
 * la seule depuis le 2026-10-21 —, et l'état de l'interrupteur.
 *
 * Lue sur le dépôt et non sur `OrderCutoffsInForce` : la page doit pouvoir
 * dire « désactivée » et montrer ce que la réactivation remettra, comme
 * l'écran des réglages.
 */
@Injectable()
export class CommerceGeneralOrderCutoffReader extends GeneralOrderCutoffReader {
  constructor(
    private readonly settings: OrderCutoffSettingsReader,
    private readonly stored: StoredOrderCutoffReader,
  ) {
    super();
  }

  async read(): Promise<GeneralOrderCutoff> {
    const [{ enabled }, general] = await Promise.all([
      this.settings.current(),
      this.stored.general(),
    ]);
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
