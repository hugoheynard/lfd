/**
 * Catégories d'erreurs de l'application.
 *
 * - `domain`    — une règle du modèle est violée (donnée mal formée, invariant cassé).
 *                 Le domaine se protège lui-même : ces erreurs naissent dans les entités
 *                 et les value objects, pas dans les contrôleurs.
 * - `business`  — l'opération est refusée pour une raison métier légitime (référence déjà
 *                 prise, publication sans allergènes). L'appelant a fait une demande
 *                 valide dans sa forme, mais impossible dans l'état courant.
 * - `technical` — l'infrastructure a échoué (base injoignable, appel réseau). Rien à
 *                 corriger côté appelant.
 *
 * Aucune de ces classes ne connaît HTTP : la traduction en code de statut est le travail
 * du filtre d'exceptions, à la frontière.
 */
export type ErrorCategory = 'domain' | 'business' | 'technical';

export abstract class AppError extends Error {
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
    super('domain', code, message, cause);
  }
}

export abstract class BusinessError extends AppError {
  protected constructor(code: string, message: string, cause?: unknown) {
    super('business', code, message, cause);
  }
}

/**
 * Sous-famille de `BusinessError` : la ressource visée n'existe pas.
 *
 * Distinguée parce qu'elle vaut un **404**, là où le reste du métier vaut un 409.
 * C'est le filtre HTTP qui le sait — l'erreur, elle, ignore toujours le transport.
 */
export abstract class ResourceNotFoundError extends BusinessError {}

export abstract class TechnicalError extends AppError {
  protected constructor(code: string, message: string, cause?: unknown) {
    super('technical', code, message, cause);
  }
}
