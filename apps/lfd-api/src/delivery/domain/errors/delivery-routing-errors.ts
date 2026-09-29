import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **calculateur de tournée** (plan de tournée, lot 7) — lus au
 * dépôt par qui n'a pas le code sous les yeux : chacun nomme le cas réel et le
 * geste de sortie (`CLAUDE.md` §0).
 */

/** Un réglage du calcul hors de ses bornes. */
export class InvalidRoutingSettingError extends DomainError {
  constructor(detail: string) {
    super("delivery.routing_setting_invalid", `Réglage du calcul refusé : ${detail}`);
  }
}

/** Un point GPS hors des bornes terrestres. */
export class InvalidGeoPointError extends DomainError {
  constructor() {
    super(
      "delivery.geo_point_invalid",
      "Ce point GPS n'existe pas : la latitude tient entre -90 et 90, la longitude entre -180 et 180.",
    );
  }
}

/**
 * **Pas de point de départ situé** (L7-C1) : sans lui, aucune distance ne
 * part de nulle part. Le refus renvoie au réglage.
 */
export class DepartureNotLocatedError extends BusinessError {
  constructor(label: string | null) {
    super(
      "delivery.departure_not_located",
      label === null
        ? "Aucun point de départ n'est choisi : créez un point de retrait, puis choisissez-le dans Livraison → Réglages → Point de départ."
        : `Le point de départ « ${label} » n'a pas de point GPS : renseignez-le dans Livraison → Réglages → Point de départ, puis reproposez.`,
    );
  }
}

/** Un véhicule coché que la flotte ne connaît pas. */
export class RoutingVehicleNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "delivery.routing_vehicle_not_found",
      `Le véhicule ${id} n'est pas dans la flotte : rechargez l'écran, puis cochez à nouveau.`,
    );
  }
}

/** Aucun véhicule ne roule ce jour-là. */
export class NoVehicleForProposalError extends BusinessError {
  constructor(day: string) {
    super(
      "delivery.no_vehicle_for_proposal",
      `Aucun véhicule en service le ${day} : ajoutez ou réactivez un véhicule dans Livraison → Réglages, puis reproposez.`,
    );
  }
}

/** Sans URL de géocodage, « Situer » n'a personne à interroger. */
export class GeocoderDisabledError extends BusinessError {
  constructor() {
    super(
      "delivery.geocoder_disabled",
      "Le géocodage n'est pas configuré sur ce serveur : saisissez les points GPS des adresses dans le carnet du client, ils passent avant tout géocodage.",
    );
  }
}

/** La Base Adresse Nationale n'a pas répondu, ou mal : rien n'a été écrit. */
export class GeocoderUnavailableError extends BusinessError {
  constructor() {
    super(
      "delivery.geocoder_unavailable",
      "La Base Adresse Nationale ne répond pas : rien n'a été enregistré. Réessayez dans quelques minutes, ou saisissez les points GPS dans le carnet du client.",
    );
  }
}

/**
 * **La composition a changé depuis la proposition** (L7-C6, L7-C11) : une
 * tournée lue a bougé, une commande a été placée ailleurs, un passage a été
 * pris. Tout est annulé.
 */
export class ProposalOutdatedError extends BusinessError {
  constructor(detail: string) {
    super(
      "delivery.proposal_outdated",
      `La composition a changé depuis la proposition (${detail}) : rien n'a été appliqué. Reproposez.`,
    );
  }
}

/** La proposition renvoyée n'est pas cohérente : une commande deux fois, un arrêt oublié. */
export class InvalidProposalError extends DomainError {
  constructor(detail: string) {
    super(
      "delivery.proposal_invalid",
      `La proposition renvoyée n'est pas applicable (${detail}) : reproposez, puis appliquez sans la modifier.`,
    );
  }
}

/**
 * Un coût demandé pour un point que la matrice ne connaît pas — deux matrices
 * mêlées. Un défaut du code, jamais d'une saisie.
 */
export class UnknownCostPointError extends TechnicalError {
  constructor(id: string) {
    super(
      "delivery.cost_point_unknown",
      `Le calcul de tournée a demandé un trajet vers ${id}, que sa matrice ne connaît pas : signalez-le, la proposition n'a pas été calculée.`,
    );
  }
}

/**
 * **Le calcul routier ne répond pas** (L10b-C5) — OSRM muet après un nouvel
 * essai, un bloc de la table en échec, ou pas branché du tout. Il n'y a plus
 * de repli à vol d'oiseau : proposer faux en montagne coûtait plus cher que
 * ne rien proposer. Rien n'est écrit, rien n'est touché.
 *
 * `BusinessError` (409), comme {@link GeocoderUnavailableError} : le dépôt
 * n'a pas de catégorie « service indisponible » (503), et une
 * `TechnicalError` masquerait la phrase au personnel qui doit la lire.
 */
export class RoadRoutingUnavailableError extends BusinessError {
  constructor() {
    super(
      "delivery.road_routing_unavailable",
      "Le calcul routier ne répond pas : réessayez dans une minute. Les tournées existantes ne sont pas touchées.",
    );
  }
}

/**
 * **Une tournée partie ou chargée recomposée** (I6, L10b-C2) : on ne
 * chronomètre pas une composition qu'on ne pourrait pas appliquer.
 */
export class LockedRoundRecomposedError extends BusinessError {
  constructor(vehicleName: string, reason: "departed" | "loaded") {
    super(
      "delivery.locked_round_recomposed",
      `La tournée « ${vehicleName} » est ${reason === "departed" ? "partie" : "déjà chargée"} : sa composition ne se modifie plus. Remettez ses arrêts comme ils étaient, ou rechargez la proposition.`,
    );
  }
}

/** Un arrêt à chronométrer sans point GPS (L7-C1) : on ne sait pas y aller. */
export class StopNotLocatedError extends BusinessError {
  constructor(reference: string) {
    super(
      "delivery.stop_not_located",
      `La commande ${reference} n'est pas située : lancez « Situer les arrêts », ou saisissez le point GPS de son adresse dans le carnet du client, puis rechronométrez.`,
    );
  }
}
