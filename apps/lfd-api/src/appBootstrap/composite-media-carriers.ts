import {
  MediaCarriers,
  type Carrier,
  type ImageReplacement,
} from "../media/channels/carriers/media-carriers.js";
import type { WriteTicket } from "../platform/journal/scoped-journal.js";

/**
 * **Tous les porteurs de la médiathèque, interrogés ensemble.**
 *
 * La médiathèque pose UNE question (« qui affiche cette image ? ») ; plusieurs
 * blocs y répondent chacun pour les siens — le référentiel pour ses fiches et
 * ses familles, la vitrine du commerce pour ses objets. Ce composite somme les
 * comptes et concatène les listes, sans que `media/` sache combien de porteurs
 * existent : un porteur de plus est un élément de plus dans la liste, pas une
 * branche de plus (plan `documentation/order/plan-vitrine-enregistrement.md`, D9).
 *
 * 🔴 **Si UN porteur échoue, le composite échoue.** `Promise.all`, jamais
 * `Promise.allSettled` : un porteur muet ne vaut pas « zéro emploi », et une
 * panne de la vitrine qui laisserait parler le seul référentiel ferait
 * supprimer une image qu'un objet de vitrine affiche (`media-carriers.ts`,
 * « le silence doit ARRÊTER la suppression »).
 */
export class CompositeMediaCarriers extends MediaCarriers {
  constructor(private readonly carriers: readonly MediaCarriers[]) {
    super();
  }

  async usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    const answers = await Promise.all(this.carriers.map((carrier) => carrier.usesOf(urls)));
    const total = new Map<string, number>();
    for (const answer of answers) {
      for (const [url, count] of answer) {
        total.set(url, (total.get(url) ?? 0) + count);
      }
    }
    return total;
  }

  async carriersOf(url: string): Promise<readonly Carrier[]> {
    const answers = await Promise.all(this.carriers.map((carrier) => carrier.carriersOf(url)));
    return answers.flat();
  }

  /**
   * Repointe chez TOUS les porteurs, l'un après l'autre, et additionne.
   *
   * 🔴 **En série, et dans la transaction de l'appelant.** Il n'y a qu'un
   * client Prisma : chaque porteur écrit par le même proxy transactionnel, et
   * l'unité ouverte par la médiathèque les emporte tous ou n'en garde aucun.
   * `Promise.all` n'y gagnerait rien — une transaction interactive passe ses
   * ordres un par un sur la même connexion — et mêlerait les erreurs.
   */
  async repoint(replacement: ImageReplacement, ticket: WriteTicket): Promise<number> {
    let total = 0;
    for (const carrier of this.carriers) {
      total += await carrier.repoint(replacement, ticket);
    }
    return total;
  }
}
