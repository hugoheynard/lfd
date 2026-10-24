import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **bon de livraison** (plan
 * `documentation/commandes/plan-e1-bon-de-livraison-prevu.md`).
 *
 * En E1, personne ne lit ni ne pilote un BL : ces refus ne partent que d'un
 * abonné (l'arrêt du plan) ou de l'annulation d'une commande. Leur message est
 * donc lu par qui relit un message mort sur la carte de santé, ou par le
 * membre de l'équipe dont l'annulation a été refusée.
 */

/** Une commande sans aucune ligne n'a rien à livrer : pas de BL. */
export class DeliveryNoteWithoutLinesError extends DomainError {
  constructor(orderNumber: string) {
    super(
      "delivery_notes.note.no_lines",
      `La commande ${orderNumber} n'a aucune ligne : aucun bon de livraison ne peut être prévu. ` +
        "Vérifier la commande dans le back-office avant de rejouer l'arrêt du plan.",
    );
  }
}

/** Une ligne recopiée porte une valeur qu'une ligne de commande ne peut pas avoir. */
export class InvalidDeliveryNoteLineError extends DomainError {
  constructor(sku: string, reason: string) {
    super(
      "delivery_notes.line.invalid",
      `Bon de livraison, ligne ${sku === "" ? "sans SKU" : sku} : ${reason}. ` +
        "La ligne de commande d'origine est à vérifier ; aucun bon n'a été écrit.",
    );
  }
}

/** Le numéro d'un BL ne se forme qu'à partir d'un numéro de commande `ORD-…` et d'un rang ≥ 1. */
export class InvalidDeliveryNoteNumberError extends DomainError {
  constructor(orderNumber: string, rank: number) {
    super(
      "delivery_notes.number.invalid",
      `Impossible de numéroter le bon de livraison de rang ${rank} de la commande « ${orderNumber} » : ` +
        "le numéro de commande doit commencer par ORD- et le rang être un entier d'au moins 1. " +
        "Prévenir l'équipe technique.",
    );
  }
}

/** Seul un BL prévu se réécrit ; un BL préparé, remis ou annulé garde ses lignes. */
export class DeliveryNoteNotPlannedError extends BusinessError {
  constructor(noteNumber: string, status: string) {
    super(
      "delivery_notes.note.not_planned",
      `Le bon de livraison ${noteNumber} est « ${status} » : seul un bon encore prévu ` +
        "voit ses lignes réécrites. Le bon reste tel quel ; prévenir l'équipe technique.",
    );
  }
}

/**
 * Une transition que le cycle du BL refuse : préparer un bon qui n'est plus
 * prévu, remettre ou annuler un bon déjà remis ou annulé (plan E2, § 8.3).
 */
export class DeliveryNoteTransitionRefusedError extends BusinessError {
  constructor(noteNumber: string, status: string, gesture: string) {
    super(
      "delivery_notes.note.transition_refused",
      `Le bon de livraison ${noteNumber} est « ${status} » : il ne peut pas être ${gesture}. ` +
        "Le bon reste tel quel ; prévenir l'équipe technique avec ce numéro.",
    );
  }
}

/** Le jour de réception d'un BL est un jour civil `AAAA-MM-JJ`, recopié de sa commande. */
export class InvalidDeliveryNoteReceivedOnError extends DomainError {
  constructor(noteNumber: string, receivedOn: string) {
    super(
      "delivery_notes.note.received_on_invalid",
      `Bon de livraison ${noteNumber} : le jour de réception « ${receivedOn} » n'est pas une date AAAA-MM-JJ. ` +
        "La date de réception de la commande est à vérifier ; aucun bon n'a été écrit.",
    );
  }
}

/** Un total d'en-tête recopié de la commande n'est pas un entier de centimes (plan E4a). */
export class InvalidDeliveryNoteTermsError extends DomainError {
  constructor(orderNumber: string, field: string) {
    super(
      "delivery_notes.terms.invalid",
      `Commande ${orderNumber} : le total « ${field} » n'est pas un nombre entier de centimes, ` +
        "le bon de livraison ne peut pas le recopier. Les totaux de la commande sont à vérifier ; aucun bon n'a été écrit.",
    );
  }
}

/**
 * Compléter un en-tête n'est permis que s'il est VIDE, et jamais sur un bon
 * annulé (plan E4a, § 4) : on remplit un champ vide, on ne change aucune
 * valeur posée.
 */
export class DeliveryNoteTermsAlreadySetError extends BusinessError {
  constructor(noteNumber: string, status: string) {
    super(
      "delivery_notes.terms.not_completable",
      `Le bon de livraison ${noteNumber} (« ${status} ») a déjà ses totaux, ou est annulé : ` +
        "ils ne se complètent pas une seconde fois. Le bon reste tel quel ; prévenir l'équipe technique.",
    );
  }
}
