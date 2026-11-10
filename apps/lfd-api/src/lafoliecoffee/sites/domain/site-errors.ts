import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

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

/**
 * Un site qui fait du retrait sans l'ouvrir à aucune clientèle (**400**,
 * Hugo, 2026-10-15). Même forme que la remise sans clientèle.
 */
export class SitePickupWithoutAudienceError extends DomainError {
  constructor() {
    super(
      "site.roles.pickup_without_audience",
      "Un site qui fait du retrait doit l'ouvrir à au moins une clientèle. Cochez « Retrait pour les pros » ou « Retrait pour les particuliers », ou décochez « Retrait ».",
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
 * Retirer « Sur place » à un site qui a des tables (**409**, Hugo,
 * 2026-10-17) : une grille n'existe que dans une salle.
 */
export class EatInSiteWithTablesError extends BusinessError {
  constructor(label: string, tableCount: number) {
    super(
      "site.eat_in.has_tables",
      `« ${label} » a ${String(tableCount)} table(s) : ramenez leur nombre à 0 dans la carte « Tables » avant de retirer « Sur place ».`,
    );
  }
}

/**
 * Une grille de tables sur un site sans salle (**409**, Hugo, 2026-10-17,
 * `documentation/sites/sites.md` §6 bis).
 */
export class SiteTablesWithoutEatInError extends BusinessError {
  constructor(label: string) {
    super(
      "site.tables.without_eat_in",
      `« ${label} » n'a pas de salle : cochez « Sur place » dans ses rôles avant de lui donner des tables.`,
    );
  }
}

/** Un nombre de tables hors de la grille admise (**400**). */
export class SiteTableCountError extends DomainError {
  constructor(count: number, max: number) {
    super(
      "site.tables.count",
      `${String(count)} table(s) ne se comptent pas : saisissez un nombre entier entre 0 et ${String(max)}.`,
    );
  }
}

/** Un QR demandé pour une table qui n'existe pas (**404**). */
export class SiteTableNotFoundError extends ResourceNotFoundError {
  constructor(label: string, tableNumber: number) {
    super(
      "site.tables.not_found",
      `« ${label} » n'a pas de table ${String(tableNumber)} : augmentez d'abord le nombre de tables.`,
    );
  }
}
