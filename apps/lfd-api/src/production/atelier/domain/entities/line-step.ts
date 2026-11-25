import { InvalidStepReasonError } from "../errors/line-step-errors.js";

/** La raison la plus longue que le rouge d'une étape accepte (le CHECK de la table dit la même). */
export const STEP_REASON_MAX = 500;

/** `undone` : l'étape a été décochée, elle attend de nouveau. */
export type LineStepStatus = "done" | "red" | "undone";

/** Qui a fait le dernier geste sur l'étape, et quand. `name` : instantané, `null` s'il manquait. */
export interface StepMark {
  readonly at: Date;
  readonly staffId: string;
  readonly name: string | null;
}

/** La clé d'une étape : une ligne de la journée, un poste. */
export interface LineStepKey {
  readonly serviceDay: string;
  readonly sku: string;
  readonly workstationId: string;
}

/** L'état d'une étape, tel que le dépôt le range et le relit. */
export interface LineStepState extends LineStepKey {
  readonly status: LineStepStatus;
  /** Seul un rouge en porte une ; `null` sinon, ou rouge sans raison. */
  readonly reason: string | null;
  readonly checked: StepMark;
  readonly version: number;
}

/**
 * **L'étape d'un poste qui ne finit pas la ligne** (
 * `documentation/fournil/plan-produit-sur-plusieurs-postes.md`, § 2.6).
 *
 * Elle ne compte aucune pièce : cocher, mettre en rouge ou décocher ne touche
 * jamais une fournée. Chaque geste qui la change monte la version ; un geste
 * qui ne change rien le dit (`false`) et l'appelant n'écrit ni ne
 * journalise. Une étape décochée reste en base, `undone` : sa version et son
 * dernier auteur survivent.
 */
export class LineStep {
  /**
   * @param loadedVersion la version relue en base ; `null` pour une étape
   * neuve. L'écriture ne remplace que cette version.
   */
  private constructor(
    private current: LineStepState,
    readonly loadedVersion: number | null,
  ) {}

  /** La première coche d'une étape. */
  static checkDone(key: LineStepKey, mark: StepMark): LineStep {
    return new LineStep({ ...key, status: "done", reason: null, checked: mark, version: 1 }, null);
  }

  /**
   * Le premier geste sur l'étape est un rouge.
   *
   * @throws {InvalidStepReasonError} la raison dépasse {@link STEP_REASON_MAX}.
   */
  static checkRed(key: LineStepKey, reason: string | null, mark: StepMark): LineStep {
    return new LineStep(
      { ...key, status: "red", reason: reasonOf(reason), checked: mark, version: 1 },
      null,
    );
  }

  /** Relit une étape rangée ; la base a déjà tenu ses CHECK. */
  static fromState(state: LineStepState): LineStep {
    return new LineStep(state, state.version);
  }

  /** Cochée. Déjà faite : rien ne change. */
  markDone(mark: StepMark): boolean {
    return this.moveTo("done", null, mark);
  }

  /**
   * En rouge. Déjà en rouge pour la même raison : rien ne change.
   *
   * @throws {InvalidStepReasonError} la raison dépasse {@link STEP_REASON_MAX}.
   */
  markRed(reason: string | null, mark: StepMark): boolean {
    return this.moveTo("red", reasonOf(reason), mark);
  }

  /** Décochée : elle attend de nouveau. Déjà décochée : rien ne change. */
  undo(mark: StepMark): boolean {
    return this.moveTo("undone", null, mark);
  }

  get state(): LineStepState {
    return this.current;
  }

  private moveTo(status: LineStepStatus, reason: string | null, mark: StepMark): boolean {
    if (this.current.status === status && this.current.reason === reason) {
      return false;
    }
    this.current = {
      ...this.current,
      status,
      reason,
      checked: mark,
      version: this.current.version + 1,
    };
    return true;
  }
}

function reasonOf(raw: string | null): string | null {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") {
    return null;
  }
  if ([...trimmed].length > STEP_REASON_MAX) {
    throw new InvalidStepReasonError(STEP_REASON_MAX);
  }
  return trimmed;
}
