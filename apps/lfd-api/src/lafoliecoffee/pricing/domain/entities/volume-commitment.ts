import {
  ArchivedVolumeCommitmentIsSealedError,
  ReversedValidityWindowError,
  ScopeIdMismatchError,
  InvalidPromisedVolumeError,
} from "../pricing-errors.js";
import { WeightArticleCommitmentError } from "../errors/volume-commitment-errors.js";
import type { PriceScope } from "../price-rule.js";
import type { VolumeCommitment } from "../volume-commitment.js";
import { closingWindowAt } from "../rule-lifecycle.js";
import {
  carriedScope,
  carriedWindow,
  detachedOrigin,
  type DecisionCarry,
  type DecisionOrigin,
} from "./decision-carry-over.js";

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
  /** Reporté depuis l'ancienne référence d'un détachement ; absente = signé. */
  readonly origin?: DecisionOrigin;
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

  /**
   * **L'article visé se compte-t-il en pièces ?** Un engagement de portée
   * produit ou déclinaison sur un article au poids est refusé
   * (`vente-au-poids.md`, §2). `weightSold` : les SKU au poids parmi
   * celui de la portée, lus au catalogue par l'appelant.
   *
   * @throws {WeightArticleCommitmentError} la portée vise un article au poids.
   */
  static ensureCountedInPieces(scope: PriceScope, weightSold: ReadonlySet<string>): void {
    if (scope.id !== null && scope.type !== "category" && weightSold.has(scope.id)) {
      throw new WeightArticleCommitmentError(scope.id);
    }
  }

  /**
   * **Le report** sur la référence née d'un détachement
   * (`plan-report-apres-detachement.md`, § 2.1) : la MÊME promesse — même
   * société, même quantité promise, fenêtre `max(maintenant, début)` → fin
   * de l'ancien. La quantité promise fait le prix (`retainedQuantity`) :
   * reporter le reste, ou clore, ferait payer le client plus cher le jour du
   * détachement. L'ancien court jusqu'à sa fin (§ 7 bis) ; il ne cumule rien,
   * son livré se compte sur l'ancienne référence seule.
   *
   * @throws {DecisionNotOnReferenceError} il ne nomme pas l'ancienne référence.
   * @throws {CarriedDecisionClosedError} il est clos, ou terminé.
   * @throws {RetroactiveCarryOverError} la fenêtre commencerait avant maintenant.
   * @throws les refus de `sign`.
   */
  static carriedFrom(
    id: string,
    source: VolumeCommitmentAggregate,
    carry: DecisionCarry,
    createdBy: string,
    now: Date,
  ): VolumeCommitmentAggregate {
    const old = source.state;
    const scope = carriedScope(old.scope, old.id, carry);
    const window = carriedWindow("volume_commitment", old.id, old, now);
    const signed = VolumeCommitmentAggregate.sign(
      id,
      {
        companyId: old.companyId,
        scope,
        promisedQuantity: old.promisedQuantity,
        validFrom: window.validFrom,
        validTo: window.validTo,
      },
      createdBy,
    );
    return new VolumeCommitmentAggregate({
      ...signed.state,
      origin: detachedOrigin(carry, old.id),
    });
  }

  /** Reconstruit sans revérifier : ce qui est en base y est déjà passé. */
  static reconstitute(state: VolumeCommitmentState): VolumeCommitmentAggregate {
    return new VolumeCommitmentAggregate(state);
  }

  get id(): string {
    return this.state.id;
  }

  /** La société engagée — c'est elle que vise un report. */
  get companyId(): string {
    return this.state.companyId;
  }

  /** D'où vient l'engagement quand il a été reporté ; `null` = signé. */
  get origin(): DecisionOrigin | null {
    return this.state.origin ?? null;
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
    // 🔴 Clore BORNE la fenêtre depuis le 2026-09-09 : `archived_at` disait à la
    // fois « rangé » et « il n'agit plus », et la clause `archived_at IS NULL`
    // des lecteurs transformait la seconde en disparition (R17).
    //
    // ⚠️ Ici plus qu'ailleurs, les `null` de `closingWindowAt` comptent :
    // `valid_to` est NOT NULL et porte un CHECK `valid_to > valid_from`
    // (`volume_commitments_window_opens_before_closing`). Borner un engagement
    // qui n'a pas commencé lèverait un **23514** — que `isExclusionViolation`
    // n'attrape pas, puisqu'il compare un nom de contrainte d'exclusion.
    //
    // ⚠️ Et la fenêtre d'un engagement est aussi sa fenêtre de MESURE :
    // `PricingMaterialsLoader` compte le cumul entre `validFrom` et `validTo`.
    // La borner change donc l'assiette du palier — c'est voulu, un engagement
    // clos ne mesure plus après sa clôture.
    const closedAt = closingWindowAt(this.state, null, at);
    return new VolumeCommitmentAggregate({
      ...this.state,
      ...(closedAt === null ? {} : { validTo: closedAt }),
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
