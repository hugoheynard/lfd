import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus propres à la **livraison** — lus au dépôt, par qui n'a pas le code
 * sous les yeux : chacun nomme le cas réel et le geste de sortie (`CLAUDE.md` §0).
 */

/** La plaque saisie n'a ni la forme SIV (`AB-123-CD`) ni l'ancienne forme FNI. */
export class InvalidLicensePlateError extends DomainError {
  constructor(raw: string) {
    super(
      "delivery.license_plate_invalid",
      `La plaque « ${raw} » n'est pas une immatriculation française : saisissez-la sous la forme AB-123-CD (ou 123 ABC 75 pour une ancienne plaque).`,
    );
  }
}

/** Le nom d'un véhicule est vide ou trop long. */
export class InvalidVehicleNameError extends DomainError {
  constructor(maxLength: number) {
    super(
      "delivery.vehicle_name_invalid",
      `Le nom du véhicule est requis, et tient en ${maxLength} caractères au plus.`,
    );
  }
}

/**
 * **Un véhicule en service porte déjà cette plaque.** Le refus le nomme quand
 * on le connaît : c'est lui qu'il faut retirer, ou corriger, avant de rendre
 * la plaque à un autre.
 */
export class LicensePlateAlreadyInServiceError extends BusinessError {
  constructor(plate: string, holderName: string | null) {
    super(
      "delivery.license_plate_in_service",
      holderName === null
        ? `Un autre véhicule en service porte déjà la plaque ${plate} : retirez-le ou corrigez sa plaque d'abord.`
        : `Le véhicule « ${holderName} » porte déjà la plaque ${plate} et il est en service : retirez-le ou corrigez sa plaque d'abord.`,
    );
  }
}

/** Retirer un véhicule qui l'est déjà. */
export class VehicleAlreadyRetiredError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.vehicle_already_retired",
      `Le véhicule « ${name} » est déjà retiré : réactivez-le s'il reprend la route.`,
    );
  }
}

/** Réactiver un véhicule qui roule. */
export class VehicleNotRetiredError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.vehicle_not_retired",
      `Le véhicule « ${name} » est déjà en service : il n'y a rien à réactiver.`,
    );
  }
}

/** Aucun véhicule sous cet identifiant. */
export class VehicleNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "delivery.vehicle_not_found",
      `Aucun véhicule sous l'identifiant ${id} : rechargez la liste de la flotte.`,
    );
  }
}

/** Le point de départ choisi n'est pas (ou plus) un point de retrait. */
export class DeparturePointNotFoundError extends ResourceNotFoundError {
  constructor(pickupAddressId: string) {
    super(
      "delivery.departure_point_not_found",
      `Aucun point de retrait sous l'identifiant ${pickupAddressId} : il a peut-être été supprimé, rechargez la liste et choisissez-en un autre.`,
    );
  }
}
