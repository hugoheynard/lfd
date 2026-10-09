import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** Un objet de contact sans libellé français : la boutique n'aurait rien à afficher. */
export class ContactSubjectLabelMissingError extends DomainError {
  constructor() {
    super(
      "contact.subject.label_missing",
      "Un objet de contact demande un libellé en français : c'est lui que la boutique affiche quand l'anglais ou l'italien manquent.",
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

/** Un rang d'objet qui n'est pas un entier positif. */
export class ContactSubjectPositionInvalidError extends DomainError {
  constructor(position: number) {
    super(
      "contact.subject.position_invalid",
      `Le rang ${String(position)} n'est pas un entier positif ou nul : choisir 0, 1, 2…`,
    );
  }
}

/** Un message sans nom, ou sans texte : personne ne saurait à qui répondre, ni quoi. */
export class ContactMessageIncompleteError extends DomainError {
  constructor(field: "name" | "message") {
    super(
      "contact.message.incomplete",
      field === "name"
        ? "Le message n'a pas de nom d'auteur : indiquer votre nom pour qu'on puisse vous répondre."
        : "Le message est vide : écrire quelques mots avant d'envoyer.",
    );
  }
}

/** L'objet demandé n'existe pas, ou n'est plus proposé (archivé). */
export class ContactSubjectNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "contact.subject.not_found",
      `L'objet de contact ${id} n'existe pas ou a été archivé : recharger la liste des objets.`,
    );
  }
}

/** L'objet existe mais n'est pas proposé à ce public, ou il est désactivé. */
export class ContactSubjectUnavailableError extends BusinessError {
  constructor(id: string) {
    super(
      "contact.subject.unavailable",
      `L'objet de contact ${id} n'est plus proposé ici : rouvrir le formulaire et choisir un autre objet.`,
    );
  }
}

export class ContactMessageNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "contact.message.not_found",
      `Le message ${id} n'existe pas : recharger la liste des messages.`,
    );
  }
}

/** Un message déjà traité ne se traite pas deux fois : la trace dirait deux auteurs. */
export class ContactMessageAlreadyHandledError extends BusinessError {
  constructor(id: string, handledBy: string) {
    super(
      "contact.message.already_handled",
      `Le message ${id} est déjà traité${handledBy === "" ? "" : ` par ${handledBy}`} : recharger la liste, il est passé dans « Traités ».`,
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
