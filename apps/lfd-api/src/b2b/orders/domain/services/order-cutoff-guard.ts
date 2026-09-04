import { decideOrderCutoff, type OrderCutoffView } from "@lfd/contracts";

import { OrderCutoffGraceError, PastOrderCutoffError } from "../errors/order-errors.js";

/**
 * **Refuse une commande arrivée trop tard** pour la journée d'acheminement
 * demandée, et distingue les deux façons de l'être.
 *
 * Fonction pure, hors de tout handler : c'est une règle métier, et elle vaut
 * pour les deux portes d'entrée — le client qui commande seul et l'équipe qui
 * saisit pour lui. La décision elle-même vit dans `@lfd/contracts`
 * (`decideOrderCutoff`), parce que la boutique devra montrer la même limite
 * qu'on oppose ici, et que deux implémentations de la même règle divergeraient.
 *
 * ## Les trois états, et ce qu'on en fait ici
 *
 * - `open` — rien à dire.
 * - `grace` — la limite est passée, le rattrapage court. **Refusé quand même**,
 *   mais par une autre erreur : ce qui distingue les deux n'est pas un détail
 *   d'affichage, c'est ce que le client doit faire. La fenêtre deviendra un
 *   passage quand la dérogation existera ; aujourd'hui elle n'ouvre rien, elle
 *   dit seulement qu'un appel peut encore servir.
 * - `closed` — trop tard, et personne ne peut ouvrir.
 *
 * ## Ce qui n'est PAS refusé, et pourquoi
 *
 * - **Aucune règle configurée** : tout passe. Une plateforme qui n'a rien réglé
 *   ne doit pas refuser au nom d'une limite que personne n'a posée.
 * - **Une saisie du back-office** (`placedByStaffId` non nul). Le membre de
 *   l'équipe au téléphone EST l'autorité qui déroge : tant que la dérogation
 *   n'est pas un objet en propre — avec son motif et son auteur —, lui opposer
 *   la limite retirerait au personnel une capacité qu'il a aujourd'hui, sans
 *   rien lui donner en échange.
 *
 * 🔴 **Cette exemption est datée.** Elle tombe avec le lot 3 de
 * `documentation/b2b/architecture-heure-limite-de-commande.md` : la garde
 * s'appliquera alors aussi au back-office, la dérogation devenant le seul
 * chemin de sortie — et elle ne pourra ouvrir que DANS la grâce.
 *
 * @throws {OrderCutoffGraceError} la limite est passée, le rattrapage court.
 * @throws {PastOrderCutoffError} la limite ET le rattrapage sont passés.
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
  const decision = decideOrderCutoff(
    input.rules,
    input.pickupAddressId,
    input.fulfillmentDate,
    input.now,
  );
  if (decision.status === "open") {
    return;
  }
  if (decision.status === "grace" && decision.graceEnd !== null) {
    throw new OrderCutoffGraceError(input.fulfillmentDate, decision.graceEnd);
  }
  throw new PastOrderCutoffError(input.fulfillmentDate);
}
