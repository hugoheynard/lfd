import type {
  BillingAddressPayload,
  DeliveryAddressView,
  OrderRevisionQuotePayload,
  OrderView,
  PickupAddressView,
} from '@lfd/contracts';

import type { FulfillmentChoice } from '../nouvelle-commande/acheminement-commande/acheminement-commande';
import type { CartLine } from '../nouvelle-commande/cart.store';
import { NEW_ADDRESS, type DraftSnapshot } from '../nouvelle-commande/draft.store';

/**
 * **La commande passée, remise dans la forme de la saisie** — et le chemin
 * retour (plan `documentation/commandes/plan-modifier-une-commande.md`, M3).
 *
 * La modification réutilise le panier et le brouillon de la saisie par
 * l'équipe : ces deux fonctions pures sont toute la traduction, comme
 * `draft-payload.ts` l'est pour un brouillon mis de côté.
 */

/** Deux adresses sont la même si la rue et le code postal concordent. */
function sameStreet(
  left: Pick<BillingAddressPayload, 'ligne1' | 'codePostal'>,
  right: Pick<BillingAddressPayload, 'ligne1' | 'codePostal'>,
): boolean {
  return (
    left.ligne1.trim() === right.ligne1.trim() && left.codePostal.trim() === right.codePostal.trim()
  );
}

/**
 * Les lignes de la commande, **à leur prix figé** : c'est celui qu'une ligne
 * déjà présente garde (R3). Les lignes ajoutées prendront le prix du jour, que
 * seul le devis dit.
 */
export function revisionCartOf(order: {
  readonly lines: readonly Pick<
    OrderView['lines'][number],
    'sku' | 'productName' | 'unitPriceMillicents' | 'quantity'
  >[];
}): readonly CartLine[] {
  return order.lines.map((line) => ({
    sku: line.sku,
    name: line.productName,
    unitPriceMillicents: line.unitPriceMillicents,
    quantity: line.quantity,
  }));
}

/**
 * Les décisions de la commande, dans la forme du brouillon.
 *
 * Le point de retrait est celui que la commande porte (`pickupAddressId`, le
 * site figé à la passation) — plus aucun rapprochement par l'adresse. Une
 * commande d'avant le site figé, ou un point que ce client ne se voit plus
 * offrir, laisse le choix vide : l'écran présélectionne alors comme à la
 * saisie, et le devis dira « Point de retrait » parmi les changements — rien
 * ne bascule en silence. L'adresse livrée, elle, se rapproche encore du
 * carnet par sa rue.
 */
export function revisionDraftOf(
  order: Pick<
    OrderView,
    | 'fulfillmentMethod'
    | 'pickupAddressId'
    | 'deliveryAddress'
    | 'fulfillment'
    | 'requestedDeliveryDate'
    | 'note'
  >,
  pickups: readonly Pick<PickupAddressView, 'id'>[],
  addresses: readonly Pick<DeliveryAddressView, 'id' | 'ligne1' | 'codePostal'>[],
): DraftSnapshot {
  const point = pickups.find((p) => p.id === order.pickupAddressId);
  const delivered = order.deliveryAddress;
  const known =
    delivered === null ? undefined : addresses.find((entry) => sameStreet(entry, delivered));
  return {
    buyerUserId: null,
    method: order.fulfillmentMethod,
    pickupId: point?.id ?? '',
    addressId: delivered === null ? '' : (known?.id ?? NEW_ADDRESS),
    address: {
      ligne1: delivered?.ligne1 ?? '',
      ligne2: delivered?.ligne2 ?? '',
      codePostal: delivered?.codePostal ?? '',
      ville: delivered?.ville ?? '',
    },
    keepAddress: false,
    window: order.fulfillment.window.value,
    requestedDate: order.requestedDeliveryDate ?? '',
    note: order.note,
    // Sans objet : le payeur et le règlement ne changent pas (R2).
    settlement: 'link',
  };
}

/** Ce que la saisie a arrêté, hors des articles. */
export interface RevisionDecisions {
  readonly fulfillment: FulfillmentChoice;
  /** L'entrée du carnet retenue en livraison, `null` pour une adresse dictée. */
  readonly bookAddressId: string | null;
  readonly requestedDeliveryDate: string;
  readonly note: string;
}

/**
 * La commande **voulue**, entière, telle que le devis et la modification la
 * reçoivent.
 *
 * Le contact et l'exigence de signature ne se saisissent pas ici : ils sont
 * renvoyés tels que la commande les porte quand ils y ont été CHOISIS
 * (`override`), et omis sinon — l'absence fait relire le réglage, comme à la
 * passation. Les renvoyer toujours transformerait un défaut en choix.
 */
export function revisionContentOf(
  order: Pick<OrderView, 'fulfillment'>,
  decisions: RevisionDecisions,
  lines: readonly CartLine[],
): OrderRevisionQuotePayload {
  const { fulfillment } = decisions;
  const delivered = fulfillment.method === 'delivery';
  const { contact, signatureRequired } = order.fulfillment;
  return {
    fulfillmentMethod: fulfillment.method,
    deliveryAddress: delivered ? fulfillment.deliveryAddress : null,
    deliveryAddressId: delivered ? decisions.bookAddressId : null,
    pickupAddressId: delivered ? null : fulfillment.pickupAddressId,
    requestedDeliveryDate: decisions.requestedDeliveryDate,
    // Clé OMISE sans tranche, jamais `null` : cf. la saisie (`onPlace`).
    ...(fulfillment.window === null ? {} : { requestedWindow: fulfillment.window }),
    ...(contact.source === 'override' ? { deliveryContact: contact.value } : {}),
    ...(signatureRequired.source === 'override'
      ? { signatureRequired: signatureRequired.value }
      : {}),
    note: decisions.note,
    lines: lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
  };
}

/**
 * L'entrée du carnet effectivement retenue — la même résolution que le
 * sélecteur d'acheminement (`''` = la première du carnet).
 */
export function bookAddressIdOf(
  addressId: string,
  addresses: readonly Pick<DeliveryAddressView, 'id'>[],
): string | null {
  const effective = addressId === '' ? (addresses[0]?.id ?? NEW_ADDRESS) : addressId;
  return effective === NEW_ADDRESS ? null : effective;
}
