import { Injectable } from "@nestjs/common";

import { OrderCutoffSettingsReader } from "../../order-cutoffs/domain/order-cutoff-settings.reader.js";
import { LateToleranceReader } from "../domain/ports/late-tolerance.reader.js";

/**
 * La tolérance de retard, lue sur le réglage singleton de l'heure limite —
 * comme les délais des relances (`SettingsCustomerNudgeDelaysReader`). Ligne
 * absente : le défaut du contrat, 15 minutes.
 */
@Injectable()
export class SettingsLateToleranceReader extends LateToleranceReader {
  constructor(private readonly settings: OrderCutoffSettingsReader) {
    super();
  }

  async lateToleranceMinutes(): Promise<number> {
    return (await this.settings.current()).lateToleranceMinutes;
  }
}
