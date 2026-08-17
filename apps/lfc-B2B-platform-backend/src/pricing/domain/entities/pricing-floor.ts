import {
  FloorAboveCanonicalError,
  InvalidAlterationError,
  ScopeIdMismatchError,
} from "../pricing-errors.js";
import type { PriceFloor, PriceScope, ScopedPriceFloor } from "../price-rule.js";

/** L'état persisté d'un plancher posé. */
export interface PricingFloorState {
  readonly id: string;
  readonly scope: PriceScope;
  readonly floor: PriceFloor;
  readonly createdBy: string;
}

/** 100 % du prix canonique, en points de base. */
const FULL_CANONICAL_BP = 10_000;

/**
 * L'identifiant **dérivé de la portée**, et non tiré au sort.
 *
 * C'est ce qui rend « un seul plancher par cible » structurel plutôt que
 * surveillé : deux planchers sur la même portée ne peuvent pas même porter deux
 * noms différents, donc re-poser est un `upsert` sur la clé primaire — atomique,
 * sans lecture préalable, et sans course entre deux écritures concurrentes.
 * L'index unique en base devient une seconde barrière, pas la seule.
 */
export function floorIdForScope(scope: PriceScope): string {
  return `${scope.type}:${scope.id ?? ""}`;
}

/**
 * **Le plancher, en tant qu'agrégat.**
 *
 * Trois refus, et le dernier est le seul qui ne soit pas évident.
 */
export class PricingFloor {
  private constructor(private readonly state: PricingFloorState) {}

  /**
   * @throws {ScopeIdMismatchError} portée dont l'identifiant contredit le type.
   * @throws {InvalidAlterationError} grandeur nulle ou négative.
   * @throws {FloorAboveCanonicalError} fraction supérieure à 100 % du canonique.
   */
  static pose(scope: PriceScope, floor: PriceFloor, createdBy: string): PricingFloor {
    if ((scope.type === "global") !== (scope.id === null)) {
      throw new ScopeIdMismatchError("portée", scope.type === "global", scope.id);
    }

    const magnitude = floor.mode === "percent" ? floor.bp : floor.cents;
    if (!Number.isInteger(magnitude) || magnitude <= 0) {
      throw new InvalidAlterationError(magnitude);
    }

    // Un plancher à 120 % du canonique ne planchérait rien : il RELÈVERAIT tous
    // les prix, y compris ceux qu'aucune règle n'a touchés. Ce serait une hausse
    // tarifaire déguisée en garde-fou, saisie dans l'écran qui protège des
    // hausses — et personne ne penserait à la chercher là.
    if (floor.mode === "percent" && floor.bp > FULL_CANONICAL_BP) {
      throw new FloorAboveCanonicalError(floor.bp);
    }

    return new PricingFloor({ id: floorIdForScope(scope), scope, floor, createdBy });
  }

  static reconstitute(state: PricingFloorState): PricingFloor {
    return new PricingFloor(state);
  }

  get id(): string {
    return this.state.id;
  }

  /** La forme que lit la résolution. */
  get asScopedFloor(): ScopedPriceFloor {
    return { id: this.state.id, scope: this.state.scope, floor: this.state.floor };
  }

  toPersistence(): PricingFloorState {
    return this.state;
  }
}
