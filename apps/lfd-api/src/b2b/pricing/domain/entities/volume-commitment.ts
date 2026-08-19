import {
  ArchivedVolumeCommitmentIsSealedError,
  ReversedValidityWindowError,
  ScopeIdMismatchError,
  InvalidPromisedVolumeError,
} from "../pricing-errors.js";
import type { PriceScope } from "../price-rule.js";
import type { VolumeCommitment } from "../volume-commitment.js";

/** Ce qu'un appelant apporte pour signer un engagement — l'intention. */
export interface VolumeCommitmentDraft {
  readonly companyId: string;
  readonly scope: PriceScope;
  readonly promisedQuantity: number;
  readonly validFrom: Date;
  /** **Obligatoire** : un engagement sans terme est une mercuriale. */
  readonly validTo: Date;
}

export interface VolumeCommitmentState extends VolumeCommitmentDraft {
  readonly id: string;
  readonly createdBy: string;
  readonly archivedAt: Date | null;
  readonly archivedBy: string | null;
  readonly archiveReason: string | null;
}

/**
 * **L'engagement de volume, en tant qu'agrégat.**
 *
 * Deux invariants, et une absence qui en dit plus que les deux.
 *
 * Les invariants : la période s'ouvre avant de se fermer, et le volume visé est
 * strictement positif. Un engagement à zéro n'engage à rien et ferait croire
 * l'inverse sur l'écran de suivi.
 *
 * L'absence : **il n'y a pas de pause**. Un engagement court ou il est clos.
 * Le suspendre laisserait une période pendant laquelle le cumul continue de
 * grossir sans que le palier suive — donc un prix que personne n'a décidé, et
 * un client qui découvre à la facture qu'il a payé le tarif d'entrée sur un
 * volume qui aurait dû ouvrir le palier haut.
 */
export class VolumeCommitmentAggregate {
  private constructor(private readonly state: VolumeCommitmentState) {}

  /**
   * @throws {ReversedValidityWindowError} période qui se ferme avant de s'ouvrir.
   * @throws {InvalidPromisedVolumeError} volume visé nul ou négatif.
   * @throws {ScopeIdMismatchError} portée dont l'identifiant contredit le type.
   */
  static sign(
    id: string,
    draft: VolumeCommitmentDraft,
    createdBy: string,
  ): VolumeCommitmentAggregate {
    if (draft.validTo.getTime() <= draft.validFrom.getTime()) {
      throw new ReversedValidityWindowError(draft.validFrom, draft.validTo);
    }
    if (!Number.isInteger(draft.promisedQuantity) || draft.promisedQuantity <= 0) {
      throw new InvalidPromisedVolumeError(draft.promisedQuantity);
    }
    if ((draft.scope.type === "global") !== (draft.scope.id === null)) {
      throw new ScopeIdMismatchError("portée", draft.scope.type === "global", draft.scope.id);
    }
    return new VolumeCommitmentAggregate({
      ...draft,
      id,
      createdBy,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    });
  }

  /** Reconstruit sans revérifier : ce qui est en base y est déjà passé. */
  static reconstitute(state: VolumeCommitmentState): VolumeCommitmentAggregate {
    return new VolumeCommitmentAggregate(state);
  }

  get id(): string {
    return this.state.id;
  }

  /**
   * **Clore.** Terminal, et il n'y a pas d'autre sortie.
   *
   * Clore ne révise **rien** : les commandes déjà passées gardent le palier
   * qu'elles ont mérité, leur trace le dit, et c'est toute la raison d'avoir
   * choisi le cumul plutôt qu'un prix fixe. La clôture rend simplement la
   * période libre pour un engagement suivant.
   *
   * @throws {ArchivedVolumeCommitmentIsSealedError} il l'est déjà.
   */
  close(by: string, at: Date, reason: string | null): VolumeCommitmentAggregate {
    if (this.state.archivedAt !== null) {
      throw new ArchivedVolumeCommitmentIsSealedError(this.state.id);
    }
    return new VolumeCommitmentAggregate({
      ...this.state,
      archivedAt: at,
      archivedBy: by,
      archiveReason: reason,
    });
  }

  /** La forme que lit la résolution — sans le cycle de vie, qui ne la regarde pas. */
  get asCommitment(): VolumeCommitment {
    return {
      id: this.state.id,
      companyId: this.state.companyId,
      scope: this.state.scope,
      promisedQuantity: this.state.promisedQuantity,
      validFrom: this.state.validFrom,
      validTo: this.state.validTo,
    };
  }

  toPersistence(): VolumeCommitmentState {
    return this.state;
  }
}
