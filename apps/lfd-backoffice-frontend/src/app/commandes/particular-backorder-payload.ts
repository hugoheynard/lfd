import { orderTotalRows, type TotalRow } from '@lfd/b2b-ui/order';
import type {
  AdminBackorderParticularQuotePayload,
  AdminBackorderView,
  AdminOrderEstimateAmountsView,
  PickupAddressView,
  BackorderParticularVenue,
  FulfillmentWindow,
  OrderOfferNature,
} from '@lfd/contracts';

import { offerReasonIssues } from './nouvelle-commande/panier-blockers';
import { offerOf } from './nouvelle-commande/draft-payload';
import { estimateRowsOf, estimateTotalsSource } from './nouvelle-commande/order-estimate';

/**
 * Ce que l'équipe choisit pour transformer le reliquat d'un particulier : le
 * point, le jour, le créneau, la note, et le motif d'une offerte. Les lignes
 * et l'acheteur sont ceux du reliquat, que le serveur reprend.
 */
export interface ParticularBackorderChoice {
  readonly venue: BackorderParticularVenue;
  readonly pickupAddressId: string | null;
  readonly requestedDate: string;
  /** Le créneau convenu, `null` tant qu'il n'est pas choisi — jamais prérempli. */
  readonly window: FulfillmentWindow | null;
  readonly note: string;
  readonly offerNature: OrderOfferNature | null;
  readonly offerNote: string;
  readonly offerNotifiesCustomer: boolean;
}

/**
 * **Le corps de la transformation d'un reliquat de particulier** — de
 * l'estimation (`/quote`) comme de la passation (`/convert`, plus le total
 * vu), ou `null` tant qu'il n'est pas composable (point, créneau ou jour
 * manquant). Retrait seulement. Le motif n'y part que complet : incomplet,
 * le serveur chiffre la valeur pleine, et la validation reste retenue.
 */
export function particularBackorderPayloadOf(
  choice: ParticularBackorderChoice,
): AdminBackorderParticularQuotePayload | null {
  if (choice.pickupAddressId === null || choice.window === null || choice.requestedDate === '') {
    return null;
  }
  const offer =
    choice.venue === 'offered'
      ? offerOf('offered', choice.offerNature, choice.offerNote, choice.offerNotifiesCustomer)
      : null;
  return {
    venue: choice.venue,
    ...(offer === null ? {} : { offer }),
    fulfillmentMethod: 'pickup',
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddressId: choice.pickupAddressId,
    requestedDeliveryDate: choice.requestedDate,
    requestedWindow: choice.window,
    note: choice.note,
  };
}

/** Ce qui empêche de transformer, dit en clair : le retrait, puis le motif d'une offerte. */
export function particularBackorderBlockersOf(input: {
  readonly choice: ParticularBackorderChoice;
  readonly hasSlots: boolean;
  /** Le refus du devis courant, ou `null`. */
  readonly refusal: { readonly message: string } | null;
}): readonly string[] {
  const { choice } = input;
  const blockers: string[] = [];
  if (choice.pickupAddressId === null) {
    blockers.push('Point de retrait à choisir.');
  } else if (!input.hasSlots) {
    blockers.push(
      'Ce point n’a aucun créneau ouvert aux particuliers — impossible de convenir d’une heure (Réglages › Sites).',
    );
  } else if (choice.window === null) {
    blockers.push('Créneau de retrait à choisir.');
  }
  if (choice.requestedDate === '') {
    blockers.push('Jour de retrait à choisir.');
  }
  if (choice.venue === 'offered') {
    blockers.push(...offerReasonIssues(choice.offerNature, choice.offerNote));
  }
  // Tout refus retient : la dérogation d'heure limite se tient par société,
  // et un particulier n'en a pas (`documentation/commandes/reliquat/reliquat.md`, § 6.6, décision 15).
  if (input.refusal !== null) {
    blockers.push(input.refusal.message);
  }
  return blockers;
}

/** Les mots de chaque lieu de règlement. */
export const BACKORDER_VENUE_WORDS: Record<
  BackorderParticularVenue,
  { readonly title: string; readonly confirm: string; readonly action: string }
> = {
  shop_till: {
    title: 'réglée en boutique',
    confirm:
      'La commande sera créée au prix d’origine, et le reliquat fermé. Le client la règle à la caisse de la boutique en venant la retirer : rien n’est encaissé ici.',
    action: 'Créer la commande réglée en boutique',
  },
  offered: {
    title: 'offerte',
    confirm:
      'La commande sera créée offerte — ni facturée, ni prélevée, ni réglée en boutique —, et le reliquat fermé.',
    action: 'Offrir la commande',
  },
};

/** Pourquoi ce reliquat ne se transforme pas ici, ou `null`. */
export function particularBackorderLoadRefusalOf(
  backorder: AdminBackorderView | null,
  offerForbidden: boolean,
): string | null {
  if (backorder === null) {
    return 'Cette commande n’a pas de reliquat.';
  }
  if (backorder.state !== 'open') {
    return 'Ce reliquat est déjà transformé ou abandonné.';
  }
  if (backorder.company !== null) {
    return 'Le reliquat d’une société se transforme par « Transformer ».';
  }
  return offerForbidden ? 'Offrir une commande demande le droit d’offrir.' : null;
}

/**
 * Le détail du devis : au régime `shop_till` (TVA et TTC, rendus par la règle
 * de toute commande, jamais recalculés), ou offert — total nul et valeur
 * offerte, telle que le serveur la rend.
 */
export function particularBackorderTotalRowsOf(
  amounts: AdminOrderEstimateAmountsView | null,
  venue: BackorderParticularVenue,
  pickup: PickupAddressView | null,
  pickups: readonly PickupAddressView[],
): readonly TotalRow[] | null {
  if (amounts === null) {
    return null;
  }
  if (venue === 'offered') {
    return estimateRowsOf(amounts, {
      settlement: 'offered',
      method: 'pickup',
      pickupAddressId: pickup?.id ?? null,
      pickups,
    });
  }
  return orderTotalRows({
    ...estimateTotalsSource(amounts, 'link', 'pickup', pickup),
    settlement: 'shop_till',
  });
}
