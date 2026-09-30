import { InvalidWheelArchesError } from "../errors/delivery-floor-errors.js";
import { type CargoDimensions, CargoSpace } from "./cargo-space.js";
import { WheelArches, type WheelArchesInput } from "./wheel-arches.js";

/** Ce que la saisie dit d'un plancher. */
export interface CargoFloorInput extends CargoDimensions {
  readonly wheelArches: WheelArchesInput | null;
}

/**
 * **Le plancher d'un véhicule** (G-D2) : l'espace utile de `CargoSpace`, plus
 * ses obstacles. Il COMPOSE `CargoSpace` plutôt que d'en recopier les bornes —
 * une dimension se valide à un seul endroit, avec un seul message.
 *
 * `wheelArches: null` = un rectangle, ce qu'est tout véhicule tant qu'on n'a
 * pas mesuré ses passages.
 */
export class CargoFloor implements CargoDimensions {
  private constructor(
    readonly space: CargoSpace,
    readonly wheelArches: WheelArches | null,
  ) {}

  /**
   * @throws {InvalidCargoDimensionsError} une dimension hors 1–1 000 cm.
   * @throws {InvalidWheelArchesError} une saillie qui ferme le plancher, un
   *   passage qui sort du véhicule.
   */
  static of(input: CargoFloorInput): CargoFloor {
    const space = CargoSpace.of(input);
    if (input.wheelArches === null) {
      return new CargoFloor(space, null);
    }
    const arches = WheelArches.of(input.wheelArches);
    if (2 * arches.protrusionCm >= space.widthCm) {
      throw new InvalidWheelArchesError(
        `une saillie de ${arches.protrusionCm} cm de chaque côté ne laisse rien entre les passages d'un plancher de ${space.widthCm} cm de large`,
      );
    }
    if (arches.endCm > space.lengthCm) {
      throw new InvalidWheelArchesError(
        `un passage de ${arches.lengthCm} cm à ${arches.fromBackCm} cm du fond sort d'un plancher de ${space.lengthCm} cm de long`,
      );
    }
    return new CargoFloor(space, arches);
  }

  get lengthCm(): number {
    return this.space.lengthCm;
  }

  get widthCm(): number {
    return this.space.widthCm;
  }

  get heightCm(): number {
    return this.space.heightCm;
  }

  get volumeLiters(): number {
    return this.space.volumeLiters;
  }
}
