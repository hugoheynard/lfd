import { GesturePositionInvalidError } from "../errors/gesture-position-errors.js";
import { geoPoint } from "./geo-point.js";

/** Ce que le téléphone dit de sa position, tel que l'application le transmet. */
export interface GesturePositionInput {
  readonly lat: number;
  readonly lng: number;
  /** Le rayon d'incertitude annoncé par le téléphone, en mètres. */
  readonly accuracyM: number;
}

/**
 * **La position du téléphone AU GESTE**
 * (`documentation/livraisons/livreur/gps-y-aller-et-position.md`, YA-D4) — arrivée,
 * remise, dépôt, clôture sans remise. Jamais en continu, jamais exigée.
 *
 * Sa finalité est écrite et bornée (Hugo, 2026-10-06) : d'abord faciliter les
 * tournées suivantes (adresses justes, où se garer, la bonne porte, les
 * consignes d'accès), puis prouver la livraison en cas de litige — jamais
 * suivre les déplacements du livreur, ni mesurer sa vitesse ou son temps de
 * travail. Elle s'efface au bout de `POSITION_RETENTION_DAYS` jours.
 */
export class GesturePosition {
  private constructor(
    readonly lat: number,
    readonly lng: number,
    readonly accuracyM: number,
  ) {}

  /**
   * Un relevé vérifié : un point terrestre, une précision finie et positive.
   * @throws {GesturePositionInvalidError}
   */
  static take(input: GesturePositionInput): GesturePosition {
    if (!Number.isFinite(input.accuracyM) || input.accuracyM < 0) {
      throw new GesturePositionInvalidError();
    }
    try {
      geoPoint(input.lat, input.lng);
    } catch {
      throw new GesturePositionInvalidError();
    }
    return new GesturePosition(input.lat, input.lng, input.accuracyM);
  }
}
