import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus **à la porte** (`documentation/livraisons/plan-a-la-porte.md`,
 * lot A) — arriver, signaler, clore sans remise.
 *
 * Même règle que les refus du livreur (`delivery-driver-errors.ts`) : il est
 * sur le trottoir, sans l'écran de composition ; le geste de sortie est de
 * recharger la page ou d'appeler le dépôt.
 */

/**
 * L'arrêt n'est pas dans MA tournée — absent, retiré, ou d'une autre tournée.
 * 404 sans distinguer : on ne confirme rien.
 */
export class DoorstepStopNotFoundError extends ResourceNotFoundError {
  constructor() {
    super(
      "delivery.doorstep_stop_not_found",
      "Cet arrêt n'est plus dans votre tournée : rechargez la page, ou appelez le dépôt.",
    );
  }
}

/** Un geste de la porte sur une tournée encore au dépôt. */
export class DoorstepRoundNotDepartedError extends BusinessError {
  constructor() {
    super(
      "delivery.doorstep_round_not_departed",
      "Votre tournée n'est pas commencée : appuyez sur « Commencer ma tournée » avant de déclarer quoi que ce soit à la porte.",
    );
  }
}

/**
 * Un geste de la porte sur une tournée RENTRÉE (`parcours-du-livreur.md`,
 * PL2) : « Tournée terminée » ferme la tournée à la porte.
 */
export class DeliveryRoundReturnedError extends BusinessError {
  constructor() {
    super(
      "delivery.round_returned",
      "Cette tournée est terminée : plus aucun geste à la porte n'y est possible. Si un arrêt reste à traiter, appelez le dépôt.",
    );
  }
}

/** « Tournée terminée » sur une tournée qui n'est pas partie (PL2). */
export class RoundNotDepartedForReturnError extends BusinessError {
  constructor(vehicleName: string) {
    super(
      "delivery.round_not_departed_for_return",
      `La tournée « ${vehicleName} » n'est pas partie : on ne termine qu'une tournée partie. Faites-la partir d'abord, ou laissez-la au dépôt.`,
    );
  }
}

/** « Je suis arrivé » sur un arrêt déjà clos. */
export class DoorstepStopClosedError extends BusinessError {
  constructor() {
    super(
      "delivery.doorstep_stop_closed",
      "Cet arrêt est déjà clos : il n'y a plus d'arrivée à déclarer. Rechargez la page pour voir l'arrêt suivant.",
    );
  }
}

/**
 * Clore sans remise une commande qui attend encore son client (AP-D2) : on ne
 * ferme pas un arrêt sans remise tant que la marchandise reste à remettre.
 */
export class StopStillToHandOverError extends BusinessError {
  constructor(reference: string) {
    super(
      "delivery.stop_still_to_hand_over",
      `La commande ${reference} n'a été ni retirée au comptoir ni annulée : elle reste à remettre. Remettez-la au client, ou signalez un problème — l'arrêt ne se clôt pas sans remise.`,
    );
  }
}

/** La tournée a été modifiée depuis que la page a été lue (clôture sans remise). */
export class DoorstepRoundStaleError extends BusinessError {
  constructor() {
    super(
      "delivery.doorstep_round_stale",
      "Votre tournée a changé depuis que vous l'avez ouverte : rechargez la page, puis refaites le geste.",
    );
  }
}

/** Un motif qui n'est pas de la famille choisie (§ 3). */
export class InvalidIncidentReasonError extends DomainError {
  constructor(family: string, reason: string) {
    super(
      "delivery.invalid_incident_reason",
      `Le motif « ${reason} » n'existe pas pour un problème « ${family} » : choisissez un motif de la liste, ou « autre » avec une note.`,
    );
  }
}

/** Un problème à la remise porte sur un arrêt (§ 3). */
export class DoorstepIncidentWithoutStopError extends DomainError {
  constructor() {
    super(
      "delivery.doorstep_incident_without_stop",
      "Un problème à la remise porte sur un arrêt : ouvrez l'arrêt concerné, puis déclarez le problème depuis sa carte.",
    );
  }
}

/** La note d'un signalement est bornée. */
export class IncidentNoteTooLongError extends DomainError {
  constructor(length: number, max: number) {
    super(
      "delivery.incident_note_too_long",
      `La note fait ${String(length)} caractères, ${String(max)} au plus : raccourcissez-la — la photo peut dire le reste.`,
    );
  }
}

/** La photo d'un signalement, refusée — vide, trop lourde, ni JPEG ni PNG, ou tronquée. */
export class InvalidIncidentPhotoError extends DomainError {
  constructor(detail: string) {
    super(
      "delivery.invalid_incident_photo",
      `Photo du problème : ${detail} Reprenez la photo, ou déclarez le problème sans photo.`,
    );
  }
}

/** La photo d'un signalement n'existe pas pour celui qui la demande. */
export class IncidentPhotoNotFoundError extends ResourceNotFoundError {
  constructor() {
    super(
      "delivery.incident_photo_not_found",
      "Ce signalement n'a pas de photo, ou n'est pas sur votre tournée : rechargez la page.",
    );
  }
}
