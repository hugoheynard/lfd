import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **fournées** (plan `plan-fournees-progressives.md`, D3).
 *
 * À part de `production-errors.ts`, qui approchait les trois cents lignes : les
 * fournées ont leur propre raison de changer, et leurs messages sont lus au
 * fournil, les mains dans la farine.
 */

/** Une fournée compte des PIÈCES : au moins une, et un nombre entier. */
export class InvalidBatchQuantityError extends DomainError {
  constructor(quantity: number) {
    super(
      "production.batch.invalid_quantity",
      `Une fournée compte au moins une pièce, en nombre entier (reçu : ${String(quantity)}). Saisissez le nombre de pièces sorties du four.`,
    );
  }
}

/**
 * **Le même identifiant, une autre fournée.**
 *
 * Un rejeu identique est un succès silencieux (D3). Celui-ci ne l'est pas : un
 * poste a réutilisé un identifiant pour un autre jour, un autre article ou une
 * autre quantité. Le compter serait inventer une sortie ; l'absorber en silence
 * perdrait celle que le poste croit avoir déclarée.
 */
export class BatchConflictError extends BusinessError {
  constructor(id: string, stored: string, requested: string) {
    super(
      "production.batch.conflict",
      `La fournée ${id} est déjà enregistrée pour ${stored}, pas pour ${requested}. Rechargez la fiche d'atelier et déclarez de nouveau : rien n'a été compté pour ce geste.`,
    );
  }
}

/** Aucune fournée de cette journée sous cet identifiant. */
export class BatchNotFoundError extends ResourceNotFoundError {
  constructor(id: string, serviceDay: string) {
    super(
      "production.batch.not_found",
      `Aucune fournée ${id} le ${serviceDay}. Rechargez la fiche d'atelier : elle a peut-être été saisie sur une autre journée.`,
    );
  }
}

/**
 * **Des pièces de cette fournée sont déjà dans des sacs.**
 *
 * Après l'annulation, il resterait moins de pièces sorties que de pièces au
 * bac — bacs FERMÉS compris (D3) : un sac parti l'est avec ses croissants, et le
 * colisage mentirait. Le geste de sortie est de ressortir du bac d'abord.
 *
 * Deux gestes y mènent, et le message nomme celui qu'on vient de faire :
 * annuler une fournée, ou décocher la ligne (qui les annule toutes).
 */
export class BatchStillPackedError extends BusinessError {
  constructor(productName: string, packed: number, gesture: "cancel" | "uncheck") {
    const exit = gesture === "cancel" ? "d'annuler cette fournée" : "de décocher la ligne";
    super(
      "production.batch.still_packed",
      `${String(packed)} « ${productName} » sont déjà dans des sacs : ressortez-les du bac avant ${exit}.`,
    );
  }
}
