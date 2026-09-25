import type { OperationRestriction } from "../../domain/entities/catalog-operation-override.js";

/**
 * **Restreindre une opération reçue** — la masquer, fermer sa commande plus
 * tôt, restreindre sa clientèle, retirer des articles de sa sélection (D9).
 * L'état ENTIER, comme l'écran l'affiche.
 */
export class SetOperationOverrideCommand {
  constructor(
    readonly operationKey: string,
    readonly restriction: OperationRestriction,
    /** Qui décide — un `StaffUser.id`, ou `null` hors requête. */
    readonly decidedBy: string | null,
  ) {}
}
