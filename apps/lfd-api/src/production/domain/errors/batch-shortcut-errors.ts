import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **raccourcis du fournil** (Réglages › Production, plan
 * `documentation/fournil/plan-raccourcis-du-fournil.md`, §2). Lus par qui
 * règle l'écran : chacun nomme le cas et ce qu'il faut faire.
 */

/** Un nom vide, ou trop long une fois rogné. */
export class InvalidBatchShortcutLabelError extends DomainError {
  constructor(raw: string, max: number) {
    super(
      "production.batch_shortcut.invalid_label",
      raw.trim() === ""
        ? "Le nom du raccourci est vide : donnez-lui un nom, par exemple « 1 plaque »."
        : `Le nom « ${raw.trim()} » dépasse ${max} caractères : raccourcissez-le.`,
    );
  }
}

/** Un nombre de pièces qui n'est pas un entier d'au moins une pièce. */
export class InvalidBatchShortcutPiecesError extends DomainError {
  constructor(raw: number) {
    super(
      "production.batch_shortcut.invalid_pieces",
      `« ${String(raw)} » pièces ne fait pas un raccourci : saisissez un nombre entier de pièces, au moins 1.`,
    );
  }
}

/** Le produit a déjà son plafond de raccourcis. */
export class TooManyBatchShortcutsError extends BusinessError {
  constructor(sku: string, max: number) {
    super(
      "production.batch_shortcut.too_many",
      `Le produit ${sku} a déjà ${max} raccourcis, le plafond : supprimez-en un avant d'en ajouter un autre.`,
    );
  }
}

/** Le même nom deux fois pour un produit, casse ignorée. */
export class DuplicateBatchShortcutLabelError extends BusinessError {
  constructor(sku: string, label: string) {
    super(
      "production.batch_shortcut.duplicate_label",
      `Le produit ${sku} a déjà un raccourci « ${label} » : choisissez un autre nom, ou modifiez celui qui existe.`,
    );
  }
}

/** Le raccourci visé n'existe pas, ou a déjà été supprimé. */
export class BatchShortcutNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "production.batch_shortcut.not_found",
      `Le raccourci ${id} n'existe pas ou a déjà été supprimé : rechargez la page des raccourcis.`,
    );
  }
}
