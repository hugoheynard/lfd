import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **carnet de notes** d'un client.
 *
 * Chaque message est lu par la commerciale ou un administrateur, sans le code
 * sous les yeux : il nomme le cas et le geste qui en sort. Les mots sont ceux de
 * l'écran — « note », « carnet » —, jamais ceux du socle des cartes à photo.
 */

// ─── Données mal formées (400) ───────────────────────────────────────────────

/** Un titre vide ou trop long, une description trop longue. */
export class InvalidClientNoteError extends DomainError {
  constructor(reason: string) {
    super("client_notes.note.invalid", `Note : ${reason}`);
  }
}

/** La photo lisible n'est pas une image acceptée, ou pèse trop. */
export class InvalidClientNotePhotoError extends DomainError {
  constructor(reason: string) {
    super("client_notes.note_photo.invalid", `Photo de la note : ${reason}`);
  }
}

/** La vignette n'est pas une image acceptée, ou pèse trop. */
export class InvalidClientNoteThumbnailError extends DomainError {
  constructor(reason: string) {
    super("client_notes.note_thumbnail.invalid", `Vignette de la note : ${reason}`);
  }
}

/**
 * Une photo sans vignette, ou une vignette sans photo. La liste n'affiche que
 * les vignettes et l'ouverture en grand que la photo : l'une sans l'autre
 * laisserait un trou à l'écran.
 */
export class ClientNotePhotoPairError extends DomainError {
  constructor() {
    super(
      "client_notes.note_photo.unpaired",
      "La photo d'une note s'envoie avec sa vignette : l'une ne va pas sans l'autre. " +
        "Déposez la photo depuis l'écran des notes, qui fabrique la vignette au même envoi.",
    );
  }
}

/** « Retirer la photo » ET une photo jointe, dans la même révision. */
export class ClientNotePhotoIntentError extends DomainError {
  constructor() {
    super(
      "client_notes.note_photo.ambiguous",
      "La révision demande à la fois de retirer la photo et d'en joindre une nouvelle. " +
        "Joignez la nouvelle photo seule pour la remplacer, ou retirez-la sans en joindre.",
    );
  }
}

// ─── Introuvable (404) ───────────────────────────────────────────────────────

/** Aucune société sous cet identifiant : il n'y a pas de carnet à ouvrir. */
export class ClientNotebookCompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "client_notes.company.not_found",
      "Ce client est introuvable, il n'a donc pas de carnet de notes. Revenez à la liste des clients.",
    );
  }
}

/** La note n'est pas (ou plus) dans le carnet de ce client. */
export class ClientNoteNotFoundError extends ResourceNotFoundError {
  constructor(readonly noteId: string) {
    super(
      "client_notes.note.not_found",
      "Cette note n'existe plus dans le carnet de ce client. Rechargez le carnet.",
    );
  }
}

/** La note n'a pas de photo — ou n'est pas dans ce carnet, la route ne les distingue pas. */
export class ClientNotePhotoNotFoundError extends ResourceNotFoundError {
  constructor(readonly noteId: string) {
    super("client_notes.note_photo.not_found", "Cette note n'a pas de photo.");
  }
}

// ─── Refus métier (409) ──────────────────────────────────────────────────────

/** Le carnet a déjà son nombre maximal de notes. */
export class ClientNotebookFullError extends BusinessError {
  constructor(max: number) {
    super(
      "client_notes.notebook.full",
      `Le carnet de ce client compte déjà ${max} notes, le maximum. ` +
        "Supprimez une note devenue inutile avant d'en ajouter une.",
    );
  }
}

/**
 * Le nouvel ordre ne correspond pas exactement aux notes en base : quelqu'un a
 * ajouté ou supprimé une note entre la lecture et l'envoi.
 */
export class ClientNotebookOrderStaleError extends BusinessError {
  constructor() {
    super(
      "client_notes.notebook.order_stale",
      "Le carnet a changé depuis son affichage (une note a été ajoutée ou supprimée). " +
        "Rechargez-le, puis réordonnez à nouveau.",
    );
  }
}

// ─── Incohérence technique (500) ─────────────────────────────────────────────

/**
 * Les octets rangés sous la clé d'une note ne sont ni un JPEG ni un PNG. Seul
 * `ClientNotePhoto.create` écrit sous ces clés : c'est donc le bucket et la base
 * qui divergent, pas une donnée saisie.
 */
export class ClientNotePhotoUnreadableError extends TechnicalError {
  constructor(readonly noteId: string) {
    super(
      "client_notes.note_photo.unreadable",
      "La photo rangée pour cette note n'est pas une image lisible. " +
        "Déposez une nouvelle photo sur la note pour la remplacer.",
    );
  }
}

/**
 * Une note sans auteur connu : un geste qui n'ajoute pas a demandé d'ajouter, ou
 * le carnet a perdu l'auteur d'une note présente. Faute de code, jamais une
 * donnée saisie — et on refuse plutôt que d'écrire un auteur inventé.
 */
export class ClientNoteAuthorMissingError extends TechnicalError {
  constructor() {
    super(
      "client_notes.note.author_missing",
      "L'auteur de la note est inconnu : une note ne s'écrit qu'avec l'agent qui l'a déposée.",
    );
  }
}

/**
 * La paire photo + vignette n'a pas été fournie au rangement. Faute de câblage :
 * la séquence ne range une photo de note qu'avec la vignette validée avec elle.
 */
export class ClientNoteThumbnailMissingError extends TechnicalError {
  constructor() {
    super(
      "client_notes.note_thumbnail.missing",
      "La photo d'une note ne se range qu'avec sa vignette : aucune vignette n'accompagne ce dépôt.",
    );
  }
}
