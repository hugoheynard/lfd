import { BusinessError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **livreur** et de son affectation (plan « Ma tournée »,
 * `documentation/livraisons/livreur/plan-ma-tournee.md`, MT-D2 v2 et MT-D3 v2).
 *
 * Les refus de la route du livreur ont LEURS phrases : il est au volant ou sur
 * le trottoir, il n'a ni l'écran de composition ni celui du chargement — le
 * geste de sortie est d'appeler le dépôt ou de recharger la page.
 */

/** Affecter quelqu'un qui n'a pas le droit effectif de conduire (MT-D2 v2). */
export class DriverWithoutAccessError extends BusinessError {
  constructor(vehicleName: string) {
    super(
      "delivery.driver_without_access",
      `Cette personne ne peut pas conduire « ${vehicleName} » : elle n'a pas le droit « Conduire sa tournée », ou sa fiche est suspendue. Choisissez un livreur dans la liste, accordez « Conduire sa tournée » à son rôle dans Admin › Rôles, ou réactivez sa fiche dans Admin › Utilisateurs.`,
    );
  }
}

/**
 * Affecter quelqu'un qui conduit SANS les gestes à la porte (audit
 * 2026-10-07, B8). Affecté, il chargeait et partait, puis prenait 403 à chaque
 * arrêt — ni arrivée, ni remise, ni dépôt, ni clôture, ni retour : sa tournée
 * ne pouvait plus se terminer, et rien ne l'avait dit avant le départ.
 */
export class DriverWithoutDoorstepError extends BusinessError {
  constructor(vehicleName: string) {
    super(
      "delivery.driver_without_doorstep",
      `Cette personne tient le droit « Conduire sa tournée » mais pas « Gestes à la porte » : affectée à « ${vehicleName} », elle partirait sans pouvoir remettre, déposer ni clore un seul arrêt. Accordez « Gestes à la porte » à son rôle dans Admin › Rôles, ou choisissez un livreur dans la liste.`,
    );
  }
}

/**
 * La tournée n'existe pas POUR CE LIVREUR — absente, ou affectée à un autre.
 * 404 et non 403 : on ne confirme pas qu'une tournée existe (MT-D3).
 */
export class DriverRoundNotFoundError extends ResourceNotFoundError {
  constructor() {
    super(
      "delivery.driver_round_not_found",
      "Cette tournée ne vous est pas affectée : revenez à « Ma tournée » pour voir les vôtres, ou appelez le dépôt.",
    );
  }
}

/**
 * La photo demandée n'est pas celle d'une étape de la procédure d'un arrêt de
 * MA tournée — arrêt absent ou retiré, étape d'une autre adresse, ou étape
 * sans photo. 404 sans distinguer : on ne confirme rien.
 */
export class DriverStepPhotoNotFoundError extends ResourceNotFoundError {
  constructor() {
    super(
      "delivery.driver_step_photo_not_found",
      "Cette photo n'est plus dans la procédure de cet arrêt : rechargez la page de votre tournée, ou appelez le dépôt.",
    );
  }
}

/** Un arrêt n'est pas chargé : le livreur ne charge pas, il appelle (MT-D3 v2). */
export class DriverRoundNotReadyError extends BusinessError {
  constructor(customers: readonly string[]) {
    const subject =
      customers.length > 1
        ? `${String(customers.length)} arrêts ne sont pas chargés`
        : "un arrêt n'est pas chargé";
    super(
      "delivery.driver_round_not_ready",
      `Vous ne pouvez pas partir : ${subject} (${customers.join(", ")}) — appelez le dépôt.`,
    );
  }
}

/** Un bac partagé est à refaire au dépôt. */
export class DriverSharedBinToRedoError extends BusinessError {
  constructor(codes: readonly string[]) {
    super(
      "delivery.driver_shared_bin_to_redo",
      `Vous ne pouvez pas partir : le bac partagé ${codes.join(", ")} est à refaire au dépôt — appelez le dépôt.`,
    );
  }
}

/** La tournée a été modifiée au dépôt depuis que la page a été lue. */
export class DriverRoundStaleError extends BusinessError {
  constructor() {
    super(
      "delivery.driver_round_stale",
      "La tournée a été modifiée au dépôt depuis que vous l'avez ouverte — rechargez la page.",
    );
  }
}

/** Déjà partie — par le chargeur, ou depuis un autre téléphone. */
export class DriverRoundDepartedError extends BusinessError {
  constructor() {
    super(
      "delivery.driver_round_departed",
      "Votre tournée est déjà partie — rechargez la page pour suivre vos arrêts.",
    );
  }
}

/**
 * Un arrêt ne peut pas partir tel quel — tournée vide, commande annulée ou
 * introuvable : seul le dépôt peut retirer l'arrêt.
 */
export class DriverRoundBlockedError extends BusinessError {
  constructor(reason: string) {
    super(
      "delivery.driver_round_blocked",
      `Vous ne pouvez pas partir : ${reason} — appelez le dépôt.`,
    );
  }
}
