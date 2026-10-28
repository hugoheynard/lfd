import type {
  BillingAddressPayload,
  CustomerOrderView,
  OrderRevisionQuotePayload,
  PickupAddressView,
} from '@lfd/contracts';

import { serviceContentOf } from '../client-orders.service';
import { formatHour } from '../format-hour';
import type { ServiceChoice } from '../order-context.store';

/** Une ligne du brouillon : ce que le client veut, sans prix — le serveur chiffre. */
export interface RevisionLine {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  /** `weight` : la quantité est en grammes, et repart avec son unité (P4). Absent = pièce. */
  readonly saleUnit?: 'weight';
}

/**
 * **La commande voulue**, en cours de saisie (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M3).
 *
 * `service` réutilise la forme du choix de la boutique (`ServiceChoice`) :
 * les dialogues de retrait, d'heure et d'adresse la rendent déjà, et la
 * passation la traduit en champs du panier par `serviceContentOf` — la
 * modification ne réécrit ni l'un ni l'autre. `service` est `null` quand la
 * commande ne permet pas de le reconstituer (une commande sans jour).
 */
export interface RevisionDraft {
  readonly lines: readonly RevisionLine[];
  readonly service: ServiceChoice | null;
}

/**
 * Le brouillon de départ : la commande telle qu'elle est.
 *
 * Le point de retrait est celui que la commande porte (`pickupAddressId`, le
 * site figé à la passation) — plus aucun rapprochement par l'adresse. Une
 * commande d'avant le lot S2 n'en porte pas : `pickupAddressId` reste `null`,
 * et l'écran demande de le choisir plutôt que de deviner. `pickups` ne sert
 * qu'au nom affiché.
 */
export function draftOf(
  order: CustomerOrderView,
  pickups: readonly PickupAddressView[],
): RevisionDraft {
  return {
    lines: order.lines.map((line) => ({
      sku: line.sku,
      name: line.productName,
      quantity: line.quantity,
      ...(line.saleUnit === 'weight' ? { saleUnit: 'weight' as const } : {}),
    })),
    service: serviceOf(order, pickups),
  };
}

function serviceOf(
  order: CustomerOrderView,
  pickups: readonly PickupAddressView[],
): ServiceChoice | null {
  const date = order.requestedDeliveryDate;
  if (date === null) {
    return null;
  }
  const window = order.fulfillment.window.value;
  const slot = window === null ? '' : formatHour(window.start ?? window.end);
  if (order.fulfillmentMethod === 'delivery') {
    const address = order.deliveryAddress;
    if (address === null) {
      return null;
    }
    return {
      mode: 'delivery',
      place: address.label || address.ville,
      at: '',
      address: `${address.ligne1}, ${address.ville}`,
      slot,
      window,
      date,
      codePostal: address.codePostal,
      deliveryAddress: address,
      deliveryAddressId: order.deliveryAddressId,
    };
  }
  const snapshot = order.pickupAddress;
  const pointId = order.pickupAddressId;
  const point = pickups.find((candidate) => candidate.id === pointId) ?? null;
  const place = point === null ? (snapshot?.label ?? '') : point.label || point.ville;
  return {
    mode: 'pickup',
    place,
    at: `au ${place}`,
    address: snapshot === null ? '' : `${snapshot.ligne1}, ${snapshot.ville}`,
    slot,
    window,
    date,
    pickupAddressId: pointId,
  };
}

/** La quantité d'une ligne, bornée à un : zéro se dit par la corbeille. */
export function withQuantity(
  lines: readonly RevisionLine[],
  sku: string,
  quantity: number,
): readonly RevisionLine[] {
  const next = Math.max(1, Math.floor(quantity));
  return lines.map((line) => (line.sku === sku ? { ...line, quantity: next } : line));
}

export function withoutLine(lines: readonly RevisionLine[], sku: string): readonly RevisionLine[] {
  return lines.filter((line) => line.sku !== sku);
}

/** Ajouter un article : une pièce de plus s'il y est déjà, sinon une ligne neuve. */
export function withAdded(
  lines: readonly RevisionLine[],
  added: { readonly sku: string; readonly name: string },
): readonly RevisionLine[] {
  const present = lines.find((line) => line.sku === added.sku);
  if (present !== undefined) {
    return withQuantity(lines, added.sku, present.quantity + 1);
  }
  return [...lines, { sku: added.sku, name: added.name, quantity: 1 }];
}

/**
 * **Le panier envoyé au devis et à la révision**, ou `null` tant qu'il n'est
 * pas complet (aucune ligne, pas de jour, point de retrait à choisir).
 *
 * Ce que l'écran ne modifie pas repart TEL QUE la commande le porte, pour
 * qu'une modification des seules quantités ne change rien d'autre (R6) : la
 * note, et — tant que le mode et l'adresse livrée ne changent pas — le
 * contact et l'exigence de signature figés. Une adresse changée les laisse
 * absents : le serveur reprend alors le réglage de la nouvelle adresse.
 */
export function contentOf(
  draft: RevisionDraft,
  order: CustomerOrderView,
): OrderRevisionQuotePayload | null {
  const service = draft.service;
  if (draft.lines.length === 0 || service === null || service.date === '') {
    return null;
  }
  if (service.mode === 'pickup' && service.pickupAddressId === null) {
    return null;
  }
  const keepsFulfillment = sameFulfillment(service, order);
  return {
    ...serviceContentOf(service),
    note: order.note,
    // Une ligne au poids repart avec son unité : sans elle, le serveur lirait des pièces.
    lines: draft.lines.map((line) =>
      line.saleUnit === 'weight'
        ? { sku: line.sku, quantity: line.quantity, saleUnit: 'weight' as const }
        : { sku: line.sku, quantity: line.quantity },
    ),
    ...(keepsFulfillment
      ? {
          deliveryContact: order.fulfillment.contact.value,
          signatureRequired: order.fulfillment.signatureRequired.value,
        }
      : {}),
  };
}

/** Même mode, et en livraison la même adresse : les consignes figées valent encore. */
function sameFulfillment(service: ServiceChoice, order: CustomerOrderView): boolean {
  if (service.mode !== order.fulfillmentMethod) {
    return false;
  }
  if (service.mode === 'pickup') {
    return true;
  }
  const before = order.deliveryAddress;
  return (
    before !== null &&
    service.deliveryAddressId === order.deliveryAddressId &&
    sameAddress(service.deliveryAddress, before)
  );
}

function sameAddress(a: BillingAddressPayload, b: BillingAddressPayload): boolean {
  return (
    a.ligne1 === b.ligne1 &&
    a.ligne2 === b.ligne2 &&
    a.codePostal === b.codePostal &&
    a.ville === b.ville &&
    a.pays === b.pays
  );
}
