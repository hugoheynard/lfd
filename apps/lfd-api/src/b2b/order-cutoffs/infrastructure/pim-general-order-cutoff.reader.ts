import { Injectable } from "@nestjs/common";

import {
  type GeneralOrderCutoff,
  GeneralOrderCutoffReader,
} from "../../../pim/channels/b2b-platform/general-order-cutoff/general-order-cutoff.reader.js";
import { StoredOrderCutoffReader } from "../domain/stored-order-cutoff.reader.js";

/**
 * Le commerce sert au référentiel **sa règle générale** — ni point, ni jour,
 * la seule depuis le 2026-10-21. L'interrupteur qu'elle disait aussi est
 * retiré le même jour (`limites-de-commande/plan-une-seule-heure.md` §5).
 */
@Injectable()
export class CommerceGeneralOrderCutoffReader extends GeneralOrderCutoffReader {
  constructor(private readonly stored: StoredOrderCutoffReader) {
    super();
  }

  async read(): Promise<GeneralOrderCutoff> {
    const general = await this.stored.general();
    return {
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
