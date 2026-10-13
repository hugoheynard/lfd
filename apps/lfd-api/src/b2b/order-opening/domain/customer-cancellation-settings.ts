import {
  CUSTOMER_CANCELLATION_MAX_HOURS_BEFORE,
  type CustomerCancellationSettingsPatch,
} from "@lfd/contracts";

import { DomainError } from "../../../platform/shared/errors/app-error.js";
import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";

/** Le réglage sans sa trace : ce qu'une lecture rend et ce qu'un patch change. */
export interface CustomerCancellationSettingsState {
  readonly openToB2c: boolean;
  readonly hoursBefore: number;
}

/**
 * **Ce que la boutique permet au client d'annuler lui-même**, tel qu'on
 * l'écrit (plan `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.5).
 *
 * Pas un agrégat : un réglage sans transition ni règle de refus (CLAUDE.md
 * §3.1), copié sur `OrderOpening`. La borne du délai (0 à 168 h) est une
 * règle refusée ici, et tenue aussi par un CHECK en base. Ce que cette
 * classe garantit est la TRACE : un réglage posé porte son instant et son
 * auteur, et ne se construit qu'à partir de l'état courant.
 */
export class CustomerCancellationSettings {
  private constructor(
    readonly openToB2c: boolean,
    readonly hoursBefore: number,
    readonly at: Date,
    readonly author: StaffTrace,
  ) {}

  /**
   * L'état courant, modifié par les seules clés présentes du patch.
   *
   * @throws {CancellationDelayOutOfRangeError} délai hors de 0 à 168 heures.
   */
  static pose(input: {
    readonly current: CustomerCancellationSettingsState;
    readonly patch: CustomerCancellationSettingsPatch;
    readonly at: Date;
    readonly author: StaffTrace;
  }): CustomerCancellationSettings {
    const { current, patch } = input;
    const hoursBefore = patch.hoursBefore ?? current.hoursBefore;
    if (
      !Number.isInteger(hoursBefore) ||
      hoursBefore < 0 ||
      hoursBefore > CUSTOMER_CANCELLATION_MAX_HOURS_BEFORE
    ) {
      throw new CancellationDelayOutOfRangeError();
    }
    return new CustomerCancellationSettings(
      patch.openToB2c ?? current.openToB2c,
      hoursBefore,
      input.at,
      input.author,
    );
  }
}

/** Le délai sort de la borne : de 0 à 168 heures (une semaine). */
export class CancellationDelayOutOfRangeError extends DomainError {
  constructor() {
    super(
      "order_settings.cancellation_delay_out_of_range",
      `Le délai d'annulation se règle entre 0 et ${String(CUSTOMER_CANCELLATION_MAX_HOURS_BEFORE)} heures (une semaine).`,
    );
  }
}
