import { DomainError, TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la **géométrie du plancher**
 * (`documentation/livraisons/plan-geometrie-du-plancher.md`, G-D2) — lus par
 * qui mesure un véhicule, mètre en main : chacun nomme la cote fautive et le
 * geste de sortie.
 */

/** Des passages de roue qui ne peuvent pas exister dans ce plancher. */
export class InvalidWheelArchesError extends DomainError {
  constructor(detail: string) {
    super(
      "delivery.wheel_arches_invalid",
      `Passages de roue refusés : ${detail}. Mesurez-les au sol, en centimètres entiers, ou retirez-les si le plancher est un rectangle.`,
    );
  }
}

/** Un jeu entre bacs hors bornes. */
export class InvalidBinGapError extends DomainError {
  constructor(value: number, min: number, max: number) {
    super(
      "delivery.bin_gap_invalid",
      `Un jeu de ${value} cm entre bacs n'est pas admis : saisissez un nombre entier de ${min} à ${max} cm.`,
    );
  }
}

/** Le calcul des rangées a lu une case qu'il n'avait pas remplie : un bogue, jamais une saisie. */
export class FloorLayoutIndexError extends TechnicalError {
  constructor(xCm: number) {
    super(
      "delivery.floor_layout_index",
      `Le calcul du plancher a lu la position ${xCm} cm avant de l'avoir calculée : signalez-le, la saisie n'y est pour rien.`,
    );
  }
}
