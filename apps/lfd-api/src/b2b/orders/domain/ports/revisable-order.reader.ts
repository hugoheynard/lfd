import type { RevisableOrder } from "../entities/order-revision.js";

/**
 * **La commande telle qu'on la modifie**, lue sans verrou — par le devis de
 * révision et par le premier regard de la modification (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1). Le geste la
 * relit SOUS verrou par {@link OrderRevisionRepository.lock}.
 *
 * Aucun mur ici : la commande est cherchée par son identifiant, et c'est
 * l'appelant qui applique celui du client (`ensureOrderVisible`).
 */
export abstract class RevisableOrderReader {
  abstract find(orderId: string): Promise<RevisableOrder | null>;
}
