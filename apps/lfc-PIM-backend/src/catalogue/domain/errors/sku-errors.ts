import {
  BusinessError,
  DomainError,
} from '../../../shared/errors/app-error.js';

/** La chaîne fournie ne peut pas être une référence — problème de **forme**. */
export class InvalidSkuError extends DomainError {
  constructor(
    readonly raw: string,
    readonly expectation: string,
  ) {
    super(
      'catalogue.sku.invalid',
      `Référence « ${raw} » invalide : ${expectation}.`,
    );
  }
}

/**
 * La référence est bien formée mais déjà portée par un autre article.
 *
 * Levée par l'**adaptateur de dépôt** en traduction de la violation d'index unique
 * (`23505`) — jamais par le service, qui n'a pas à connaître Postgres.
 */
export class SkuAlreadyUsedError extends BusinessError {
  constructor(readonly value: string) {
    super(
      'catalogue.sku.already_used',
      `La référence « ${value} » est déjà utilisée.`,
    );
  }
}

/** Le générateur n'a pas trouvé de référence libre — anomalie, pas un cas courant. */
export class SkuGenerationExhaustedError extends BusinessError {
  constructor(
    readonly root: string,
    readonly attempts: number,
  ) {
    super(
      'catalogue.sku.generation_exhausted',
      `Aucune référence libre trouvée à partir de « ${root} » après ${attempts} tentatives.`,
    );
  }
}
