import { Injectable } from "@nestjs/common";

import {
  HandoverSubjectReader,
  type HandoverSubject,
} from "../../../handover/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { HANDOVER_SELECT, toHandoverSubject } from "./handover-order.query.js";

/**
 * **Ce que le commerce rend à la remise pour UNE commande**, et rien de plus.
 *
 * ## Pourquoi il interroge, alors qu'il déléguait
 *
 * 🔴 Il passait par `OrderReader.findByHandoverToken` et ses deux sœurs — trois
 * verbes publiés par le commerce **qu'aucun appelant du commerce n'utilisait**.
 * Ils n'existaient que pour être délégués d'ici : le commerce publiait, de son
 * côté, des besoins que la remise avait déjà nommés du sien.
 *
 * Un contexte qui publie un verbe par consommateur finit par connaître ses
 * consommateurs, et c'est la dépendance qui revient par l'autre bout. Le port a
 * donc rétréci de dix verbes à six, et cet adaptateur fait ce que son voisin
 * `PrismaDayOrdersReader` faisait déjà : il lit Prisma, puisque c'est son
 * travail d'adaptateur.
 *
 * Le `select` reste partagé — `handover-order.query.ts`, interne à
 * `infrastructure/` — ce qui préserve ce que la délégation protégeait : « le
 * dupliquer ferait diverger les écrans du comptoir au premier champ ajouté ».
 *
 * ## Ce qui ne franchit PAS ce port
 *
 * Ni montant, ni jeton, ni `OrderView`. Et surtout **aucun champ de remise** :
 * `orders.handed_over_*` existe toujours, mais c'est un **snapshot** que le
 * commerce tient de l'événement du fournil. Le lui renvoyer ferait de la copie
 * la source, et deux vérités finiraient par diverger sur le seul fait que
 * quelqu'un aura besoin de prouver.
 *
 * ## Trois clés, et elles ne se confondent pas
 *
 * Le scan trouve par un **secret**, la saisie par un **numéro imprimé**, le rail
 * de la file par un **identifiant qu'elle vient de rendre**. Les fondre en une
 * seule méthode ferait accepter le numéro là où le secret est la protection.
 */
@Injectable()
export class PrismaHandoverSubjectReader extends HandoverSubjectReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async byToken(token: string): Promise<HandoverSubject | null> {
    return this.one({ handoverToken: token });
  }

  async byReference(reference: string): Promise<HandoverSubject | null> {
    return this.one({ orderNumber: reference });
  }

  async byOrderId(orderId: string): Promise<HandoverSubject | null> {
    return this.one({ id: orderId });
  }

  /** La même lecture, trois clés — cf. l'en-tête de cette classe. */
  private async one(
    where:
      | { readonly handoverToken: string }
      | { readonly orderNumber: string }
      | { readonly id: string },
  ): Promise<HandoverSubject | null> {
    const row = await this.prisma.order.findUnique({ where, select: HANDOVER_SELECT });
    return row === null ? null : toHandoverSubject(row);
  }
}
