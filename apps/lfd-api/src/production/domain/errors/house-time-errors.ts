import { DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Le refus d'une **heure de la maison** mal formée — la forme d'une heure que
 * la journée lit (heure limite des canaux, réglages d'arrêt). Il vit au noyau
 * parce que la règle d'heure limite que le canal du commerce publie le lève.
 *
 * Lu par qui règle l'écran, sans le code sous les yeux : il nomme le cas et
 * ce qu'il faut faire.
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
