import { Injectable } from "@nestjs/common";

import { ResupplyCutoffTimeReader } from "../../../production/channels/commerce/index.js";
import { OrderCutoffSettingsReader } from "../domain/order-cutoff-settings.reader.js";

/**
 * **L'heure du réassort, rendue au fournil** (lot R3a, 2026-10-21) : le plan
 * s'arrête à la plus tardive d'elle et de la fin du rattrapage de l'heure
 * limite générale. Le commerce implémente le port que la production déclare ;
 * elle ne lit pas ses tables. Réglage jamais posé : l'heure par défaut.
 */
@Injectable()
export class ProductionResupplyCutoffTimeReader extends ResupplyCutoffTimeReader {
  constructor(private readonly settings: OrderCutoffSettingsReader) {
    super();
  }

  async eveTime(): Promise<string> {
    return (await this.settings.current()).resupplyCutoffTime;
  }
}
