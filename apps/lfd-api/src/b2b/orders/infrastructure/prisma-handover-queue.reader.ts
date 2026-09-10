import { Injectable } from "@nestjs/common";

import {
  HandoverQueueReader,
  type HandoverQueueEntry,
} from "../../../handover/channels/commerce/index.js";
import { OrderReader } from "../domain/ports/order.reader.js";

/**
 * **Ce que le commerce rend au comptoir pour peindre sa file.**
 *
 * Il délègue à `OrderReader`, comme son voisin `PrismaHandoverSubjectReader`, et
 * pour la même raison : la requête appartient au commerce, qui seul sait ce que
 * ses colonnes veulent dire. Recopier ici un `select` mettrait une frontière de
 * contexte au milieu d'une divergence — l'endroit où on la remarque le plus tard.
 *
 * ⚠️ **Ce port ne rend AUCUN champ de remise.** Ni `handed_over_at`, ni le
 * jeton. Ce que le comptoir a déjà remis, il le lit dans **sa** table : le
 * commerce en tient un snapshot, et le lui renvoyer ferait de la copie la
 * source. C'est la même règle qui a fait sortir la remise de `orders`.
 */
@Injectable()
export class PrismaHandoverQueueReader extends HandoverQueueReader {
  constructor(private readonly orders: OrderReader) {
    super();
  }

  async expectedOn(day: string): Promise<readonly HandoverQueueEntry[]> {
    return this.orders.expectedForHandoverOn(day);
  }
}
