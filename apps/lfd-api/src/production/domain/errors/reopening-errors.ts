import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la **réouverture** d'une journée (décision de Hugo du
 * 2026-10-14, `documentation/plan-de-lancement-2026-11-20.md`, §3).
 *
 * Un refus par cas réel, et non un « déjà commencé » : la personne qui lit le
 * message au Prod manager doit savoir QUOI a commencé, et donc à qui parler.
 * Rouvrir effacerait le plan sur lequel ce travail s'appuie.
 */

/** Une fournée de la journée est déclarée (ou une ligne cochée par l'ancien poste). */
export class ReopenAfterBatchesError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "production.day.reopen_after_batches",
      `La journée du ${serviceDay} ne se rouvre pas : une fournée est déjà déclarée au fournil. ` +
        "Le plan reste arrêté ; les commandes arrivées depuis s'ajoutent par la reprise.",
    );
  }
}

/** Une commande de la journée est déjà au bac ou au sac au colisage. */
export class ReopenAfterPackingError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "production.day.reopen_after_packing",
      `La journée du ${serviceDay} ne se rouvre pas : le colisage a commencé (une commande est ` +
        "déjà mise au bac ou au sac). Le plan reste arrêté ; les commandes arrivées depuis " +
        "s'ajoutent par la reprise.",
    );
  }
}

/** Une tournée de la journée est chargée ou partie. */
export class ReopenAfterDispatchError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "production.day.reopen_after_dispatch",
      `La journée du ${serviceDay} ne se rouvre pas : une tournée est déjà chargée ou partie. ` +
        "Le plan reste arrêté ; les commandes arrivées depuis s'ajoutent par la reprise.",
    );
  }
}
