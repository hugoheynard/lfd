import type { DeliveryAvailabilityPatch } from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";

/** Les deux cases, sans leur trace : ce qu'une lecture rend et ce qu'un patch change. */
export interface DeliveryOpening {
  readonly openToB2b: boolean;
  readonly openToB2c: boolean;
}

/**
 * **À qui la livraison est proposée**, tel qu'on l'écrit.
 *
 * Pas un agrégat : un réglage sans transition ni règle de refus (CLAUDE.md
 * §3.1). Ce que cette classe garantit est la TRACE — un réglage posé porte
 * toujours son instant et son auteur, et ne se construit qu'à partir de l'état
 * courant : un patch qui ne dit rien d'une clientèle la laisse telle quelle.
 *
 * Fermer aux deux est permis : c'est « on ne livre plus », et le retrait reste.
 */
export class DeliveryAvailability {
  private constructor(
    readonly openToB2b: boolean,
    readonly openToB2c: boolean,
    readonly at: Date,
    readonly author: StaffTrace,
  ) {}

  /** L'état courant, modifié par les seules clés présentes du patch. */
  static pose(input: {
    readonly current: DeliveryOpening;
    readonly patch: DeliveryAvailabilityPatch;
    readonly at: Date;
    readonly author: StaffTrace;
  }): DeliveryAvailability {
    const { current, patch } = input;
    return new DeliveryAvailability(
      patch.openToB2b ?? current.openToB2b,
      patch.openToB2c ?? current.openToB2c,
      input.at,
      input.author,
    );
  }
}
