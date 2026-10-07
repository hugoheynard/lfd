import {
  DriverWithoutAccessError,
  DriverWithoutDoorstepError,
} from "../errors/delivery-driver-errors.js";

/**
 * **Qui peut être livreur, au moment du geste** (plan « Ma tournée », MT-D2 v2 ;
 * audit 2026-10-07, B8) : les fiches qui tiennent EFFECTIVEMENT le droit de
 * conduire, et celles qui tiennent les gestes à la porte — lues dans
 * l'annuaire par l'application, jamais par la clé d'un rôle.
 *
 * Un livreur tient les DEUX. Conduire sa tournée (`delivery_driving`) et
 * attester à la porte (`delivery_doorstep`, AP-D9) sont deux droits ; qui ne
 * tenait que le premier était proposé, affecté, chargeait et partait — puis
 * prenait 403 à chaque arrêt, sans pouvoir terminer sa tournée.
 *
 * La règle vit ici, une fois : la liste proposée, le « sans accès » de l'écran
 * Tournées et le refus de l'agrégat la lisent tous trois (2026-10-07).
 */
export class DriverAccess {
  private constructor(
    private readonly driving: ReadonlySet<string>,
    private readonly doorstep: ReadonlySet<string>,
  ) {}

  /** `driving` : qui conduit ; `doorstep` : qui fait les gestes à la porte. */
  static of(driving: Iterable<string>, doorstep: Iterable<string>): DriverAccess {
    return new DriverAccess(new Set(driving), new Set(doorstep));
  }

  /** Peut-elle livrer : conduire ET les gestes à la porte ? */
  canDeliver(staffId: string): boolean {
    return this.driving.has(staffId) && this.doorstep.has(staffId);
  }

  /**
   * Refuse qui ne peut pas livrer, en nommant le droit qui manque — conduire
   * d'abord : sans lui, la personne n'est pas livreur du tout, et c'est ce
   * refus-là qu'elle doit lire.
   *
   * @throws {DriverWithoutAccessError} pas le droit de conduire, ou fiche suspendue.
   * @throws {DriverWithoutDoorstepError} conduit, mais sans les gestes à la porte.
   */
  ensureCanDeliver(staffId: string, vehicleName: string): void {
    if (!this.driving.has(staffId)) {
      throw new DriverWithoutAccessError(vehicleName);
    }
    if (!this.doorstep.has(staffId)) {
      throw new DriverWithoutDoorstepError(vehicleName);
    }
  }
}
