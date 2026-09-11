import { Injectable } from "@nestjs/common";

import {
  HandoverQueueReader,
  type HandoverQueueEntry,
} from "../../../handover/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { HANDOVER_QUEUE_SELECT, toQueueEntry } from "./handover-order.query.js";

/**
 * **Ce que le commerce rend au comptoir pour peindre sa file.**
 *
 * ## Pourquoi il interroge, alors qu'il déléguait
 *
 * 🔴 Il passait par `OrderReader.expectedForHandoverOn`, un verbe publié par le
 * commerce qu'aucun appelant du commerce n'utilisait : il n'existait que pour
 * être délégué d'ici. Même raison que son voisin — le commerce déclarait une
 * seconde fois un besoin que la remise avait déjà nommé chez elle. Le `select`
 * reste partagé dans `handover-order.query.ts`, interne à `infrastructure/`.
 *
 * ## Ce que cette lecture décide, et pourquoi c'est ici
 *
 * - **les annulées sont RENDUES**, contrairement au plan de production qui les
 *   écarte : le fournil n'a rien à cuire pour elles, mais le comptoir peut voir
 *   le client se présenter, et c'est `handoverBlocker` qui doit refuser avec la
 *   phrase à lire — pas une liste qui les cache ;
 * - **les brouillons sont écartés** : une commande jamais passée n'attend
 *   personne, et l'afficher ferait promettre un sac qui n'existe pas.
 *
 * Ces deux règles lisent l'énuméré des statuts d'une commande, donc elles
 * appartiennent au commerce — la remise n'a pas à le connaître.
 *
 * ⚠️ L'ordre vient de la base (`created_at`), pas du créneau : trier par heure
 * demanderait de lire un JSON, donc de tout rapatrier pour trier. L'écran
 * ordonne ce qu'il affiche — c'est le seul endroit qui sait quel onglet il
 * peint.
 *
 * ⚠️ **Ce port ne rend AUCUN champ de remise.** Ni `handed_over_at`, ni le
 * jeton. Ce que le comptoir a déjà remis, il le lit dans **sa** table : le
 * commerce en tient un snapshot, et le lui renvoyer ferait de la copie la
 * source.
 */
@Injectable()
export class PrismaHandoverQueueReader extends HandoverQueueReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async expectedOn(day: string): Promise<readonly HandoverQueueEntry[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
        status: { not: "draft" },
      },
      orderBy: { createdAt: "asc" },
      select: HANDOVER_QUEUE_SELECT,
    });
    return rows.map(toQueueEntry);
  }
}
