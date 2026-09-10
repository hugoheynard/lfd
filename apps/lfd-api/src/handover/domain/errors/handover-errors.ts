import { BusinessError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus propres à la **remise**.
 *
 * ⚠️ **Les trois codes portaient le préfixe `production.` jusqu'au 2026-09-10.**
 * Ils l'ont perdu avec l'URL, dans la même tranche et pour la même raison : les
 * deux sont de la **surface publique**, et les faire diverger aurait laissé une
 * route `admin/handover` répondre `production.handover.refused`.
 *
 * 🔴 Un code d'erreur est un contrat servi, et celui-ci a été renommé sans
 * dépréciation — contrairement à l'URL. C'est justifié par une vérification, pas
 * par une préférence : **rien ne les lit**. Le front de retrait matche sur le
 * chemin, jamais sur le code (vérifié le 2026-09-10, `grep` sur les deux fronts
 * et sur `packages/`). Le jour où un client s'y accrocherait, la même
 * dépréciation que l'URL s'appliquerait.
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
    super("handover.not_found", "Ce code de retrait ne correspond à aucune commande.");
  }
}

/** Aucune commande sous ce **numéro** — le chemin de la remise saisie. */
export class HandoverReferenceNotFoundError extends ResourceNotFoundError {
  constructor(reference: string) {
    super("handover.reference_not_found", `Aucune commande au numéro ${reference}.`);
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
    super("handover.refused", reason);
  }
}
