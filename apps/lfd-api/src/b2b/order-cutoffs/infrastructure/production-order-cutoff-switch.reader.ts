import { Injectable } from "@nestjs/common";

import { OrderCutoffSwitchReader } from "../../../production/channels/commerce/index.js";
import { OrderCutoffSettingsReader } from "../domain/order-cutoff-settings.reader.js";

/**
 * **L'interrupteur de l'heure limite générale, rendu au fournil** — pour que
 * Production › Réglages dise « désactivée » plutôt que « aucune heure limite »
 * (`plan-reglages-commandes.md`, §8.1, B2, lot O3).
 */
@Injectable()
export class ProductionOrderCutoffSwitchReader extends OrderCutoffSwitchReader {
  constructor(private readonly settings: OrderCutoffSettingsReader) {
    super();
  }

  async enabled(): Promise<boolean> {
    return (await this.settings.current()).enabled;
  }
}
