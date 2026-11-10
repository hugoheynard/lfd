import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la **procédure de livraison** d'une adresse.
 *
 * Dans leur propre fichier plutôt qu'à la suite de `account-errors.ts`, qui
 * dépasse déjà la taille d'un fichier : une famille neuve n'a pas à prolonger
 * une dette.
 *
 * Chaque message est lu par un gestionnaire ou un agent qui n'a pas le code
 * sous les yeux : il nomme le cas et le geste qui en sort.
 */

// ─── Données mal formées (400) ───────────────────────────────────────────────

/** Un titre vide ou trop long, un texte trop long. */
export class InvalidDeliveryStepError extends DomainError {
  constructor(reason: string) {
    super("account.delivery_step.invalid", `Étape de livraison : ${reason}`);
  }
}

/** La photo n'est pas une image acceptée, ou pèse trop. */
export class InvalidDeliveryStepPhotoError extends DomainError {
  constructor(reason: string) {
    super("account.delivery_step_photo.invalid", `Photo de l'étape : ${reason}`);
  }
}

/**
 * « Retirer la photo » ET une photo jointe, dans la même révision. On ne devine
 * pas laquelle des deux intentions est la bonne.
 */
export class DeliveryStepPhotoIntentError extends DomainError {
  constructor() {
    super(
      "account.delivery_step_photo.ambiguous",
      "La révision demande à la fois de retirer la photo et d'en joindre une nouvelle. " +
        "Joignez la nouvelle photo seule pour la remplacer, ou retirez-la sans en joindre.",
    );
  }
}

// ─── Introuvable (404) ───────────────────────────────────────────────────────

/** L'étape n'est pas (ou plus) dans la procédure de cette adresse. */
export class DeliveryStepNotFoundError extends ResourceNotFoundError {
  constructor(readonly stepId: string) {
    super(
      "account.delivery_step.not_found",
      "Cette étape n'existe plus dans la procédure de livraison. Rechargez la procédure.",
    );
  }
}

/** L'étape n'a pas de photo — ou n'existe pas, la route ne les distingue pas. */
export class DeliveryStepPhotoNotFoundError extends ResourceNotFoundError {
  constructor(readonly stepId: string) {
    super("account.delivery_step_photo.not_found", "Cette étape n'a pas de photo.");
  }
}

// ─── Refus métier (409) ──────────────────────────────────────────────────────

/** La procédure a déjà son nombre maximal d'étapes. */
export class DeliveryProcedureFullError extends BusinessError {
  constructor(max: number) {
    super(
      "account.delivery_procedure.full",
      `La procédure compte déjà ${max} étapes, le maximum. ` +
        "Regroupez deux étapes ou supprimez-en une avant d'en ajouter.",
    );
  }
}

/**
 * Le nouvel ordre ne correspond pas exactement aux étapes en base : quelqu'un
 * a ajouté ou supprimé une étape entre la lecture et l'envoi. On refuse plutôt
 * que de deviner où ranger ce qu'on n'a pas vu.
 */
export class DeliveryProcedureOrderStaleError extends BusinessError {
  constructor() {
    super(
      "account.delivery_procedure.order_stale",
      "La procédure a changé depuis son affichage (une étape a été ajoutée ou supprimée). " +
        "Rechargez-la, puis réordonnez à nouveau.",
    );
  }
}

// ─── Incohérence technique (500) ─────────────────────────────────────────────

/**
 * Les octets rangés sous la clé d'une étape ne sont ni un JPEG ni un PNG. Seul
 * `DeliveryStepPhoto.create` écrit sous ces clés : c'est donc le bucket et la
 * base qui divergent, pas une donnée du client.
 */
export class DeliveryStepPhotoUnreadableError extends TechnicalError {
  constructor(readonly stepId: string) {
    super(
      "account.delivery_step_photo.unreadable",
      "La photo rangée pour cette étape n'est pas une image lisible. " +
        "Déposez une nouvelle photo sur l'étape pour la remplacer.",
    );
  }
}
