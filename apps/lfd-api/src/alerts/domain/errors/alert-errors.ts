import { BusinessError, ResourceNotFoundError } from "../../../shared/errors/app-error.js";

/**
 * La société visée n'existe pas.
 *
 * Sans elle, écrire une dérogation sur un identifiant inconnu remontait une
 * violation de clé étrangère — donc un **500**, alors que c'est une erreur
 * d'appelant parfaitement ordinaire. Un 404 dit la vérité et n'alerte personne
 * la nuit.
 */
export class CompanyNotFoundForAlertsError extends ResourceNotFoundError {
  constructor(companyId: string) {
    super("alerts.company_not_found", `Société inconnue : ${companyId}`);
  }
}

/**
 * Le réglage a changé depuis qu'on l'a lu.
 *
 * Deux commerciaux sur l'écran Réglages : sans ce garde, le second écrasait le
 * premier en silence, et personne n'apprenait que son changement avait disparu.
 * On refuse plutôt que d'arbitrer à leur place — l'écran recharge et montre ce
 * qui a été écrit entre-temps.
 */
export class AlertRuleModifiedElsewhereError extends BusinessError {
  constructor(kind: string) {
    super(
      "alerts.rule_modified_elsewhere",
      `Le réglage « ${kind} » a été modifié entre-temps. Rechargez avant d'enregistrer.`,
    );
  }
}
