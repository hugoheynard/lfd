import type { HandoverVia } from "../../domain/services/handover.js";

/**
 * **Le commerce ferme une commande remise.**
 *
 * L'instant et l'auteur sont portés par la commande, jamais relus sur une
 * horloge d'ici : la remise a eu lieu au comptoir du fournil, et c'est cette
 * heure-là qu'un client peut nous opposer. Cf. `MarkOrderReadyCommand.at`, qui
 * porte la même règle pour le colisage.
 */
export class MarkOrderFulfilledCommand {
  constructor(
    readonly reference: string,
    readonly staffSubject: string,
    readonly at: Date,
    readonly via: HandoverVia,
  ) {}
}
