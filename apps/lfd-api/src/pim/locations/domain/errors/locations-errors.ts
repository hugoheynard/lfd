import { BusinessError, ResourceNotFoundError } from "../../../../shared/errors/app-error.js";

/** Le nom d'un emplacement est obligatoire. */
export class EmplacementNameRequiredError extends BusinessError {
  constructor() {
    super("locations.emplacement.name_required", "Le nom est obligatoire.");
  }
}

/** L'emplacement visé n'existe pas (→ 404). */
export class EmplacementNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super("locations.emplacement_not_found", `Emplacement introuvable : ${id}.`);
  }
}

/** La table visée n'existe pas dans cet emplacement (→ 404). */
export class EmplacementTableNotFoundError extends ResourceNotFoundError {
  constructor(emplacementId: string, tableNumber: number) {
    super(
      "locations.table_not_found",
      `Table ${tableNumber} introuvable dans l'emplacement ${emplacementId}.`,
    );
  }
}
