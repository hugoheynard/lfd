import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Le magasin des rayons pro a répondu, mais rien d'exploitable : un statut
 * inattendu, une version manquante, un rayon qui ne se décompresse pas.
 *
 * Jamais vue d'un client : le service retombe sur la base et sert le rayon
 * calculé (`plan-cache-du-catalogue.md`, § 4 bis). Elle nomme le cas pour le
 * journal du repli, qui la compte à part d'une panne réseau.
 */
export class UnreadableShelfReplyError extends TechnicalError {
  constructor(detail: string) {
    super(
      "catalog.shelf_cache.unreadable_reply",
      `Réponse illisible du magasin des rayons pro (${detail}) : le rayon est calculé depuis la base.`,
    );
  }
}
