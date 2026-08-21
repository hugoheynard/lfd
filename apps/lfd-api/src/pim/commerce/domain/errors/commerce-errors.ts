import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Un régime de TVA visé n'existe pas. */
export class TvaRegimeNotFoundError extends BusinessError {
  constructor(id: string) {
    super("commerce.tva_regime_not_found", `Régime de TVA introuvable : ${id}.`);
  }
}

/**
 * Deux régimes ne peuvent pas viser le même taux.
 *
 * L'erreur s'appelait `TvaTagConflictError` et nommait un handle Shopify
 * (`tva-5-5`) : le référentiel annonçait une collision de canal là où
 * l'invariant est fiscal. Un comptable à qui l'on répond « conflit de tag » n'a
 * aucun moyen de savoir qu'il vient de recréer le taux réduit.
 */
export class TvaRateConflictError extends BusinessError {
  constructor(percent: number) {
    super(
      "commerce.tva_rate_conflict",
      `Un régime de TVA existe déjà à ${String(percent).replace(".", ",")} %.`,
    );
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
