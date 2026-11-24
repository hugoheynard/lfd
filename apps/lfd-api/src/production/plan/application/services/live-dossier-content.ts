import { Injectable } from "@nestjs/common";

import { DayOrdersReader } from "../../../channels/commerce/day-orders.reader.js";
import { DayResuppliesReader } from "../../../channels/commerce/day-resupplies.reader.js";
import { OrderWithdrawalsReader, type ServiceDay, arrestPreviewOf } from "../../../day/index.js";
import type { DossierContent } from "./production-paper.service.js";

/**
 * **Ce que le dossier dessinerait si l'on arrêtait maintenant** — les
 * commandes du commerce moins les retraits, et les réassorts « pour demain »,
 * recopiés par la conversion de l'arrêt (`arrestPreviewOf`).
 *
 * Lu HORS du verrou de la journée, et c'est voulu : une impression provisoire
 * est un aperçu, pas un arrêt. Ce qu'elle montre peut changer la seconde
 * d'après, et c'est exactement ce que ses empreintes et sa version servent à
 * dire ensuite.
 */
@Injectable()
export class LiveDossierContent {
  constructor(
    private readonly orders: DayOrdersReader,
    private readonly withdrawals: OrderWithdrawalsReader,
    private readonly resupplies: DayResuppliesReader,
  ) {}

  async read(day: ServiceDay): Promise<DossierContent> {
    const [withdrawn, resupplies, producible] = await Promise.all([
      this.withdrawals.withdrawnOn(day),
      this.resupplies.placedFor(day),
      this.orders.producibleFor(day),
    ]);
    return { serviceDay: day.value, ...arrestPreviewOf(producible, withdrawn, resupplies) };
  }
}
