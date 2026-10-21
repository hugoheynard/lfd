import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/** Un niveau inconnu relu en base. */
export class UnknownStockAlertLevelError extends DomainError {
  constructor(readonly level: string) {
    super(
      "resupply.stock_alert.unknown_level",
      `Le niveau d'alerte « ${level} » n'existe pas : une alerte dit « rupture » ou « stock faible ».`,
    );
  }
}

/** Une raison de levée inconnue relue en base. */
export class UnknownStockAlertLiftReasonError extends DomainError {
  constructor(readonly reason: string) {
    super(
      "resupply.stock_alert.unknown_lift_reason",
      `La raison de levée « ${reason} » n'existe pas : une alerte se lève à la main ou à la réception d'un réassort.`,
    );
  }
}

/** Une alerte sans article ou sans libellé. */
export class IncompleteStockAlertError extends DomainError {
  constructor() {
    super(
      "resupply.stock_alert.incomplete",
      "Une alerte de stock porte un point, un article et son libellé : choisissez l'article dans le catalogue.",
    );
  }
}

/** Le geste vise une alerte déjà levée : elle ne se rouvre ni ne se relève. */
export class StockAlertAlreadyLiftedError extends BusinessError {
  constructor() {
    super(
      "resupply.stock_alert.already_lifted",
      "Cette alerte est déjà levée (à la main ou par la réception d'un réassort) : rechargez la page, et déclarez-en une nouvelle si l'article manque encore.",
    );
  }
}

/** Aucune alerte de cet identifiant pour ce point. */
export class StockAlertNotFoundError extends ResourceNotFoundError {
  constructor(readonly alertId: string) {
    super(
      "resupply.stock_alert.not_found",
      "Cette alerte n'existe pas pour ce point de retrait : rechargez la page, ou vérifiez le point choisi dans le bandeau.",
    );
  }
}

/** Deux postes ont touché la même alerte en même temps. */
export class StockAlertChangedMeanwhileError extends BusinessError {
  constructor() {
    super(
      "resupply.stock_alert.changed_meanwhile",
      "Cette alerte vient d'être modifiée depuis un autre poste : rechargez la page, puis refaites votre geste.",
    );
  }
}
