import { BusinessError } from '../../../shared/errors/app-error.js';

/** Un régime de TVA visé n'existe pas. */
export class TvaRegimeNotFoundError extends BusinessError {
  constructor(id: string) {
    super(
      'commerce.tva_regime_not_found',
      `Régime de TVA introuvable : ${id}.`,
    );
  }
}

/** Deux régimes ne peuvent pas viser le même taux (même `tag`). */
export class TvaTagConflictError extends BusinessError {
  constructor(tag: string) {
    super(
      'commerce.tva_tag_conflict',
      `Un régime de TVA existe déjà pour ce taux (${tag}).`,
    );
  }
}
