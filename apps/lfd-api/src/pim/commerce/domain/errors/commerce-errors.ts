import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Un régime de TVA visé n'existe pas. */
export class TvaRegimeNotFoundError extends BusinessError {
  constructor(id: string) {
    super("commerce.tva_regime_not_found", `Régime de TVA introuvable : ${id}.`);
  }
}

/** Deux régimes ne peuvent pas viser le même taux (même `tag`). */
export class TvaTagConflictError extends BusinessError {
  constructor(tag: string) {
    super("commerce.tva_tag_conflict", `Un régime de TVA existe déjà pour ce taux (${tag}).`);
  }
}

/** Suppression refusée : une catégorie vise encore ce régime (FK `Restrict`). */
export class TvaRegimeInUseError extends BusinessError {
  constructor(id: string) {
    super(
      "commerce.tva_regime_in_use",
      `Régime de TVA utilisé par une catégorie — réaffectez-la d'abord (${id}).`,
    );
  }
}

/** Un régime sans nom ne se retrouve pas dans une liste déroulante. */
export class EmptyTvaRegimeNameError extends DomainError {
  constructor() {
    super("commerce.tva_regime.empty_name", "Le nom du régime de TVA est obligatoire.");
  }
}
