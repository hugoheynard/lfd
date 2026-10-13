import { BusinessError, DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus de l'agrégat `Site` — plan
 * `documentation/livraisons/transferts/plan-sites-transfert-interne-tri-et-couleurs.md`, §3.
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

/**
 * Une couleur trop proche du vert, du rouge ou du rose (**400**) : ces teintes
 * sont celles des surligneurs OK / KO de la logistique, et une commande peinte
 * en vert se lirait « validée » sans l'être.
 */
export class SiteColorReservedError extends DomainError {
  constructor(value: string) {
    super(
      "site.color.reserved",
      `La couleur ${value} est trop proche du vert, du rouge ou du rose, réservés aux surligneurs OK / KO : choisissez-en une autre (bleu, jaune, orange, gris, violet…).`,
    );
  }
}

/**
 * Effacer une couleur déjà posée (**409**). Les couleurs naissent vides et se
 * saisissent à l'écran ; une fois posée, une couleur se change, elle ne
 * s'efface pas — la logistique trierait sinon une catégorie sans couleur.
 */
export class SiteColorErasedError extends BusinessError {
  constructor(which: string) {
    super(
      "site.color.erased",
      `La couleur « ${which} » est déjà posée : on peut la changer, pas l'effacer.`,
    );
  }
}

/** Un site servi par transfert qui ne remet rien (**400**). */
export class SiteTransferWithoutHandoverError extends DomainError {
  constructor() {
    super(
      "site.roles.transfer_without_handover",
      "Un site approvisionné par transfert doit remettre des commandes : sinon on n'y transfère rien qui ait un client. Cochez « Remet des commandes », ou approvisionnez-le sur place.",
    );
  }
}

/** Un site qui expédie mais qui est lui-même servi par transfert (**400**). */
export class SiteDispatchesFromTransferError extends DomainError {
  constructor() {
    super(
      "site.roles.dispatch_from_transfer",
      "Un site d'où partent les livraisons doit être approvisionné sur place : il ne peut pas être lui-même servi par transfert. Changez l'approvisionnement, ou décochez « Expédie ».",
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
export class DispatchingSiteArchiveError extends BusinessError {
  constructor(label: string) {
    super(
      "site.archive.dispatching",
      `Les livraisons partent de « ${label} » : décochez d'abord « Expédie » dans ses rôles, puis archivez-le.`,
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
      "site.default.hands_over",
      `« ${label} » ne remet pas de commandes : il ne peut pas être le site par défaut, que le client voit préselectionné. Cochez « Remet des commandes », ou désignez un autre site par défaut.`,
    );
  }
}
