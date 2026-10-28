import {
  InvalidBatchShortcutLabelError,
  InvalidBatchShortcutPiecesError,
} from "../errors/batch-shortcut-errors.js";

/** Un nom rogné tient en 1 à 30 caractères (plan des raccourcis, §2 ; CHECK en base). */
export const BATCH_SHORTCUT_LABEL_MAX = 30;

/**
 * La borne de la colonne `INTEGER` de Postgres. Ce n'est pas une règle du
 * fournil : au-delà, l'écriture tomberait en panne au lieu d'être refusée.
 */
const STORABLE_PIECES_MAX = 2_147_483_647;

/** Qui a créé le raccourci : l'id de fiche, et son nom figé (`null` : la fiche n'en porte pas). */
export interface BatchShortcutAuthor {
  readonly staffUserId: string;
  readonly name: string | null;
}

/** L'état d'un raccourci tel qu'il se relit d'une ligne. */
export interface BatchShortcutState {
  readonly id: string;
  readonly sku: string;
  readonly label: string;
  readonly pieces: number;
  readonly position: number;
  readonly createdBy: BatchShortcutAuthor;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly removedAt: Date | null;
}

/** Ce qu'un raccourci dit de lui-même : son nom et ses pièces. */
export interface BatchShortcutTerms {
  readonly label: string;
  readonly pieces: number;
}

/**
 * @throws {InvalidBatchShortcutLabelError} vide, ou plus de 30 caractères une fois rogné.
 * Les caractères se comptent en points de code, comme `char_length` en base.
 */
export function batchShortcutLabelOf(raw: string): string {
  const label = raw.trim();
  const length = [...label].length;
  if (length < 1 || length > BATCH_SHORTCUT_LABEL_MAX) {
    throw new InvalidBatchShortcutLabelError(raw, BATCH_SHORTCUT_LABEL_MAX);
  }
  return label;
}

/** @throws {InvalidBatchShortcutPiecesError} pas un entier d'au moins une pièce. */
export function batchShortcutPiecesOf(raw: number): number {
  if (!Number.isInteger(raw) || raw < 1 || raw > STORABLE_PIECES_MAX) {
    throw new InvalidBatchShortcutPiecesError(raw);
  }
  return raw;
}

/** La clé d'unicité d'un nom : casse ignorée, comme l'index `lower(label)`. */
export function batchShortcutLabelKey(label: string): string {
  return label.toLowerCase();
}

/**
 * **Un raccourci du fournil** — pour un produit, un nom et un nombre de pièces
 * (plan `documentation/fournil/plan-raccourcis-du-fournil.md`, §2).
 *
 * Ses règles propres — nom rogné de 1 à 30 caractères, pièces entières ≥ 1 —
 * se jugent ici, à la création comme à la modification. Celles qui regardent
 * ses voisins (plafond, doublon) sont à {@link ProductBatchShortcuts}.
 */
export class BatchShortcut {
  private constructor(private state: BatchShortcutState) {}

  static restore(state: BatchShortcutState): BatchShortcut {
    return new BatchShortcut({
      ...state,
      label: batchShortcutLabelOf(state.label),
      pieces: batchShortcutPiecesOf(state.pieces),
    });
  }

  /** Un raccourci neuf : ses deux instants sont celui du geste. */
  static create(input: {
    readonly id: string;
    readonly sku: string;
    readonly terms: BatchShortcutTerms;
    readonly position: number;
    readonly author: BatchShortcutAuthor;
    readonly at: Date;
  }): BatchShortcut {
    return BatchShortcut.restore({
      id: input.id,
      sku: input.sku,
      label: input.terms.label,
      pieces: input.terms.pieces,
      position: input.position,
      createdBy: input.author,
      createdAt: input.at,
      updatedAt: input.at,
      removedAt: null,
    });
  }

  get id(): string {
    return this.state.id;
  }

  get sku(): string {
    return this.state.sku;
  }

  get label(): string {
    return this.state.label;
  }

  get pieces(): number {
    return this.state.pieces;
  }

  get position(): number {
    return this.state.position;
  }

  get removed(): boolean {
    return this.state.removedAt !== null;
  }

  /** L'état à écrire. */
  snapshot(): BatchShortcutState {
    return this.state;
  }

  terms(): BatchShortcutTerms {
    return { label: this.state.label, pieces: this.state.pieces };
  }

  /** Remplace le nom et les pièces, déjà jugés par l'appelant. */
  reshape(terms: BatchShortcutTerms, at: Date): void {
    this.state = { ...this.state, label: terms.label, pieces: terms.pieces, updatedAt: at };
  }

  /** Archive la ligne : une suppression se trace, elle n'efface rien. */
  remove(at: Date): void {
    this.state = { ...this.state, removedAt: at, updatedAt: at };
  }
}
