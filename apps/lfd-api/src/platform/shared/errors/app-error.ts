/**
 * Catégories d'erreurs de l'application.
 *
 * - `domain`    — une règle du modèle est violée (donnée mal formée, invariant cassé).
 *                 Le domaine se protège lui-même : ces erreurs naissent dans les entités
 *                 et les value objects, pas dans les contrôleurs.
 * - `business`  — l'opération est refusée pour une raison métier légitime (référence déjà
 *                 prise, publication sans allergènes). L'appelant a fait une demande
 *                 valide dans sa forme, mais impossible dans l'état courant.
 * - `authorization` — l'appelant est authentifié mais n'a pas le droit d'agir ici (il
 *                 n'est pas membre de l'entreprise, ou n'en est pas gestionnaire). Le mur
 *                 de tenancy et les rôles vivent là.
 * - `technical` — l'infrastructure a échoué (base injoignable, appel réseau). Rien à
 *                 corriger côté appelant.
 *
 * Aucune de ces classes ne connaît HTTP : la traduction en code de statut est le travail
 * du filtre d'exceptions, à la frontière.
 */
export type ErrorCategory = "domain" | "business" | "authorization" | "technical";

/**
 * Des faits **publiables** joints à une erreur : ils sortent dans la réponse
 * HTTP, y compris en production, y compris sur une erreur technique.
 *
 * La règle est étroite et ne se négocie pas — **des nombres sans contenu**, du
 * genre code de statut d'un service amont. Jamais un message, jamais un
 * identifiant, jamais rien qui vienne du corps d'une réponse tierce : ces
 * choses-là restent dans le journal. Le type l'impose plutôt que de le
 * recommander.
 *
 * Ça existe parce qu'un message neutre ne laisse RIEN à l'exploitant quand les
 * journaux sont inatteignables. Le 2026-08-16, un `500` répété sur l'ouverture
 * d'un accès a résisté une demi-journée, alors que le fournisseur d'identité
 * répondait un numéro parfaitement anodin qui n'arrivait nulle part.
 */
export type PublicErrorFacts = Readonly<Record<string, number>>;

export abstract class AppError extends Error {
  /** Faits publiables (cf. {@link PublicErrorFacts}). Vide sauf mention contraire. */
  readonly facts: PublicErrorFacts = {};

  protected constructor(
    readonly category: ErrorCategory,
    readonly code: string,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export abstract class DomainError extends AppError {
  protected constructor(code: string, message: string, cause?: unknown) {
    super("domain", code, message, cause);
  }
}

export abstract class BusinessError extends AppError {
  protected constructor(code: string, message: string, cause?: unknown) {
    super("business", code, message, cause);
  }
}

/**
 * Sous-famille de `BusinessError` : la ressource visée n'existe pas.
 *
 * Distinguée parce qu'elle vaut un **404**, là où le reste du métier vaut un 409.
 * C'est le filtre HTTP qui le sait — l'erreur, elle, ignore toujours le transport.
 */
export abstract class ResourceNotFoundError extends BusinessError {}

/**
 * L'appelant est authentifié mais n'a pas le droit d'agir sur cette ressource.
 *
 * Vaut un **403** — distinct du 401 (pas authentifié, géré par le guard) et du
 * 404 (n'existe pas). On l'emploie pour une violation du mur de tenancy ou un
 * rôle insuffisant, quand révéler l'existence de la ressource est acceptable ;
 * quand ça ne l'est pas, on préfère un `ResourceNotFoundError` (404) qui ne
 * divulgue rien.
 */
export abstract class AuthorizationError extends AppError {
  protected constructor(code: string, message: string, cause?: unknown) {
    super("authorization", code, message, cause);
  }
}

export abstract class TechnicalError extends AppError {
  protected constructor(code: string, message: string, cause?: unknown) {
    super("technical", code, message, cause);
  }
}
