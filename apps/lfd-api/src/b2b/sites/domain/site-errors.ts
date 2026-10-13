import { BusinessError, DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus de l'agrégat `Site` — doc
 * `documentation/sites/sites.md`, §2.
 *
 * Tous nomment le cas réel et le geste de sortie : ils sont lus par du
 * personnel qui règle un site sans le code sous les yeux.
 */

/** Une couleur qui n'est pas de la forme `#rrggbb` (**400**). */
export class SiteColorFormatError extends DomainError {
  constructor(value: string) {
    super(
      "site.color.format",
      `« ${value} » n'est pas une couleur : choisissez-la dans le sélecteur (forme #rrggbb).`,
    );
  }
}

/** Un site servi par transfert qui ne remet rien (**400**). */
export class SiteTransferWithoutHandoverError extends DomainError {
  constructor() {
    super(
      "site.roles.transfer_without_handover",
      "Un site approvisionné par transfert doit remettre des commandes : sinon on n'y transfère rien qui ait un client. Cochez « Retrait », ou approvisionnez-le sur place.",
    );
  }
}

/** Un site qui expédie mais qui est lui-même servi par transfert (**400**). */
export class SiteDeliveryDepartureFromTransferError extends DomainError {
  constructor() {
    super(
      "site.roles.delivery_departure_from_transfer",
      "Un site d'où partent les livraisons doit être approvisionné sur place : il ne peut pas être lui-même servi par transfert. Changez l'approvisionnement, ou décochez « Livraison ».",
    );
  }
}

/** Une mise en place au comptoir négative ou non entière (**400**). */
export class SiteCounterSetupError extends DomainError {
  constructor(minutes: number) {
    super(
      "site.counter_setup",
      `Une mise en place de ${String(minutes)} min ne se compte pas : saisissez un nombre entier de minutes, 0 ou plus.`,
    );
  }
}

/** Archiver le site par défaut (**409**). */
export class DefaultSiteArchiveError extends BusinessError {
  constructor(label: string) {
    super(
      "site.archive.default",
      `« ${label} » est le site par défaut : désignez d'abord un autre site par défaut, puis archivez celui-ci.`,
    );
  }
}

/** Archiver un site d'où partent les livraisons (**409**). */
export class DeliveryDepartureSiteArchiveError extends BusinessError {
  constructor(label: string) {
    super(
      "site.archive.delivery_departure",
      `Les livraisons partent de « ${label} » : décochez d'abord « Livraison » dans ses rôles, puis archivez-le.`,
    );
  }
}

/**
 * Un site qui expédie sans point GPS (**409**) : les distances des tournées
 * partent de ce point (Hugo, 2026-10-13). Refusé aux TRANSITIONS seulement —
 * cocher « Livraison », ou effacer le point d'un site qui expédie.
 */
export class SiteDeliveryDepartureWithoutGpsError extends BusinessError {
  constructor(label: string) {
    super(
      "site.delivery_departure.without_gps",
      `Un site qui expédie doit avoir un point GPS : renseignez celui de « ${label} » sous « Livraison », dans ses rôles.`,
    );
  }
}

/**
 * Un site servi par transfert sans point GPS (**409**) : il est la
 * DESTINATION du trajet du transfert (Hugo, 2026-10-13). Refusé aux
 * TRANSITIONS seulement — passer « par transfert », ou effacer le point d'un
 * site qui l'est.
 */
export class SiteTransferWithoutGpsError extends BusinessError {
  constructor(label: string) {
    super(
      "site.transfer.without_gps",
      `Un site approvisionné par transfert doit avoir un point GPS, destination du trajet : renseignez celui de « ${label} » sous « Approvisionné par transfert », dans ses rôles.`,
    );
  }
}

/**
 * Retirer « Livraison » au site d'où partent les tournées (**409**) : la
 * livraison n'aurait plus de départ (Hugo, 2026-10-13).
 */
export class DepartureSiteMustDeliverError extends BusinessError {
  constructor(label: string) {
    super(
      "site.departure.must_deliver",
      `« ${label} » est le point de départ des tournées : choisissez-en un autre dans Livraison › Point de départ avant de retirer « Livraison ».`,
    );
  }
}

/** Toucher un site archivé (**409**). */
export class ArchivedSiteError extends BusinessError {
  constructor(label: string) {
    super(
      "site.archived",
      `« ${label} » est archivé : il ne se modifie plus. Créez un nouveau site si ce lieu reprend du service.`,
    );
  }
}

/**
 * Un site par défaut qui ne remet pas (**409**) : le défaut est le site
 * préselectionné au checkout, et un client ne peut retirer que là où l'on remet.
 */
export class DefaultSiteMustHandOverError extends BusinessError {
  constructor(label: string) {
    super(
      "site.default.pickup",
      `« ${label} » ne remet pas de commandes : il ne peut pas être le site par défaut, que le client voit préselectionné. Cochez « Retrait », ou désignez un autre site par défaut.`,
    );
  }
}
