import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la **demande de modification de commande** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M4). Lus par un
 * client ou par le commerce, sans le code sous les yeux : chacun nomme le cas
 * et le geste de sortie.
 */

/** La commande n'existe pas, ou n'est pas dans l'espace du client (même 404). */
export class ChangedOrderNotFoundError extends ResourceNotFoundError {
  constructor(orderId: string) {
    super(
      "contact.order_change.order_not_found",
      `La commande ${orderId} est introuvable dans votre espace : vérifier l'espace (perso ou société) depuis lequel vous la demandez.`,
    );
  }
}

/** On ne demande une modification que l'heure limite passée — et la commande pas encore au plan. */
export class OrderChangeNotRequestableError extends BusinessError {
  constructor(orderNumber: string, situation: "still_revisable" | "closed") {
    super(
      "contact.order_change.not_requestable",
      situation === "still_revisable"
        ? `La commande ${orderNumber} se modifie encore directement : utiliser « Modifier ma commande », sans attendre notre réponse.`
        : `La commande ${orderNumber} ne peut plus être modifiée (en préparation, réglée par carte, engagée ou close) : nous écrire depuis « Nous contacter ».`,
    );
  }
}

/** La commande a changé depuis que le client a composé sa demande. */
export class OrderChangeStaleError extends BusinessError {
  constructor(orderNumber: string) {
    super(
      "contact.order_change.stale_revision",
      `La commande ${orderNumber} a été modifiée entre-temps : recharger la page et recomposer la demande sur la commande à jour.`,
    );
  }
}

/** Une demande attend déjà la réponse du commerce pour cette commande. */
export class OrderChangeAlreadyPendingError extends BusinessError {
  constructor(orderNumber: string) {
    super(
      "contact.order_change.already_pending",
      `Une demande de modification de la commande ${orderNumber} attend déjà notre réponse : attendre celle-ci, ou nous écrire depuis « Nous contacter » pour la compléter.`,
    );
  }
}

/** Aucun motif « modification de commande » n'est ouvert : personne ne recevrait la demande. */
export class OrderChangeReasonMissingError extends BusinessError {
  constructor() {
    super(
      "contact.order_change.no_reason",
      "Les demandes de modification ne sont pas ouvertes pour l'instant : nous écrire depuis « Nous contacter ». " +
        "(Équipe : créer un motif actif dans Demandes clients › Motifs › « Demander une modification ».)",
    );
  }
}

/** « Appliquer » ou « Refuser » sur une demande qui n'est pas une demande de modification. */
export class NotAnOrderChangeRequestError extends BusinessError {
  constructor(id: string) {
    super(
      "contact.order_change.not_an_order_change",
      `La demande ${id} n'est pas une demande de modification de commande : la marquer traitée.`,
    );
  }
}

/** « Marquer traité » sur une demande de modification : le client attend une réponse. */
export class OrderChangeNeedsDecisionError extends BusinessError {
  constructor(id: string) {
    super(
      "contact.order_change.needs_decision",
      `La demande ${id} est une demande de modification : le client attend une réponse. Choisir « Appliquer » ou « Refuser ».`,
    );
  }
}

/** Une demande anonymisée n'a plus de commande ni de composition à appliquer. */
export class OrderChangeErasedError extends BusinessError {
  constructor(id: string) {
    super(
      "contact.order_change.erased",
      `La demande ${id} a été anonymisée (douze mois) : sa composition est effacée. La traiter n'a plus d'objet.`,
    );
  }
}

/** Un refus sans mot : le client ne saurait pas pourquoi. */
export class OrderChangeRefusalReasonMissingError extends DomainError {
  constructor() {
    super(
      "contact.order_change.refusal_reason_missing",
      "Un refus s'accompagne d'un mot au client : écrire pourquoi la modification n'est pas possible.",
    );
  }
}

/** La composition rangée en base ne se relit plus : rien à appliquer de sûr. */
export class OrderChangeUnreadableError extends TechnicalError {
  constructor(id: string) {
    super(
      "contact.order_change.unreadable",
      `La composition de la demande ${id} est illisible en base : la refuser en invitant le client à la renvoyer, et signaler la demande à l'équipe technique.`,
    );
  }
}
