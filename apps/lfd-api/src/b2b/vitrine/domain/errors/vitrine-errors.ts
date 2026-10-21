import {
  AuthorizationError,
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/** L'adresse saisie n'est pas une URL lisible. */
export class VitrineEndpointInvalidError extends DomainError {
  constructor() {
    super(
      "vitrine.endpoint.invalid",
      "L'adresse de l'abonné n'est pas une URL : la copier telle que l'agence la donne, en commençant par https://.",
    );
  }
}

/** Une adresse en `http://` : la signature partirait en clair, le secret serait exposé. */
export class VitrineEndpointNotHttpsError extends DomainError {
  constructor() {
    super(
      "vitrine.endpoint.not_https",
      "L'adresse de l'abonné doit commencer par https:// : un envoi en clair exposerait la notification et sa signature. Demander à l'agence son adresse sécurisée.",
    );
  }
}

/**
 * Une adresse qui porte une requête (`?…`), un fragment (`#…`) ou des
 * identifiants (`user:pass@`) : un jeton glissé là serait affiché à l'écran et
 * dans le journal des envois.
 */
export class VitrineEndpointCarriesSecretError extends DomainError {
  constructor() {
    super(
      "vitrine.endpoint.carries_secret",
      "L'adresse de l'abonné ne doit porter ni « ?… », ni « #… », ni identifiant avant « @ » : un jeton à cet endroit serait affiché à l'écran. Demander à l'agence une adresse sans paramètre — la signature suffit à l'authentifier.",
    );
  }
}

/** Un nom vide ou trop long. */
export class VitrineSubscriberNameInvalidError extends DomainError {
  constructor(max: number) {
    super(
      "vitrine.subscriber.name_invalid",
      `Le nom de l'abonné est obligatoire et tient en ${String(max)} caractères au plus : le nom de l'agence suffit.`,
    );
  }
}

/** Une description au-delà de la borne. */
export class VitrineSubscriberDescriptionTooLongError extends DomainError {
  constructor(max: number) {
    super(
      "vitrine.subscriber.description_too_long",
      `La description de l'abonné tient en ${String(max)} caractères au plus : dire en quelques phrases à quoi il sert, le reste a sa place dans la documentation.`,
    );
  }
}

/**
 * Un essai (ou un renvoi) demandé pour un abonné en lecture seule : il n'a
 * pas d'adresse de webhook (décision Hugo du 2026-10-20), rien ne lui part.
 */
export class VitrineSubscriberReadOnlyError extends BusinessError {
  constructor() {
    super(
      "vitrine.subscriber.read_only",
      "Cet abonné n'a pas d'adresse de webhook : il lit le flux, rien ne lui est envoyé.",
    );
  }
}

/** Une case que le webhook ne connaît pas. */
export class VitrineContentUnknownError extends DomainError {
  constructor(content: string) {
    super(
      "vitrine.content.unknown",
      `« ${content} » n'est pas un ensemble que la vitrine peut recevoir : choisir parmi le catalogue, les opérations, les textes et les incontournables.`,
    );
  }
}

/** Un abonné introuvable. */
export class VitrineSubscriberNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "vitrine.subscriber.not_found",
      `L'abonné ${id} n'existe pas : recharger la liste des abonnés.`,
    );
  }
}

/** Une livraison introuvable. */
export class VitrineDeliveryNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "vitrine.delivery.not_found",
      `L'envoi ${id} n'existe pas : recharger le journal des envois.`,
    );
  }
}

/** « Tout renvoyer » ou « Envoyer un test » sur un abonné coupé. */
export class VitrineSubscriberInactiveError extends BusinessError {
  constructor(name: string) {
    super(
      "vitrine.subscriber.inactive",
      `L'abonné « ${name} » est coupé : rien ne lui part. Le rallumer d'abord.`,
    );
  }
}

/** Renvoyer un envoi alors qu'un autre attend déjà : il n'y en a qu'un en vol par abonné. */
export class VitrineDeliveryInFlightError extends BusinessError {
  constructor() {
    super(
      "vitrine.delivery.in_flight",
      "Un envoi attend déjà de partir vers cet abonné, et il n'y en a qu'un à la fois : attendre qu'il parte, ou utiliser « Tout renvoyer ».",
    );
  }
}

/** Renvoyer un envoi qui attend déjà, ou un essai. */
export class VitrineDeliveryNotResendableError extends BusinessError {
  constructor(reason: "pending" | "test") {
    super(
      "vitrine.delivery.not_resendable",
      reason === "pending"
        ? "Cet envoi attend déjà de partir : il repartira de lui-même au prochain passage."
        : "Un essai ne se renvoie pas : utiliser « Envoyer un test » pour en faire un nouveau.",
    );
  }
}

/** Une livraison sans aucun changement : rien à dire à l'agence. */
export class VitrineDeliveryEmptyError extends DomainError {
  constructor() {
    super(
      "vitrine.delivery.empty",
      "Une notification sans aucun changement ne part pas : il n'y a rien à dire à l'abonné.",
    );
  }
}

/** Absorber des changements dans un envoi qui n'attend plus. */
export class VitrineDeliveryNotPendingError extends BusinessError {
  constructor(id: string) {
    super(
      "vitrine.delivery.not_pending",
      `L'envoi ${id} est déjà parti ou en échec : un nouveau changement ouvre un nouvel envoi.`,
    );
  }
}

/** Une clé de lecture absente, inconnue ou remplacée par une rotation. */
export class VitrineReadKeyRefusedError extends AuthorizationError {
  constructor() {
    super(
      "vitrine.read_key.refused",
      "Clé de lecture absente ou inconnue (en-tête X-Vitrine-Key, ou paramètre « key » de l’URL). Après une régénération au back-office, l'ancienne clé ne vaut plus : demander la nouvelle.",
    );
  }
}

/** Un article qui n'est pas dans la vue de l'abonné. */
export class VitrineArticleNotFoundError extends ResourceNotFoundError {
  constructor(sku: string) {
    super(
      "vitrine.article.not_found",
      `L'article ${sku} n'est pas en vente au public, ou l'abonné ne reçoit pas le catalogue : relire GET /vitrine/catalogue.`,
    );
  }
}

/** Renvoyer un envoi à un abonné en échec : il faut d'abord resynchroniser. */
export class VitrineSubscriberFailingError extends BusinessError {
  constructor(name: string) {
    super(
      "vitrine.subscriber.failing",
      `L'abonné « ${name} » est en échec : plus rien ne lui part. Vérifier que son adresse répond, puis « Tout renvoyer ».`,
    );
  }
}

/** Une langue servie manque à la lecture du balayage : un défaut de code, pas de donnée. */
export class VitrineShowcaseIncompleteError extends TechnicalError {
  constructor() {
    super(
      "vitrine.showcase.incomplete",
      "La vue de la vitrine n'a pas pu être lue dans les trois langues : le balayage s'arrête sans rien envoyer, et reprendra au prochain passage.",
    );
  }
}
