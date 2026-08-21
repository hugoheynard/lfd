import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Un taux de TVA visé n'existe pas. */
export class TvaRateNotFoundError extends BusinessError {
  constructor(id: string) {
    super("commerce.tva_rate_not_found", `Taux de TVA introuvable : ${id}.`);
  }
}

/**
 * Deux taux de TVA ne peuvent pas porter la même **valeur**.
 *
 * Sinon deux lignes « Réduit · 5,5 % » et « Alimentaire · 5,5 % » coexistent, et
 * plus personne ne sait laquelle une famille vise — ni ce qu'il advient de la
 * collection de taxe, dont le handle se dérive du taux et serait le même.
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
      `Un taux de TVA existe déjà à ${String(percent).replace(".", ",")} %.`,
    );
  }
}

/** Suppression refusée : une catégorie vise encore ce taux (FK `Restrict`). */
export class TvaRateInUseError extends BusinessError {
  constructor(id: string) {
    super(
      "commerce.tva_rate_in_use",
      `Taux de TVA utilisé par une catégorie — réaffectez-la d'abord (${id}).`,
    );
  }
}

/** Un taux sans nom ne se retrouve pas dans une liste déroulante. */
export class EmptyTvaRateNameError extends DomainError {
  constructor() {
    super("commerce.tva_rate.empty_name", "Le nom du taux de TVA est obligatoire.");
  }
}
