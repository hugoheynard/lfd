import { isPastOrderCutoff, type OrderCutoffView } from "@lfd/contracts";

import { PastOrderCutoffError } from "../errors/order-errors.js";

/**
 * **Refuse une commande arrivée trop tard** pour la journée d'acheminement
 * demandée.
 *
 * Fonction pure, hors de tout handler : c'est une règle métier, et elle vaut
 * pour les deux portes d'entrée — le client qui commande seul et l'équipe qui
 * saisit pour lui. La comparaison elle-même vit dans `@lfd/contracts`
 * (`isPastOrderCutoff`), parce que la boutique devra montrer la même limite
 * qu'on oppose ici, et que deux implémentations de la même règle divergeraient.
 *
 * ## Ce qui n'est PAS refusé, et pourquoi
 *
 * - **Aucune règle configurée** : tout passe. Une plateforme qui n'a rien réglé
 *   ne doit pas refuser au nom d'une limite que personne n'a posée.
 * - **Une saisie du back-office** (`placedByStaffId` non nul). Le membre de
 *   l'équipe au téléphone EST l'autorité qui déroge : tant que la dérogation
 *   n'est pas un objet en propre — avec sa borne de grâce, son motif et son
 *   auteur —, lui opposer la limite retirerait au personnel une capacité qu'il a
 *   aujourd'hui, sans rien lui donner en échange.
 *
 * 🔴 **Cette exemption est datée.** Elle tombe avec le lot 3 de
 * `documentation/b2b/architecture-heure-limite-de-commande.md`, qui introduit la
 * grâce et la dérogation ; la garde s'appliquera alors aussi au back-office, la
 * dérogation devenant le seul chemin de sortie.
 *
 * @throws {PastOrderCutoffError} la limite de cette journée est passée.
 */
export function ensureWithinOrderCutoff(input: {
  readonly rules: readonly OrderCutoffView[];
  readonly pickupAddressId: string | null;
  readonly fulfillmentDate: string;
  readonly placedByStaffId: string | null;
  readonly now: Date;
}): void {
  if (input.placedByStaffId !== null) {
    return;
  }
  if (isPastOrderCutoff(input.rules, input.pickupAddressId, input.fulfillmentDate, input.now)) {
    throw new PastOrderCutoffError(input.fulfillmentDate);
  }
}
