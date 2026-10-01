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

// ── « Remis au client » (`plan-a-la-porte.md`, B1, § 9) ──

/** Une remise sans photo n'existe pas (§ 9, Hugo : « même le happy path signé »). */
export class HandoverPhotoMissingError extends DomainError {
  constructor() {
    super(
      "delivery.handover_photo_missing",
      "Une remise porte toujours une photo : photographiez la marchandise remise, puis validez.",
    );
  }
}

/** Une pièce de la remise refusée — vide, trop lourde, ou d'un format inconnu. */
export class InvalidHandoverPictureError extends DomainError {
  constructor(piece: "photo" | "signature", detail: string) {
    super(
      "delivery.invalid_handover_picture",
      piece === "photo"
        ? `Photo de la remise : ${detail} Reprenez la photo, puis validez.`
        : `Signature : ${detail} Effacez-la, faites signer à nouveau, puis validez.`,
    );
  }
}

/** Le nom tapé de qui réceptionne, hors bornes (AP-Q2 : toujours le nom). */
export class ReceiverNameLengthError extends DomainError {
  constructor(length: number, min: number, max: number) {
    super(
      "delivery.receiver_name_length",
      `Le nom de qui réceptionne fait ${String(length)} caractère(s) : il en faut de ${String(min)} à ${String(max)}. Demandez-lui son nom et tapez-le.`,
    );
  }
}

/** La signature exigée au départ manque (AP-D4). */
export class HandoverSignatureMissingError extends DomainError {
  constructor(reference: string) {
    super(
      "delivery.handover_signature_missing",
      `La commande ${reference} exige une signature : faites signer la personne au doigt dans le cadre, puis validez.`,
    );
  }
}

/**
 * « Remis » rejoué sur un arrêt clos AUTREMENT — sans remise (§ 10 bis) : le
 * livreur ne doit pas croire avoir remis.
 */
export class StopClosedWithoutHandoverError extends BusinessError {
  constructor(reference: string) {
    super(
      "delivery.stop_closed_without_handover",
      `L'arrêt de la commande ${reference} a été clos sans remise (déjà retirée, ou annulée) : rien n'a été remis ici. Rechargez la page ; si la marchandise est encore dans le véhicule, appelez le dépôt.`,
    );
  }
}

// ── « Déposé avec preuve » (`plan-a-la-porte.md`, B2, AP-D4, AP-Q6) ──

/** Un dépôt sans photo n'existe pas (§ 9) : la photo est la seule preuve qu'il porte. */
export class DepositPhotoMissingError extends DomainError {
  constructor() {
    super(
      "delivery.deposit_photo_missing",
      "Un dépôt porte toujours une photo : photographiez la marchandise à l'endroit où vous la laissez, puis validez.",
    );
  }
}

/** Le client n'a pas autorisé le dépôt à cette adresse (figé au départ, AP-D5). */
export class DepositNotAllowedError extends BusinessError {
  constructor(reference: string) {
    super(
      "delivery.deposit_not_allowed",
      `L'adresse de la commande ${reference} n'autorise pas le dépôt sans personne : ne la laissez pas. Remettez-la en main propre, ou déclarez un problème « personne pour réceptionner ».`,
    );
  }
}

/** La signature exigée l'emporte : une commande signée ne se dépose jamais (AP-Q6). */
export class DepositSignatureRequiredError extends BusinessError {
  constructor(reference: string) {
    super(
      "delivery.deposit_signature_required",
      `La commande ${reference} exige une signature : elle ne se dépose pas. Remettez-la en main propre contre signature, ou déclarez un problème « personne pour réceptionner ».`,
    );
  }
}
