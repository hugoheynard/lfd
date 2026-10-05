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
 * Un **retour est déjà demandé** au colisage pour cette fournée, sans réponse
 * encore (journée `packing`, colisage K2, §13 B2). Le redemander ferait deux
 * demandes pour les mêmes pièces ; la réponse arrive par la boîte d'envoi, et
 * la fiche montre « retour en attente » d'ici là.
 */
export class BatchReturnPendingError extends BusinessError {
  constructor(productName: string, pending: number) {
    super(
      "production.batch.return_pending",
      `Un retour de ${String(pending)} « ${productName} » est déjà demandé au colisage et attend sa réponse. Attendez qu'il réponde avant d'annuler à nouveau ; s'il tarde, regardez les messages en souffrance de la carte de santé.`,
    );
  }
}
