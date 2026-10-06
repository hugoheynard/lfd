import { BusinessError, TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **socle de la composition** (plan de composition automatique,
 * CA-D3) : sans un véhicule en service qui a ses cotes et sans un type de bac
 * en service, proposer des tournées n'a pas de sens. Lus au bureau, par qui n'a
 * pas le code sous les yeux : chacun dit ce qui manque et où le régler.
 */

/** « Proposer » sur une flotte dont aucun véhicule en service n'a ses cotes. */
export class NoMeasuredVehicleError extends BusinessError {
  constructor() {
    super(
      "delivery.no_measured_vehicle",
      "Aucun véhicule en service n'a ses cotes : renseignez la longueur, la largeur et la hauteur utiles d'un véhicule dans Livraison → Véhicules avant de proposer des tournées.",
    );
  }
}

/** « Proposer » sans aucun type de bac en service. */
export class NoActiveBinTypeError extends BusinessError {
  constructor() {
    super(
      "delivery.no_active_bin_type",
      "Aucun type de bac n'est en service : ajoutez-en un, ou réactivez-en un, dans Livraison → Bacs avant de proposer des tournées.",
    );
  }
}

/** Le geste qui ferait sortir le dernier véhicule mesuré de la composition. */
export type MeasuredVehicleGesture = "retire" | "erase_cargo";

/**
 * Retirer le dernier véhicule en service qui a ses cotes, ou effacer ses cotes :
 * les tournées ne pourraient plus être proposées.
 */
export class LastMeasuredVehicleError extends BusinessError {
  constructor(name: string, gesture: MeasuredVehicleGesture) {
    super(
      "delivery.last_measured_vehicle",
      gesture === "retire"
        ? `Le véhicule « ${name} » est le dernier en service à avoir ses cotes : sans lui, les tournées ne peuvent plus être proposées. Renseignez d'abord les cotes d'un autre véhicule dans Livraison → Véhicules, puis retirez celui-ci.`
        : `Le véhicule « ${name} » est le dernier en service à avoir ses cotes : les effacer empêcherait de proposer des tournées. Renseignez d'abord celles d'un autre véhicule dans Livraison → Véhicules.`,
    );
  }
}

/** Archiver le dernier type de bac en service : les tournées ne pourraient plus être proposées. */
export class LastActiveBinTypeError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.last_active_bin_type",
      `Le type « ${name} » est le dernier bac en service : sans lui, les tournées ne peuvent plus être proposées. Ajoutez ou réactivez d'abord un autre type dans Livraison → Bacs, puis archivez celui-ci.`,
    );
  }
}

/**
 * Archiver le type de bac que les réglages prennent pour contenant par défaut
 * d'une commande (2026-10-06) : le réglage citerait un bac hors service, et
 * la demande des commandes sans bacs connus changerait sans que personne
 * l'ait décidé. On refuse plutôt que de vider le réglage en silence.
 */
export class DefaultContainerBinTypeArchiveError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.default_container_bin_type_archive",
      `Le type « ${name} » est le contenant par défaut d'une commande dans le calcul des tournées. Choisissez un autre type, ou videz ce réglage, dans Livraison → Réglages → Point de départ (carte « Calcul des tournées »), puis archivez celui-ci.`,
    );
  }
}

/** Le contenant par défaut choisi n'est pas un type de bac en service. */
export class DefaultContainerBinTypeUnavailableError extends BusinessError {
  constructor(binTypeId: string) {
    super(
      "delivery.default_container_bin_type_unavailable",
      `Le type de bac ${binTypeId} n'est pas en service (archivé, ou absent du catalogue) : il ne peut pas servir de contenant par défaut. Rechargez l'écran et choisissez un type en service, ou réactivez celui-ci dans Livraison → Bacs.`,
    );
  }
}

/**
 * Le contenant par défaut cite un type que le catalogue ne connaît pas. La
 * clé étrangère l'interdit en base : c'est une incohérence, pas un geste.
 */
export class DefaultContainerBinTypeUnknownError extends TechnicalError {
  constructor(binTypeId: string) {
    super(
      "delivery.default_container_bin_type_unknown",
      `Le contenant par défaut des réglages cite le type de bac ${binTypeId}, absent du catalogue des bacs. Signalez-le à l'équipe technique : rien n'a été enregistré.`,
    );
  }
}
