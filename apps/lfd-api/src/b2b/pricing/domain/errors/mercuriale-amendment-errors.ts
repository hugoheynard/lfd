/**
 * **Les refus d'un AVENANT de mercuriale** (`plan-tarif-date-sur-une-reference.md`).
 *
 * Un avenant ajoute un prix daté à la mercuriale d'un client, ou met fin à une
 * ligne à une date, sans réécrire la grille. Chacun de ces refus nomme le cas
 * et le geste de sortie : ils sont lus par un commercial sur la fiche du
 * client, pas par quelqu'un qui a le code sous les yeux.
 */

import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** Le jour civil à Paris, pour les messages : « 2026-11-01 ». */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * **Un avenant sans motif.**
 *
 * Le motif est un invariant du domaine, pas une politesse de l'écran : un prix
 * ajouté en cours d'accord est exactement ce qu'on relit au litige, et « qui a
 * ajouté ça, et pourquoi » ne se reconstitue pas après coup.
 */
export class MissingAmendmentReasonError extends DomainError {
  constructor() {
    super(
      "pricing.mercuriale.amendment.missing_reason",
      "Un avenant à une mercuriale porte toujours un motif : écrivez pourquoi ce prix est ajouté ou arrêté.",
    );
  }
}

/** **Un avenant qui n'ajoute rien et n'arrête rien.** */
export class EmptyAmendmentError extends DomainError {
  constructor() {
    super(
      "pricing.mercuriale.amendment.empty",
      "Cet avenant ne dit rien : ajoutez au moins un article, ou désignez au moins une ligne à arrêter.",
    );
  }
}

/**
 * **Un avenant qui déborde de sa mercuriale.**
 *
 * Il appartient au document : il ne peut pas lui survivre, ni le précéder. Un
 * avenant sans date de fin court jusqu'à la fin de la mercuriale.
 */
export class AmendmentOutsideMercurialeError extends DomainError {
  constructor(
    readonly mercurialeFrom: Date,
    readonly mercurialeTo: Date | null,
  ) {
    super(
      "pricing.mercuriale.amendment.outside_window",
      `Un avenant reste dans la période de sa mercuriale (du ${isoDay(mercurialeFrom)} ${
        mercurialeTo === null ? "sans terme" : `au ${isoDay(mercurialeTo)}`
      }) : choisissez des dates comprises dedans.`,
    );
  }
}

/**
 * **Un avenant rétroactif** (Hugo, 2026-10-29, Q2).
 *
 * La mercuriale a peut-être déjà facturé sur cette période : un prix ajouté
 * dans le passé changerait ce qu'une relecture datée rend pour une commande
 * déjà payée. Un oubli se rattrape en posant l'avenant à partir d'aujourd'hui.
 */
export class RetroactiveAmendmentError extends DomainError {
  constructor(readonly validFrom: Date) {
    super(
      "pricing.mercuriale.amendment.retroactive",
      `Un avenant ne prend effet que pour l'avenir : le ${isoDay(validFrom)} est déjà passé. Faites-le partir d'aujourd'hui.`,
    );
  }
}

/**
 * **Un article déjà négocié sur cette période** — dans la grille, ou par un
 * autre avenant qui court en même temps.
 *
 * Deux prix pour le même article à la même date : celui appliqué dépendrait de
 * l'ordre de lecture. Pour changer un prix, l'avenant arrête l'ancienne ligne
 * et en ouvre une nouvelle à la même date.
 *
 * `amendedFrom` = la date de l'avenant qui la porte, `null` = la grille.
 */
export class SkuAlreadyNegotiatedError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly amendedFrom: Date | null,
  ) {
    super(
      "pricing.mercuriale.amendment.sku_already_negotiated",
      `L'article « ${sku} » a déjà un prix ${
        amendedFrom === null
          ? "dans la grille de cette mercuriale"
          : `ajouté par l'avenant du ${isoDay(amendedFrom)}`
      } sur cette période. Pour le changer, arrêtez cette ligne dans le même avenant.`,
    );
  }
}

/** **Une fin demandée pour une ligne qui ne court pas** à cette date. */
export class NoNegotiatedLineToEndError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly at: Date,
  ) {
    super(
      "pricing.mercuriale.amendment.nothing_to_end",
      `Aucun prix négocié de « ${sku} » ne court le ${isoDay(at)} dans cette mercuriale : il n'y a rien à arrêter.`,
    );
  }
}

/** **La même ligne arrêtée deux fois** dans un seul avenant. */
export class DuplicateEndedSkuError extends DomainError {
  constructor(readonly sku: string) {
    super(
      "pricing.mercuriale.amendment.duplicate_end",
      `L'article « ${sku} » est désigné deux fois parmi les lignes à arrêter : retirez le doublon.`,
    );
  }
}

/** **La mercuriale à amender n'existe pas chez ce client.** */
export class AmendedMercurialeNotFoundError extends ResourceNotFoundError {
  constructor(readonly mercurialeId: string) {
    super(
      "pricing.mercuriale.amendment.mercuriale_not_found",
      `Aucune mercuriale ${mercurialeId} sur ce compte à amender : rechargez la fiche tarifaire du client.`,
    );
  }
}
