import {
  PurchaseCandidateAlreadyArchivedError,
  type PurchaseCandidateKind,
  PurchaseCandidateNotArchivedError,
} from "../errors/delivery-purchase-errors.js";
import type { DeliveryAuthor } from "./departure-choice.js";

/** L'état persisté du cycle de vie d'un candidat — commun aux deux sortes. */
export interface PurchaseCandidateLifecycleState {
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly updatedAt: Date;
  readonly updatedBy: DeliveryAuthor;
  readonly archivedAt: Date | null;
}

/**
 * **Le cycle de vie d'un candidat** de la bibliothèque d'achat : déclaré,
 * corrigé, archivé, réactivé — jamais supprimé. Composé par les deux agrégats
 * plutôt que recopié : la règle « on n'archive pas deux fois » n'a qu'un
 * endroit. L'auteur du dernier geste est figé à cet instant.
 */
export class PurchaseCandidateLifecycle {
  private constructor(
    private readonly kind: PurchaseCandidateKind,
    readonly createdAt: Date,
    readonly createdByStaffId: string,
    private currentUpdatedAt: Date,
    private currentUpdatedBy: DeliveryAuthor,
    private currentArchivedAt: Date | null,
  ) {}

  static begin(
    kind: PurchaseCandidateKind,
    at: Date,
    author: DeliveryAuthor,
  ): PurchaseCandidateLifecycle {
    return new PurchaseCandidateLifecycle(kind, at, author.staffUserId, at, author, null);
  }

  static restore(
    kind: PurchaseCandidateKind,
    state: PurchaseCandidateLifecycleState,
  ): PurchaseCandidateLifecycle {
    return new PurchaseCandidateLifecycle(
      kind,
      state.createdAt,
      state.createdByStaffId,
      state.updatedAt,
      state.updatedBy,
      state.archivedAt,
    );
  }

  get archivedAt(): Date | null {
    return this.currentArchivedAt;
  }

  get inLibrary(): boolean {
    return this.currentArchivedAt === null;
  }

  touch(at: Date, author: DeliveryAuthor): void {
    this.currentUpdatedAt = at;
    this.currentUpdatedBy = author;
  }

  /** @throws {PurchaseCandidateAlreadyArchivedError} sa date ne se réécrit pas. */
  archive(name: string, at: Date, author: DeliveryAuthor): void {
    if (this.currentArchivedAt !== null) {
      throw new PurchaseCandidateAlreadyArchivedError(this.kind, name);
    }
    this.currentArchivedAt = at;
    this.touch(at, author);
  }

  /** @throws {PurchaseCandidateNotArchivedError} il est déjà dans la bibliothèque. */
  reactivate(name: string, at: Date, author: DeliveryAuthor): void {
    if (this.currentArchivedAt === null) {
      throw new PurchaseCandidateNotArchivedError(this.kind, name);
    }
    this.currentArchivedAt = null;
    this.touch(at, author);
  }

  toState(): PurchaseCandidateLifecycleState {
    return {
      createdAt: this.createdAt,
      createdByStaffId: this.createdByStaffId,
      updatedAt: this.currentUpdatedAt,
      updatedBy: this.currentUpdatedBy,
      archivedAt: this.currentArchivedAt,
    };
  }
}
