import {
  AmbiguousVolumeTierError,
  EmptyVolumeLadderError,
  InvalidAlterationError,
  RegressiveVolumeLadderError,
  ScopeIdMismatchError,
} from "../pricing-errors.js";
import { IN_FORCE, statusOf, suspendedFromOf } from "../rule-lifecycle.js";
import type { RuleLifecycle, RuleStatus } from "../rule-lifecycle.js";
import type { PriceAudience, PriceScope } from "../price-rule.js";
import type { VolumeLadder, VolumeLadderUnit, VolumeTier } from "../volume-ladder.js";

/** Ce qu'un appelant apporte pour poser un barème — l'intention, pas l'état. */
export interface VolumeLadderDraft {
  readonly scope: PriceScope;
  readonly audience: PriceAudience;
  readonly unit: VolumeLadderUnit;
  readonly tiers: readonly VolumeTier[];
  readonly label: string;
}

export interface VolumeLadderState extends VolumeLadderDraft {
  readonly id: string;
  readonly createdBy: string;
  readonly lifecycle: RuleLifecycle;
}

/**
 * **Le barème de volume, en tant qu'agrégat.**
 *
 * Il existe pour porter les refus qu'aucune règle isolée ne pouvait porter.
 * « 50+ à −10 % » et « 100+ à −5 % » sont deux règles parfaitement valides ; le
 * barème qu'elles forment ne l'est pas, et personne ne le voyait.
 *
 * Trois invariants, dont deux n'existaient nulle part :
 *
 * - **une seule unité** par échelle. Sans elle, on ne peut pas comparer deux
 *   paliers sans connaître l'article — donc pas vérifier que le barème progresse ;
 * - **des paliers qui progressent** : commander plus n'accorde jamais moins ;
 * - **des quantités distinctes et positives** : à quantité égale, le gagnant
 *   dépendrait de l'ordre de saisie, donc du hasard.
 *
 * L'identifiant **dérive de la cible** (portée + audience) : « un seul barème
 * par produit », que tu demandais, devient structurel plutôt que surveillé — deux
 * échelles sur la même cible ne peuvent pas même porter deux noms différents.
 */
export class VolumeLadderAggregate {
  private constructor(private readonly state: VolumeLadderState) {}

  /**
   * @throws {ScopeIdMismatchError} portée ou audience dont l'identifiant contredit le type.
   * @throws {EmptyVolumeLadderError} échelle sans palier.
   * @throws {AmbiguousVolumeTierError} deux paliers à la même quantité, ou quantité nulle.
   * @throws {RegressiveVolumeLadderError} palier plus haut, remise plus faible.
   * @throws {InvalidAlterationError} remise nulle ou négative.
   */
  static pose(draft: VolumeLadderDraft, createdBy: string): VolumeLadderAggregate {
    assertScopedId("portée", draft.scope.type === "global", draft.scope.id);
    assertScopedId("audience", draft.audience.type === "all", draft.audience.id);

    if (draft.tiers.length === 0) {
      throw new EmptyVolumeLadderError();
    }

    // Trié ici, une fois : le reste du domaine — et l'écran — peuvent compter
    // sur l'ordre croissant sans le revérifier.
    const tiers = [...draft.tiers].sort((left, right) => left.minQuantity - right.minQuantity);
    assertProgressive(tiers);

    return new VolumeLadderAggregate({
      ...draft,
      tiers,
      id: ladderIdFor(draft.scope, draft.audience),
      createdBy,
      lifecycle: IN_FORCE,
    });
  }

  /** Reconstruit sans revérifier : ce qui est en base y est déjà passé. */
  static reconstitute(state: VolumeLadderState): VolumeLadderAggregate {
    return new VolumeLadderAggregate(state);
  }

  get id(): string {
    return this.state.id;
  }

  get label(): string {
    return this.state.label;
  }

  get status(): RuleStatus {
    return statusOf(this.state.lifecycle);
  }

  /** La forme que lit la résolution — celle du calcul, pas celle du stockage. */
  get asLadder(): VolumeLadder {
    return {
      id: this.state.id,
      scope: this.state.scope,
      audience: this.state.audience,
      unit: this.state.unit,
      tiers: this.state.tiers,
      label: this.state.label,
      suspendedFrom: suspendedFromOf(this.state.lifecycle),
    };
  }

  toPersistence(): VolumeLadderState {
    return this.state;
  }
}

/**
 * L'identifiant **dérivé de la cible**.
 *
 * Même raison que pour un plancher : « un seul barème par produit » devient
 * structurel, donc re-poser est un remplacement — sans lecture préalable, et
 * sans course entre deux écritures concurrentes.
 */
export function ladderIdFor(scope: PriceScope, audience: PriceAudience): string {
  return `${scope.type}:${scope.id ?? ""}|${audience.type}:${audience.id ?? ""}`;
}

/** `id` est renseigné **si et seulement si** la portée n'est pas la plus large. */
function assertScopedId(axis: string, isWidest: boolean, id: string | null): void {
  if (isWidest === (id === null)) {
    return;
  }
  throw new ScopeIdMismatchError(axis, isWidest, id);
}

/**
 * Paliers distincts, positifs, et **qui progressent**.
 *
 * La progression se vérifie sur la valeur brute parce que l'unité est unique
 * pour toute l'échelle : deux points de base, ou deux montants, se comparent
 * sans connaître l'article. C'est exactement ce que l'unité unique achète.
 */
function assertProgressive(tiers: readonly VolumeTier[]): void {
  let previous: VolumeTier | null = null;
  for (const tier of tiers) {
    if (!Number.isInteger(tier.value) || tier.value <= 0) {
      throw new InvalidAlterationError(tier.value);
    }
    if (!Number.isInteger(tier.minQuantity) || tier.minQuantity <= 0) {
      throw new AmbiguousVolumeTierError(tier.minQuantity);
    }
    if (previous === null) {
      previous = tier;
      continue;
    }
    if (tier.minQuantity === previous.minQuantity) {
      throw new AmbiguousVolumeTierError(tier.minQuantity);
    }
    if (tier.value < previous.value) {
      throw new RegressiveVolumeLadderError(tier.minQuantity, previous.minQuantity);
    }
    previous = tier;
  }
}
