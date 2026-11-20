import {
  pickupOpenTo,
  pickupSlots,
  type AdminOrderEstimateNotice,
  type CounterParticularOrderEstimatePayload,
  type FulfillmentWindow,
  type OrderLineInput,
  type PickupAddressView,
  type PickupSlot,
} from '@lfd/contracts';

/**
 * **La saisie d'une commande particulier au comptoir, sans les articles** —
 * ce que la page compose pour le devis et la passation
 * (`commande-particulier-reglee-en-boutique.md`, § 5).
 *
 * Retrait seulement : aucun mode d'acheminement ne se choisit, aucun champ de
 * règlement n'existe — le lieu (la caisse de la boutique) est implicite à la
 * route. Aucun montant n'est calculé ici.
 */
export interface ParticularOrderChoice {
  readonly buyerUserId: string;
  readonly pickupAddressId: string | null;
  readonly requestedDate: string;
  /** Le créneau convenu, `null` tant qu'il n'est pas choisi — jamais prérempli. */
  readonly window: FulfillmentWindow | null;
  readonly note: string;
}

/** Les points où un particulier peut retirer : ceux ouverts à sa clientèle. */
export function particularPickupsOf(
  points: readonly PickupAddressView[],
): readonly PickupAddressView[] {
  return points.filter((point) => pickupOpenTo(point, 'b2c'));
}

/** Le point par défaut : celui du comptoir qui saisit, s'il est ouvert au particulier. */
export function defaultPickupIdOf(
  points: readonly PickupAddressView[],
  counterPlaceId: string | null,
): string | null {
  return points.some((point) => point.id === counterPlaceId) ? counterPlaceId : null;
}

/** Les créneaux publics du point : un créneau « réservé aux pros » n'est pas le sien. */
export function particularSlotsOf(point: PickupAddressView | null): readonly PickupSlot[] {
  return point === null
    ? []
    : pickupSlots(point.opening).filter((slot) => slot.access === 'public');
}

/**
 * Le corps du devis, ou `null` tant que la saisie n'est pas composable :
 * panier vide, point ou créneau manquant, jour vide.
 */
export function particularEstimatePayloadOf(
  choice: ParticularOrderChoice,
  lines: readonly OrderLineInput[],
): CounterParticularOrderEstimatePayload | null {
  if (
    lines.length === 0 ||
    choice.pickupAddressId === null ||
    choice.window === null ||
    choice.requestedDate === ''
  ) {
    return null;
  }
  return {
    buyerUserId: choice.buyerUserId,
    fulfillmentMethod: 'pickup',
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddressId: choice.pickupAddressId,
    requestedDeliveryDate: choice.requestedDate,
    requestedWindow: choice.window,
    note: choice.note,
    lines: [...lines],
  };
}

/** Ce qui empêche de valider, dit en clair — une liste, jamais un bouton grisé muet. */
export function particularBlockersOf(input: {
  readonly empty: boolean;
  readonly pickupAddressId: string | null;
  readonly hasSlots: boolean;
  readonly window: FulfillmentWindow | null;
  readonly requestedDate: string;
  /** Le refus du devis courant, ou `null`. */
  readonly refusal: AdminOrderEstimateNotice | null;
}): readonly string[] {
  const blockers: string[] = [];
  if (input.empty) {
    blockers.push('Le panier est vide.');
  }
  if (input.pickupAddressId === null) {
    blockers.push('Point de retrait à choisir.');
  } else if (!input.hasSlots) {
    blockers.push(
      'Ce point n’a aucun créneau ouvert aux particuliers — impossible de convenir d’une heure (Réglages › Sites).',
    );
  } else if (input.window === null) {
    blockers.push('Créneau de retrait à choisir.');
  }
  if (input.requestedDate === '') {
    blockers.push('Jour de retrait à choisir.');
  }
  // Tout refus retient, « heure limite rattrapable » comprise : la dérogation
  // se tient par société, et un particulier n'en a pas (§ 5).
  const refusal = input.refusal;
  if (refusal !== null) {
    blockers.push(refusal.message);
  }
  return blockers;
}
