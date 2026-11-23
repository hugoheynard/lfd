import { signal } from '@angular/core';
import type {
  AdminOrderEstimateNotice,
  CounterParticularOrderEstimatePayload,
  FulfillmentMethod,
  OfferedParticularOrderEstimatePayload,
  OrderLineInput,
  OrderOfferNature,
} from '@lfd/contracts';

import { offerOf } from '../commandes/nouvelle-commande/draft-payload';
import { offerReasonIssues } from '../commandes/nouvelle-commande/panier-blockers';
import {
  particularBlockersOf,
  particularEstimatePayloadOf,
  type ParticularOrderChoice,
} from './particular-order-draft';

/**
 * **Offrir la commande d'un particulier** (`la-commande-offerte.md`, § 2.10)
 * — ce que la saisie du particulier ajoute quand l'équipe choisit
 * « Offrir cette commande » : le motif, et le mode d'acheminement, puisqu'une
 * offerte peut être livrée à une adresse dictée.
 *
 * La commande part par sa route à elle (`/admin/offered-orders/particular`) :
 * aucun montant n'est calculé ici, le serveur rend la valeur offerte.
 */

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/u;

/** L'adresse dictée : rue, code postal, ville — le pays est la France. */
export interface DictatedAddress {
  readonly ligne1: string;
  readonly codePostal: string;
  readonly ville: string;
}

/** La tranche de livraison tapée ; vide tant qu'elle ne l'est pas. */
export interface TypedWindow {
  readonly start: string;
  readonly end: string;
}

export const EMPTY_ADDRESS: DictatedAddress = { ligne1: '', codePostal: '', ville: '' };
export const EMPTY_WINDOW: TypedWindow = { start: '', end: '' };

/** Le pays d'une adresse dictée : la livraison ne sort pas de France. */
const DELIVERY_COUNTRY = 'France';

/** L'état de l'offre en cours de saisie, lu par le panier et par la page. */
export class ParticularOfferDraft {
  readonly offering = signal(false);
  readonly method = signal<FulfillmentMethod>('pickup');
  readonly address = signal<DictatedAddress>(EMPTY_ADDRESS);
  readonly deliveryWindow = signal<TypedWindow>(EMPTY_WINDOW);
  readonly nature = signal<OrderOfferNature | null>(null);
  readonly note = signal('');
  readonly notifyCustomer = signal(false);

  /** Le client suivant : rien de l'offre précédente ne reste. */
  clear(): void {
    this.offering.set(false);
    this.method.set('pickup');
    this.address.set(EMPTY_ADDRESS);
    this.deliveryWindow.set(EMPTY_WINDOW);
    this.nature.set(null);
    this.note.set('');
    this.notifyCustomer.set(false);
  }
}

/** Ce que l'offre a décidé, figé — la forme que lisent les fonctions pures. */
export interface ParticularOfferChoice {
  readonly method: FulfillmentMethod;
  readonly address: DictatedAddress;
  readonly deliveryWindow: TypedWindow;
  readonly nature: OrderOfferNature | null;
  readonly note: string;
  readonly notifyCustomer: boolean;
}

export function offerChoiceOf(draft: ParticularOfferDraft): ParticularOfferChoice {
  return {
    method: draft.method(),
    address: draft.address(),
    deliveryWindow: draft.deliveryWindow(),
    nature: draft.nature(),
    note: draft.note(),
    notifyCustomer: draft.notifyCustomer(),
  };
}

function isAddressComplete(address: DictatedAddress): boolean {
  return (
    address.ligne1.trim() !== '' && address.codePostal.trim() !== '' && address.ville.trim() !== ''
  );
}

function isWindowComplete(window: TypedWindow): boolean {
  return TIME_HHMM.test(window.start) && TIME_HHMM.test(window.end) && window.start < window.end;
}

/**
 * Le corps de l'estimation de la commande offerte, ou `null` tant qu'elle
 * n'est pas composable. Le motif n'y part que complet : incomplet, le serveur
 * chiffre la valeur pleine, et la validation reste retenue.
 */
export function offeredParticularEstimatePayloadOf(
  choice: ParticularOrderChoice,
  offer: ParticularOfferChoice,
  lines: readonly OrderLineInput[],
): OfferedParticularOrderEstimatePayload | null {
  const reason = offerOf('offered', offer.nature, offer.note, offer.notifyCustomer);
  const withReason = reason === null ? {} : { offer: reason };
  if (offer.method === 'pickup') {
    const pickup = particularEstimatePayloadOf(choice, lines);
    return pickup === null ? null : { ...pickup, ...withReason };
  }
  if (
    lines.length === 0 ||
    choice.requestedDate === '' ||
    !isAddressComplete(offer.address) ||
    !isWindowComplete(offer.deliveryWindow)
  ) {
    return null;
  }
  return {
    buyerUserId: choice.buyerUserId,
    ...withReason,
    fulfillmentMethod: 'delivery',
    deliveryAddress: {
      label: '',
      ligne1: offer.address.ligne1.trim(),
      ligne2: '',
      codePostal: offer.address.codePostal.trim(),
      ville: offer.address.ville.trim(),
      pays: DELIVERY_COUNTRY,
    },
    deliveryAddressId: null,
    pickupAddressId: null,
    requestedDeliveryDate: choice.requestedDate,
    requestedWindow: { start: offer.deliveryWindow.start, end: offer.deliveryWindow.end },
    note: choice.note,
    lines: [...lines],
  };
}

/** Ce qui empêche d'offrir, dit en clair : l'acheminement, puis le motif, puis le refus. */
export function offeredParticularBlockersOf(input: {
  readonly offer: ParticularOfferChoice;
  readonly empty: boolean;
  readonly pickupAddressId: string | null;
  readonly hasSlots: boolean;
  readonly window: ParticularOrderChoice['window'];
  readonly requestedDate: string;
  readonly refusal: AdminOrderEstimateNotice | null;
}): readonly string[] {
  const { offer, refusal, ...rest } = input;
  const route =
    offer.method === 'pickup'
      ? particularBlockersOf({ ...rest, refusal: null })
      : deliveryBlockersOf(offer, rest.empty, rest.requestedDate);
  return [
    ...route,
    ...offerReasonIssues(offer.nature, offer.note),
    ...(refusal === null ? [] : [refusal.message]),
  ];
}

function deliveryBlockersOf(
  offer: ParticularOfferChoice,
  empty: boolean,
  requestedDate: string,
): readonly string[] {
  const blockers: string[] = [];
  if (empty) {
    blockers.push('Le panier est vide.');
  }
  if (!isAddressComplete(offer.address)) {
    blockers.push('Adresse de livraison à compléter : rue, code postal et ville.');
  }
  if (!isWindowComplete(offer.deliveryWindow)) {
    blockers.push('Créneau de livraison à saisir : de quelle heure à quelle heure.');
  }
  if (requestedDate === '') {
    blockers.push('Jour de livraison à choisir.');
  }
  return blockers;
}

/**
 * Ce que la saisie demande au devis : la commande notée au comptoir, ou la
 * commande offerte — chacune par sa route.
 */
export type ParticularEstimateBody =
  | { readonly offered: false; readonly payload: CounterParticularOrderEstimatePayload }
  | { readonly offered: true; readonly payload: OfferedParticularOrderEstimatePayload };

/** Le corps du devis : offert quand l'offre est cochée (`offer` non nul), sinon celui du comptoir. */
export function particularEstimateBodyOf(
  choice: ParticularOrderChoice,
  offer: ParticularOfferChoice | null,
  lines: readonly OrderLineInput[],
): ParticularEstimateBody | null {
  if (offer !== null) {
    const payload = offeredParticularEstimatePayloadOf(choice, offer, lines);
    return payload === null ? null : { offered: true, payload };
  }
  const payload = particularEstimatePayloadOf(choice, lines);
  return payload === null ? null : { offered: false, payload };
}
