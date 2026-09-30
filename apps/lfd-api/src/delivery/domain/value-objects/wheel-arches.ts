import { InvalidWheelArchesError } from "../errors/delivery-floor-errors.js";

/** Ce que la saisie dit d'une paire de passages de roue. */
export interface WheelArchesInput {
  /** Longueur du passage, le long du véhicule. */
  readonly lengthCm: number;
  /** Ce qu'il mange de la largeur, de CHAQUE côté. */
  readonly protrusionCm: number;
  /** Distance entre le fond (la cloison) et le début du passage. */
  readonly fromBackCm: number;
}

/**
 * **Une paire de passages de roue**, symétrique (G-D2) : une camionnette n'en
 * a qu'une ; deux paires seraient une question le jour d'un porteur.
 *
 * Seules les cotes propres au passage se valident ici ; ce qui dépend du
 * plancher (la saillie contre la largeur, le passage contre la longueur) est
 * tenu par `CargoFloor`, qui connaît les deux.
 */
export class WheelArches implements WheelArchesInput {
  private constructor(
    readonly lengthCm: number,
    readonly protrusionCm: number,
    readonly fromBackCm: number,
  ) {}

  /** @throws {InvalidWheelArchesError} une cote non entière, nulle ou négative. */
  static of(input: WheelArchesInput): WheelArches {
    return new WheelArches(
      measure("la longueur", input.lengthCm, 1),
      measure("la saillie", input.protrusionCm, 1),
      measure("la distance depuis le fond", input.fromBackCm, 0),
    );
  }

  /** Premier centimètre APRÈS le passage, depuis le fond. */
  get endCm(): number {
    return this.fromBackCm + this.lengthCm;
  }

  /** La tranche `[fromCm, fromCm + depthCm)` touche-t-elle `[fromBack, end)` ? */
  touches(fromCm: number, depthCm: number): boolean {
    return fromCm < this.endCm && this.fromBackCm < fromCm + depthCm;
  }

  toInput(): WheelArchesInput {
    return {
      lengthCm: this.lengthCm,
      protrusionCm: this.protrusionCm,
      fromBackCm: this.fromBackCm,
    };
  }
}

function measure(label: string, value: number, min: number): number {
  if (!Number.isInteger(value) || value < min) {
    throw new InvalidWheelArchesError(`${label} vaut ${value} cm`);
  }
  return value;
}
