import type { PrepareOperation } from "../../domain/entities/operation.js";
import type { ChosenImage } from "./operation-image-choice.js";

/**
 * **Préparer une opération au commerce** : sa clé, son nom, ses dates, sa
 * clientèle. La sélection commence vide ; l'image est choisie dans la
 * médiathèque par son adresse.
 */
export class PrepareOperationCommand {
  constructor(
    readonly operation: Omit<PrepareOperation, "image"> & { readonly image: ChosenImage | null },
    /** Qui prépare — un `StaffUser.id`, ou `null` hors requête. */
    readonly writtenBy: string | null,
  ) {}
}
