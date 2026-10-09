import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** Un motif sans libellé français : la boutique n'aurait rien à afficher. */
export class RequestReasonLabelMissingError extends DomainError {
  constructor() {
    super(
      "contact.reason.label_missing",
      "Un motif demande un libellé en français : c'est lui que la boutique affiche quand l'anglais ou l'italien manquent.",
    );
  }
}

/** Un motif sans type, ou d'un type inconnu : aucun formulaire ne saurait le proposer. */
export class RequestReasonKindUnknownError extends DomainError {
  constructor(kind: string) {
    super(
      "contact.reason.kind_unknown",
      `Le type de motif « ${kind} » n'existe pas : choisir « Nous écrire » ou « Signaler un problème ».`,
    );
  }
}

/** Le type d'un motif ne change pas : les demandes reçues le citent sous son formulaire d'origine. */
export class RequestReasonKindImmutableError extends DomainError {
  constructor(id: string) {
    super(
      "contact.reason.kind_immutable",
      `Le motif ${id} appartient à un autre formulaire, et un motif ne change pas de formulaire : en créer un nouveau dans le bon onglet, puis archiver celui-ci.`,
    );
  }
}

/** Un texte plus long que ce que l'écran et le courriel savent porter. */
export class ContactTextTooLongError extends DomainError {
  constructor(field: string, max: number) {
    super(
      "contact.text.too_long",
      `« ${field} » dépasse ${String(max)} caractères : raccourcir le texte.`,
    );
  }
}

/** Un rang (motif, numéro) qui n'est pas un entier positif. */
export class ContactPositionInvalidError extends DomainError {
  constructor(position: number) {
    super(
      "contact.position_invalid",
      `Le rang ${String(position)} n'est pas un entier positif ou nul : choisir 0, 1, 2…`,
    );
  }
}

/** Une demande sans nom, ou un message sans texte : personne ne saurait à qui répondre, ni quoi. */
export class CustomerRequestIncompleteError extends DomainError {
  constructor(field: "name" | "message") {
    super(
      "contact.request.incomplete",
      field === "name"
        ? "La demande n'a pas de nom d'auteur : indiquer votre nom pour qu'on puisse vous répondre."
        : "Le message est vide : écrire quelques mots avant d'envoyer.",
    );
  }
}

/** Le motif demandé n'existe pas. */
export class RequestReasonNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "contact.reason.not_found",
      `Le motif ${id} n'existe pas : recharger la liste des motifs.`,
    );
  }
}

/** Le motif existe mais n'est pas proposé par ce formulaire, à ce public, ou plus du tout. */
export class RequestReasonUnavailableError extends BusinessError {
  constructor(id: string) {
    super(
      "contact.reason.unavailable",
      `Le motif ${id} n'est plus proposé ici : rouvrir le formulaire et choisir un autre motif.`,
    );
  }
}

export class CustomerRequestNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "contact.request.not_found",
      `La demande ${id} n'existe pas : recharger la boîte des demandes.`,
    );
  }
}

/** Une demande déjà traitée ne se traite pas deux fois : la trace dirait deux auteurs. */
export class CustomerRequestAlreadyHandledError extends BusinessError {
  constructor(id: string, handledBy: string) {
    super(
      "contact.request.already_handled",
      `La demande ${id} est déjà traitée${handledBy === "" ? "" : ` par ${handledBy}`} : recharger la boîte, elle est passée dans « Traitées ».`,
    );
  }
}

/** La commande signalée n'existe pas, ou n'est pas celle du client (même 404 : on ne dit pas qu'elle existe). */
export class ReportedOrderNotFoundError extends ResourceNotFoundError {
  constructor(orderId: string) {
    super(
      "contact.order_problem.order_not_found",
      `La commande ${orderId} est introuvable dans votre espace : vérifier l'espace (perso ou société) depuis lequel vous signalez.`,
    );
  }
}

/** Le compte qui signale n'existe plus : on ne saurait ni le nommer ni lui répondre. */
export class RequestAuthorUnknownError extends ResourceNotFoundError {
  constructor(userId: string) {
    super(
      "contact.order_problem.author_unknown",
      `Le compte ${userId} est introuvable : se reconnecter, puis signaler à nouveau.`,
    );
  }
}

/** Un problème ne se signale que sur une commande retirée ou livrée. */
export class OrderNotYetFulfilledError extends BusinessError {
  constructor(orderNumber: string) {
    super(
      "contact.order_problem.not_fulfilled",
      `La commande ${orderNumber} n'est pas encore retirée ni livrée : un problème se signale une fois la commande reçue. Pour la modifier avant, nous écrire depuis « Nous contacter ».`,
    );
  }
}

/** Une photo sur une demande dont le type n'en admet pas. */
export class RequestPhotosNotAllowedError extends DomainError {
  constructor() {
    super(
      "contact.request.photos_not_allowed",
      "Ce formulaire n'accepte pas de photo : les photos se joignent à un signalement de problème sur une commande.",
    );
  }
}

/** Une photo de plus que la borne. */
export class TooManyRequestPhotosError extends DomainError {
  constructor(max: number) {
    super(
      "contact.request.too_many_photos",
      `Un signalement porte au plus ${String(max)} photos : retirer celles de trop avant d'envoyer.`,
    );
  }
}

/** Une photo ajoutée à une demande déjà traitée ou anonymisée. */
export class RequestClosedToPhotosError extends BusinessError {
  constructor(id: string) {
    super(
      "contact.request.closed_to_photos",
      `La demande ${id} est déjà traitée : on n'y joint plus de photo. Envoyer un nouveau signalement.`,
    );
  }
}

/** Une photo refusée : vide, trop lourde, d'un format refusé ou tronquée. */
export class InvalidRequestPhotoError extends DomainError {
  constructor(reason: string) {
    super("contact.request.invalid_photo", `Photo refusée : ${reason}`);
  }
}

/** La photo demandée n'existe pas pour cette demande, ou a été purgée. */
export class RequestPhotoNotFoundError extends ResourceNotFoundError {
  constructor(requestId: string, photoId: string) {
    super(
      "contact.request.photo_not_found",
      `La photo ${photoId} de la demande ${requestId} n'existe pas ou a été effacée (anonymisation à douze mois) : recharger la demande.`,
    );
  }
}

/** Un numéro de contact sans libellé français, ou sans numéro : la boutique n'aurait rien à afficher. */
export class ContactPhoneIncompleteError extends DomainError {
  constructor(field: "label" | "number") {
    super(
      "contact.phone.incomplete",
      field === "label"
        ? "Un numéro de contact demande un libellé en français — ce qu'on lit à côté, par exemple « Boutique de Val d'Isère »."
        : "Un numéro de contact demande un numéro : le saisir, ou archiver la ligne.",
    );
  }
}

export class ContactPhoneNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "contact.phone.not_found",
      `Le numéro de contact ${id} n'existe pas : recharger la liste des numéros.`,
    );
  }
}
