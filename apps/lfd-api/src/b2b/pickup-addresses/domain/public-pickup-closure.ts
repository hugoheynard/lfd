import { minutesOfDay } from "@lfd/contracts";

import { PublicPickupClosurePeriodError } from "./pickup-errors.js";

/** Ce qu'une fermeture porte, en primitives. Les jours sont locaux, `AAAA-MM-JJ`. */
export interface PublicPickupClosureState {
  readonly fromDay: string;
  readonly toDay: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly reason: string;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * **Une fermeture datée du retrait public** (plan `plan-creneaux-de-retrait.md`, D4).
 *
 * Un **intervalle** de jours et non un jour unique comme `AvailabilityException` :
 * une semaine de congés est une ligne, pas sept. Les bornes horaires vont par
 * paire — une fermeture qui n'aurait qu'un côté laisserait le lecteur deviner
 * l'autre, et c'est le genre d'ignorance qu'on finit par combler en inventant.
 *
 * Une fermeture **prime** sur toute règle ; c'est la fonction pure
 * `publicPickupSlotsFor` qui l'applique, ce value object n'en garantit que la
 * forme.
 */
export class PublicPickupClosure {
  private constructor(
    readonly fromDay: string,
    readonly toDay: string,
    readonly startTime: string | null,
    readonly endTime: string | null,
    readonly reason: string,
  ) {}

  /**
   * @throws {PublicPickupClosurePeriodError} les jours ne sont pas des jours,
   *   sont à l'envers, ou les bornes horaires ne vont pas par paire croissante.
   */
  static of(state: PublicPickupClosureState): PublicPickupClosure {
    if (!DAY_PATTERN.test(state.fromDay) || !DAY_PATTERN.test(state.toDay)) {
      throw new PublicPickupClosurePeriodError("donnez deux jours au format AAAA-MM-JJ.");
    }
    if (state.fromDay > state.toDay) {
      throw new PublicPickupClosurePeriodError("le dernier jour doit suivre le premier.");
    }
    if ((state.startTime === null) !== (state.endTime === null)) {
      throw new PublicPickupClosurePeriodError(
        "donnez les deux heures, ou aucune pour fermer la journée entière.",
      );
    }
    if (
      state.startTime !== null &&
      state.endTime !== null &&
      minutesOfDay(state.startTime) >= minutesOfDay(state.endTime)
    ) {
      throw new PublicPickupClosurePeriodError("l'heure de fin doit suivre celle de début.");
    }
    return new PublicPickupClosure(
      state.fromDay,
      state.toDay,
      state.startTime,
      state.endTime,
      state.reason.trim(),
    );
  }

  /** L'état à écrire. */
  toPersistence(): PublicPickupClosureState {
    return {
      fromDay: this.fromDay,
      toDay: this.toDay,
      startTime: this.startTime,
      endTime: this.endTime,
      reason: this.reason,
    };
  }
}
