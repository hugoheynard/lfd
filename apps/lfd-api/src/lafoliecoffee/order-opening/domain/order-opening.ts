import type { OrderOpeningPatch, OrderOpeningView } from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import { firstServiceDayOf } from "./first-service-day.js";

/** Le réglage sans sa trace : ce qu'une lecture rend et ce qu'un patch change. */
export interface OrderOpeningState {
  readonly ordersOpenToB2b: boolean;
  readonly ordersOpenToB2c: boolean;
  /** Le premier jour de service commandable, `AAAA-MM-JJ`, ou `null` (2026-10-28). */
  readonly firstServiceDayB2b: string | null;
  readonly firstServiceDayB2c: string | null;
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
 * Un premier jour commandable posé est un jour du calendrier
 * ({@link firstServiceDayOf}) ; `null` dans le patch le retire.
 *
 * Fermer aux deux est permis : c'est « la boutique ne prend plus de
 * commandes », et le staff saisit toujours.
 */
export class OrderOpening {
  private constructor(
    readonly ordersOpenToB2b: boolean,
    readonly ordersOpenToB2c: boolean,
    readonly firstServiceDayB2b: string | null,
    readonly firstServiceDayB2c: string | null,
    readonly at: Date,
    readonly author: StaffTrace,
  ) {}

  /**
   * L'état d'une lecture, les premiers jours absents lus `null` — le contrat
   * les laisse facultatifs le temps que le back-office les apprenne.
   */
  static stateOf(view: OrderOpeningView): OrderOpeningState {
    return {
      ordersOpenToB2b: view.ordersOpenToB2b,
      ordersOpenToB2c: view.ordersOpenToB2c,
      firstServiceDayB2b: view.firstServiceDayB2b ?? null,
      firstServiceDayB2c: view.firstServiceDayB2c ?? null,
    };
  }

  /**
   * L'état courant, modifié par les seuls champs présents du patch.
   *
   * @throws {InvalidFirstServiceDayError} un premier jour posé qui n'est pas un jour du calendrier.
   */
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
      patch.firstServiceDayB2b === undefined
        ? current.firstServiceDayB2b
        : firstServiceDayOf(patch.firstServiceDayB2b),
      patch.firstServiceDayB2c === undefined
        ? current.firstServiceDayB2c
        : firstServiceDayOf(patch.firstServiceDayB2c),
      input.at,
      input.author,
    );
  }
}
