import type { OrderOpeningPatch } from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";

/** Le réglage sans sa trace : ce qu'une lecture rend et ce qu'un patch change. */
export interface OrderOpeningState {
  readonly ordersOpenToB2b: boolean;
  readonly ordersOpenToB2c: boolean;
}

/**
 * **À qui la boutique prend des commandes**, tel qu'on l'écrit (Hugo,
 * 2026-10-09).
 *
 * Pas un agrégat : un réglage sans transition ni règle de refus (CLAUDE.md
 * §3.1), comme `DeliveryAvailability`. Ce que cette classe garantit est la
 * TRACE — un réglage posé porte son instant et son auteur, et ne se construit
 * qu'à partir de l'état courant : un patch qui ne dit rien d'une clientèle la
 * laisse telle quelle.
 *
 * Fermer aux deux est permis : c'est « la boutique ne prend plus de
 * commandes », et le staff saisit toujours.
 */
export class OrderOpening {
  private constructor(
    readonly ordersOpenToB2b: boolean,
    readonly ordersOpenToB2c: boolean,
    readonly at: Date,
    readonly author: StaffTrace,
  ) {}

  /** L'état courant, modifié par les seules clientèles présentes du patch. */
  static pose(input: {
    readonly current: OrderOpeningState;
    readonly patch: OrderOpeningPatch;
    readonly at: Date;
    readonly author: StaffTrace;
  }): OrderOpening {
    const { current, patch } = input;
    return new OrderOpening(
      patch.ordersOpenToB2b ?? current.ordersOpenToB2b,
      patch.ordersOpenToB2c ?? current.ordersOpenToB2c,
      input.at,
      input.author,
    );
  }
}
