import { BusinessError, DomainError } from "../../../../../platform/shared/errors/app-error.js";

/** Un taux de TVA visé n'existe pas. */
export class VatRateNotFoundError extends BusinessError {
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
 * L'erreur s'appelait `TvaTagConflictError` et nommait un handle de l'ancien canal
 * (`tva-5-5`) : le référentiel annonçait une collision de canal là où
 * l'invariant est fiscal. Un comptable à qui l'on répond « conflit de tag » n'a
 * aucun moyen de savoir qu'il vient de recréer le taux réduit.
 */
export class VatRateConflictError extends BusinessError {
  constructor(percent: number, archived = false) {
    const shown = String(percent).replace(".", ",");
    super(
      "commerce.tva_rate_conflict",
      archived
        ? `Un taux de TVA archivé existe déjà à ${shown} % — restaurez-le plutôt que d'en créer un second.`
        : `Un taux de TVA existe déjà à ${shown} %.`,
    );
  }
}

/**
 * Un taux archivé ne se pose plus sur une famille ni sur une fiche : il ne se
 * propose plus, et une fiche ne se facture pas à un taux qu'on a retiré.
 */
export class VatRateArchivedError extends BusinessError {
  constructor(name: string) {
    super(
      "commerce.tva_rate_archived",
      `Le taux de TVA « ${name} » est archivé : choisissez un taux en service, ` +
        `ou restaurez-le depuis l'écran des taux de TVA.`,
    );
  }
}

/**
 * Archive refusée : une famille ou une fiche porte encore ce taux. Le code est
 * celui du refus de suppression d'avant — même cas, même geste de sortie.
 */
export class VatRateInUseError extends BusinessError {
  constructor(id: string) {
    super(
      "commerce.tva_rate_in_use",
      `Taux de TVA utilisé par une famille ou une fiche — réaffectez-les à un autre taux ` +
        `avant de l'archiver (${id}).`,
    );
  }
}

/** Un taux sans nom ne se retrouve pas dans une liste déroulante. */
export class EmptyVatRateNameError extends DomainError {
  constructor() {
    super("commerce.tva_rate.empty_name", "Le nom du taux de TVA est obligatoire.");
  }
}
