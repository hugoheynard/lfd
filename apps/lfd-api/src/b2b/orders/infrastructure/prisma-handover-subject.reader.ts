import { Injectable } from "@nestjs/common";

import {
  HandoverSubjectReader,
  type HandoverSubject,
} from "../../../handover/channels/commerce/index.js";
import { OrderReader } from "../domain/ports/order.reader.js";

/**
 * **Ce que le commerce rend au fournil pour une remise**, et rien de plus.
 *
 * ## Pourquoi il délègue au lieu de requêter
 *
 * `OrderReader.findByHandoverToken` fait déjà exactement cette lecture, et son
 * propre commentaire dit pourquoi les deux clés y partagent un seul corps : « le
 * dupliquer ferait diverger les deux écrans du comptoir au premier champ
 * ajouté ». Recopier ici le `select` aurait rouvert cette divergence, avec une
 * frontière de contexte au milieu — l'endroit où on la remarque le plus tard.
 *
 * ## Ce qui ne franchit PAS ce port
 *
 * Ni montant, ni jeton, ni `OrderView`. Et surtout **aucun champ de remise** :
 * `orders.handed_over_*` existe toujours, mais c'est un **snapshot** que le
 * commerce tient de l'événement du fournil. Le lui renvoyer ferait de la copie
 * la source, et deux vérités finiraient par diverger sur le seul fait que
 * quelqu'un aura besoin de prouver.
 */
@Injectable()
export class PrismaHandoverSubjectReader extends HandoverSubjectReader {
  constructor(private readonly orders: OrderReader) {
    super();
  }

  async byToken(token: string): Promise<HandoverSubject | null> {
    return this.orders.findByHandoverToken(token);
  }

  async byReference(reference: string): Promise<HandoverSubject | null> {
    return this.orders.findHandoverByReference(reference);
  }
}
