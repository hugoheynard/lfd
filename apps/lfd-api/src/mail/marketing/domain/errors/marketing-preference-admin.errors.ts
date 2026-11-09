import {
  AuthorizationError,
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** La ligne demandée n'est pas au registre de préférence (inconnue, ou effacée avec son accord). */
export class MarketingPreferenceNotFoundError extends ResourceNotFoundError {
  constructor(readonly preferenceId: string) {
    super(
      "MAIL_MARKETING_PREFERENCE_NOT_FOUND",
      "Cette ligne n'est pas au registre des désinscriptions et accords : elle n'existe pas, " +
        "ou l'accord a été effacé à la demande du client. Revenez à la liste.",
    );
  }
}

/**
 * L'adresse de cette ligne a été effacée (règle 23) : seule son empreinte
 * reste, pour que la désinscription tienne. Il n'y a rien à afficher.
 */
export class MarketingPreferenceAddressErasedError extends BusinessError {
  constructor(readonly preferenceId: string) {
    super(
      "MAIL_MARKETING_PREFERENCE_ADDRESS_ERASED",
      "L'adresse de cette désinscription a été effacée à la demande du client : seule son " +
        "empreinte reste, pour qu'aucun e-mail marketing ne lui parte. Il n'y a plus d'adresse à afficher.",
    );
  }
}

/**
 * L'adresse n'a pas été consultée par CETTE personne depuis moins de 5
 * minutes. Un 403 : la ligne existe, lire son adresse demande un geste tracé.
 */
export class MarketingPreferenceRecipientNotRevealedError extends AuthorizationError {
  constructor(readonly preferenceId: string) {
    super(
      "MAIL_MARKETING_PREFERENCE_RECIPIENT_NOT_REVEALED",
      "L'adresse de cette ligne n'est pas affichée : cliquez sur « Afficher l'adresse » pour la " +
        "révéler. La révélation est inscrite au journal et vaut 5 minutes, pour vous seul.",
    );
  }
}

/** L'adresse donnée pour désinscrire n'a pas la forme d'une adresse e-mail. */
export class InvalidStaffUnsubscribeAddressError extends DomainError {
  constructor() {
    super(
      "MAIL_MARKETING_STAFF_ADDRESS_INVALID",
      "L'adresse à désinscrire n'est pas une adresse e-mail (elle doit contenir un @ et faire au " +
        "plus 320 caractères). Corrigez-la puis refaites le geste ; rien n'a été enregistré.",
    );
  }
}

/** L'adresse cherchée dans le registre n'a pas la forme d'une adresse e-mail. */
export class InvalidPreferenceSearchAddressError extends DomainError {
  constructor() {
    super(
      "MAIL_MARKETING_SEARCH_ADDRESS_INVALID",
      "L'adresse cherchée dans les désinscriptions et accords n'est pas une adresse e-mail (elle " +
        "doit contenir un @ et faire au plus 320 caractères). Corrigez-la puis relancez la recherche.",
    );
  }
}

/** La recherche du registre n'existe pas (ou plus : purgée après un an). */
export class MarketingPreferenceSearchNotFoundError extends ResourceNotFoundError {
  constructor(readonly searchId: string) {
    super(
      "MAIL_MARKETING_SEARCH_NOT_FOUND",
      "Cette recherche des désinscriptions et accords n'existe pas. Relancez la recherche par adresse.",
    );
  }
}

/**
 * Une recherche du registre ne se lit que par son auteur, dans les 5 minutes :
 * un 403, qui ne dit rien de ce qu'elle a trouvé.
 */
export class MarketingPreferenceSearchNotReadableError extends AuthorizationError {
  constructor(readonly searchId: string) {
    super(
      "MAIL_MARKETING_SEARCH_NOT_READABLE",
      "Ces résultats ne sont plus lisibles : une recherche par adresse ne se lit que par la " +
        "personne qui l'a lancée, pendant 5 minutes. Relancez la recherche ; elle sera inscrite au journal.",
    );
  }
}
