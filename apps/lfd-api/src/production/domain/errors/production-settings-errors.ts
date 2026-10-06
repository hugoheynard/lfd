import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **réglages du fournil** — l'arrêt du plan et les jours fermés
 * (plan `documentation/production/arret-du-plan.md`, §2, Q5, Q6, S4).
 *
 * Lus par qui règle l'écran, sans le code sous les yeux : chacun nomme le cas
 * et ce qu'il faut faire.
 */

/** Ce que l'heure règle — dit dans le message. */
export type HouseTimeRole = "close" | "alert";

const ROLE_WORDS: Readonly<Record<HouseTimeRole, string>> = {
  close: "L'heure d'arrêt automatique",
  alert: "L'heure d'alerte",
};

/** Une heure qui n'est pas `HH:MM` sur 24 h. */
export class InvalidHouseTimeError extends DomainError {
  constructor(role: HouseTimeRole, raw: string) {
    super(
      "production.settings.invalid_time",
      `${ROLE_WORDS[role]} « ${raw} » n'est pas une heure : saisissez-la au format HH:MM, entre 00:00 et 23:59.`,
    );
  }
}

/** Le mode automatique sans son heure d'arrêt. */
export class CloseTimeRequiredError extends DomainError {
  constructor() {
    super(
      "production.settings.close_time_required",
      "L'arrêt automatique demande une heure d'arrêt : indiquez à quelle heure le plan du lendemain s'arrête.",
    );
  }
}

/** Le mode manuel sans son heure d'alerte. */
export class AlertTimeRequiredError extends DomainError {
  constructor() {
    super(
      "production.settings.alert_time_required",
      "L'arrêt manuel demande une heure d'alerte : indiquez à partir de quelle heure le plan non arrêté est signalé.",
    );
  }
}

/**
 * Une heure d'arrêt hors de `12:00`–`23:55` (S4) : avant midi, on arrêterait
 * le lendemain en pleine journée de commande ; après 23:55, le tour de cinq
 * minutes passerait minuit, et la journée visée deviendrait « aujourd'hui ».
 */
export class CloseTimeOutOfRangeError extends DomainError {
  constructor(closeAt: string, earliest: string, latest: string) {
    super(
      "production.settings.close_time_out_of_range",
      `L'heure d'arrêt automatique ${closeAt} est hors de la plage permise : choisissez une heure entre ${earliest} et ${latest}.`,
    );
  }
}

/**
 * Une heure d'arrêt automatique antérieure à l'heure limite de commande (Q5) :
 * le plan s'arrêterait alors que des clients ont encore le droit de commander,
 * et leurs commandes resteraient hors du compte.
 */
export class CloseTimeBeforeOrderCutoffError extends BusinessError {
  constructor(closeAt: string, cutoff: string) {
    super(
      "production.settings.close_time_before_order_cutoff",
      `L'heure d'arrêt automatique ${closeAt} tombe avant l'heure limite de commande la plus tardive (${cutoff}) : des clients pourraient encore commander pour une journée déjà arrêtée. Choisissez une heure après la limite, ou avancez d'abord l'heure limite dans les réglages du commerce.`,
    );
  }
}

/** Un jour fermé posé sur une date passée. */
export class PastClosedDayError extends DomainError {
  constructor(serviceDay: string, today: string) {
    super(
      "production.settings.closed_day_in_past",
      `Le ${serviceDay} est passé (nous sommes le ${today}) : un jour fermé se pose sur aujourd'hui ou une date à venir.`,
    );
  }
}

/** Une ligne de réglage dont le mode n'est ni `auto` ni `manual` — la base l'interdit. */
export class CorruptCloseSettingsError extends TechnicalError {
  constructor(mode: string) {
    super(
      "production.settings.corrupt_mode",
      `Le réglage d'arrêt du plan porte un mode inconnu (« ${mode} ») : la contrainte de la table a été contournée.`,
    );
  }
}

/** Un réglage sauvé sans auteur : seul un réglage CHANGÉ se sauve, et il en a toujours un. */
export class UnauthoredCloseSettingsError extends TechnicalError {
  constructor() {
    super(
      "production.settings.unauthored",
      "Le réglage d'arrêt du plan a été enregistré sans avoir été changé par personne : aucun auteur à écrire.",
    );
  }
}
