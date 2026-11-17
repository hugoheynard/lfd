import { InvalidProblemOutputError, InvalidProblemReasonError } from "../errors/problem-errors.js";

/** La raison la plus longue que le rouge accepte (le CHECK de la table dit la même). */
export const PROBLEM_REASON_MAX = 500;

/** Qui a fait un geste sur le problème, et quand. `name` : instantané, `null` s'il manquait. */
export interface ProblemMark {
  readonly at: Date;
  readonly staffId: string;
  readonly name: string | null;
}

/** Ce que le rouge dit d'une ligne. */
export interface ProblemReport {
  /** La quantité de la ligne au compte, au moment du rouge. */
  readonly expected: number;
  /** Ce qui est réellement sorti : le plafond. */
  readonly produced: number;
  /** Brute : rognée ici, vide = aucune raison. */
  readonly reason: string | null;
  readonly reported: ProblemMark;
}

/** L'état d'un problème, tel que le dépôt le range et le relit. */
export interface ProductionProblemState {
  readonly id: string;
  readonly serviceDay: string;
  readonly sku: string;
  readonly expected: number;
  readonly produced: number;
  readonly reason: string | null;
  readonly reported: ProblemMark;
  readonly resolved: ProblemMark | null;
  readonly version: number;
}

/**
 * **Le problème d'une ligne** (`documentation/fournil/les-niveaux-de-suivi.md`) — un par journée et SKU.
 *
 * Le sorti déclaré est un **plafond** : rien ne dépasse plus ce nombre ce
 * jour-là pour ce produit, même après « traité ». Un second rouge **remplace**
 * le premier, plus haut ou plus bas, fait monter la version et rouvre le
 * problème : il redevient rouge dans la Supervision.
 */
export class ProductionProblem {
  private constructor(private current: ProductionProblemState) {}

  /**
   * Le premier rouge d'une ligne.
   *
   * @throws {InvalidProblemOutputError} le sorti n'est pas un entier ≥ 0.
   * @throws {InvalidProblemReasonError} la raison dépasse {@link PROBLEM_REASON_MAX}.
   */
  static report(
    identity: { readonly id: string; readonly serviceDay: string; readonly sku: string },
    report: ProblemReport,
  ): ProductionProblem {
    return new ProductionProblem({
      ...identity,
      ...reportedState(report),
      resolved: null,
      version: 1,
    });
  }

  /** Relit un problème rangé ; la base a déjà tenu ses CHECK. */
  static fromState(state: ProductionProblemState): ProductionProblem {
    return new ProductionProblem(state);
  }

  /**
   * Un rouge de plus sur la même ligne : il remplace le précédent, monte la
   * version et rouvre le problème.
   *
   * @throws {InvalidProblemOutputError} le sorti n'est pas un entier ≥ 0.
   * @throws {InvalidProblemReasonError} la raison dépasse {@link PROBLEM_REASON_MAX}.
   */
  reportAgain(report: ProblemReport): void {
    this.current = {
      ...this.current,
      ...reportedState(report),
      resolved: null,
      version: this.current.version + 1,
    };
  }

  /**
   * Un responsable le marque traité. Déjà traité : rien ne change, et la
   * méthode le dit (`false`) pour que l'appelant ne journalise pas deux fois.
   * Le plafond reste.
   */
  resolve(mark: ProblemMark): boolean {
    if (this.current.resolved !== null) {
      return false;
    }
    this.current = { ...this.current, resolved: mark };
    return true;
  }

  get id(): string {
    return this.current.id;
  }

  get version(): number {
    return this.current.version;
  }

  get state(): ProductionProblemState {
    return this.current;
  }
}

function reportedState(
  report: ProblemReport,
): Pick<ProductionProblemState, "expected" | "produced" | "reason" | "reported"> {
  if (!Number.isInteger(report.produced) || report.produced < 0) {
    throw new InvalidProblemOutputError(report.produced);
  }
  return {
    expected: Math.max(0, report.expected),
    produced: report.produced,
    reason: reasonOf(report.reason),
    reported: report.reported,
  };
}

function reasonOf(raw: string | null): string | null {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") {
    return null;
  }
  if ([...trimmed].length > PROBLEM_REASON_MAX) {
    throw new InvalidProblemReasonError(PROBLEM_REASON_MAX);
  }
  return trimmed;
}
