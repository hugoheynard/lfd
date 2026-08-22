import {
  BusinessError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

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

/**
 * L'emplacement est encore coché par des familles : on refuse de le supprimer.
 *
 * **Business** et non domaine : la règle n'est pas un invariant de l'agrégat —
 * un emplacement ignore les familles — mais une protection de l'exploitation
 * contre elle-même. Elle se satisfait en décochant, donc l'appelant peut agir.
 */
export class EmplacementInUseError extends BusinessError {
  constructor(id: string, categories: number) {
    super(
      "locations.emplacement_in_use",
      `Emplacement encore vendeur : ${String(categories)} famille(s) le cochent. ` +
        `Décochez-le de leurs canaux avant de le supprimer (${id}).`,
    );
  }
}
