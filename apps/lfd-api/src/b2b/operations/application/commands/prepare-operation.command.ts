import type { PrepareOperation } from "../../domain/entities/operation.js";

/**
 * **Préparer une opération au commerce** : sa clé, son nom, ses dates, sa
 * clientèle. La sélection commence vide.
 */
export class PrepareOperationCommand {
  constructor(
    readonly operation: PrepareOperation,
    /** Qui prépare — un `StaffUser.id`, ou `null` hors requête. */
    readonly writtenBy: string | null,
  ) {}
}
