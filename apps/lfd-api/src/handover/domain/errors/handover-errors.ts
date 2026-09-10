import { BusinessError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus propres à la **remise**.
 *
 * 🔴 **Les trois codes gardent leur préfixe `production.`**, et c'est
 * délibéré : ils partent dans l'enveloppe d'erreur servie aux clients, et cette
 * tranche ne doit changer **aucun comportement observable** — c'est ce qui
 * permet de la relire comme un déplacement et non comme une modification.
 *
 * Ils seront renommés en même temps que l'URL, avec le reste de la surface
 * publique. Aujourd'hui rien ne les lit : le front de retrait matche sur le
 * chemin, jamais sur le code (vérifié le 2026-09-10).
 */

/**
 * **Ce code de retrait n'ouvre rien.**
 *
 * Un `ResourceNotFoundError` : la question « quelle commande derrière ce
 * jeton ? » a une réponse vide. Le message ne dit PAS si le jeton n'a jamais
 * existé ou s'il a expiré — un secret dont l'échec se raconte se devine.
 */
export class HandoverTokenNotFoundError extends ResourceNotFoundError {
  constructor() {
    super("production.handover.not_found", "Ce code de retrait ne correspond à aucune commande.");
  }
}

/** Aucune commande sous ce **numéro** — le chemin de la remise saisie. */
export class HandoverReferenceNotFoundError extends ResourceNotFoundError {
  constructor(reference: string) {
    super("production.handover.reference_not_found", `Aucune commande au numéro ${reference}.`);
  }
}

/**
 * **L'état interdit la remise**, et le refus porte la phrase à lire au comptoir.
 *
 * La raison est construite par `handoverBlocker` et traverse telle quelle :
 * quelqu'un attend en face, et « conflit » ne lui dit pas quoi faire.
 */
export class HandoverRefusedError extends BusinessError {
  constructor(reason: string) {
    super("production.handover.refused", reason);
  }
}
