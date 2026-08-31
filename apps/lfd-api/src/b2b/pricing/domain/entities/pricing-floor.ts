import {
  AmountFloorOnBroadScopeError,
  DynamicFloorNotBelowHardError,
  FloorAboveCanonicalError,
  InvalidAlterationError,
  ScopeIdMismatchError,
  UnlockableDynamicFloorError,
} from "../pricing-errors.js";
import type { PriceFloorPolicy } from "../floor-policy.js";
import type { PriceFloor, PriceScope, ScopedPriceFloor } from "../price-rule.js";

/** L'état persisté d'un plancher posé — le mur, et la porte s'il y en a une. */
export interface PricingFloorState {
  readonly id: string;
  readonly scope: PriceScope;
  readonly policy: PriceFloorPolicy;
  readonly createdBy: string;
  /**
   * Le tarif représentatif des articles visés, figé à la pose. `null` quand
   * l'appelant ne sait pas le calculer — le signal de dérive se taira, plutôt
   * que d'annoncer un écart nul qu'il n'a pas mesuré.
   */
  readonly referenceCanonicalMillicents: number | null;
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
   * @throws {AmountFloorOnBroadScopeError} limite en euros au-delà d'un article.
   */
  static pose(
    scope: PriceScope,
    policy: PriceFloorPolicy,
    createdBy: string,
    referenceCanonicalMillicents: number | null = null,
  ): PricingFloor {
    if ((scope.type === "global") !== (scope.id === null)) {
      throw new ScopeIdMismatchError("portée", scope.type === "global", scope.id);
    }

    assertSaneFloor(policy.hard);
    assertUnitScoped(scope, policy.hard);
    const dynamic = policy.dynamic;
    if (dynamic !== null) {
      assertSaneFloor(dynamic.floor);
      assertUnitScoped(scope, dynamic.floor);

      // Une porte sans clé serait un mur plus bas : le plancher dur ne servirait
      // plus à rien, et personne ne verrait qu'il a été contourné.
      if (dynamic.unlock.minQuantity === null && dynamic.unlock.minVolumeRatioBp === null) {
        throw new UnlockableDynamicFloorError();
      }

      // Une porte PLUS HAUTE que le mur ne s'ouvre sur rien : le mur mordrait
      // d'abord, et l'écran afficherait une condition de volume qui ne change
      // jamais le prix. Refusé à la saisie, où c'est encore une faute de frappe.
      if (!isStrictlyBelow(dynamic.floor, policy.hard)) {
        throw new DynamicFloorNotBelowHardError();
      }
    }

    return new PricingFloor({
      id: floorIdForScope(scope),
      scope,
      policy,
      createdBy,
      referenceCanonicalMillicents,
    });
  }

  static reconstitute(state: PricingFloorState): PricingFloor {
    return new PricingFloor(state);
  }

  get id(): string {
    return this.state.id;
  }

  /** La forme que lit la résolution. */
  get asScopedFloor(): ScopedPriceFloor {
    return { id: this.state.id, scope: this.state.scope, policy: this.state.policy };
  }

  toPersistence(): PricingFloorState {
    return this.state;
  }
}

/**
 * **Une limite en euros n'a de sens que sur une unité.**
 *
 * « Jamais sous 1,50 € » sur tout le catalogue laisserait passer une pièce
 * montée à 1,50 € et relèverait un croissant qui se vend 2,00 € : le même mur,
 * deux effets opposés. Une fraction, elle, suit l'article — « jamais sous 60 %
 * du tarif » protège les deux à leur échelle.
 *
 * Refusé ici, dans l'agrégat, et non dans le schéma de fil : c'est une règle du
 * modèle, pas une contrainte de saisie, et l'import comme le seed doivent la
 * rencontrer aussi.
 */
function assertUnitScoped(scope: PriceScope, floor: PriceFloor): void {
  const isUnit = scope.type === "product" || scope.type === "variant";
  if (floor.mode === "amount" && !isUnit) {
    throw new AmountFloorOnBroadScopeError(scope.type);
  }
}

/** Grandeur strictement positive, et fraction qui ne dépasse pas le canonique. */
function assertSaneFloor(floor: PriceFloor): void {
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
}

/**
 * La porte est-elle vraiment **sous** le mur ?
 *
 * Comparable uniquement à unité égale : « 50 % du tarif » et « 1,20 € » ne se
 * comparent pas sans connaître l'article, et cet agrégat n'en connaît aucun (il
 * peut porter sur toute une famille). Deux unités différentes sont donc
 * **acceptées** — la comparaison se fera à la résolution, article par article,
 * où elle a enfin un sens.
 */
function isStrictlyBelow(door: PriceFloor, wall: PriceFloor): boolean {
  if (door.mode === "percent" && wall.mode === "percent") {
    return door.bp < wall.bp;
  }
  if (door.mode === "amount" && wall.mode === "amount") {
    return door.cents < wall.cents;
  }
  return true;
}
