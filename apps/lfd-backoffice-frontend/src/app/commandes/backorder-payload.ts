import type { AdminBackorderQuotePayload } from '@lfd/contracts';

import type { OrderDraft } from './nouvelle-commande/draft-payload';

/**
 * **Le corps de la transformation d'un reliquat** — de l'estimation (`/quote`)
 * comme de la passation (`/convert`, plus le total vu) : celui de la saisie
 * de l'équipe (`placePayloadOf`), SANS la société ni les lignes, que le
 * serveur reprend du reliquat au prix d'origine. Le schéma est strict : ni
 * raccourci du comptoir, ni vitrine, ni origine de saisie.
 */
export function backorderPayloadOf(draft: OrderDraft): AdminBackorderQuotePayload {
  return {
    buyerUserId: draft.buyerUserId,
    settlement: draft.settlement,
    ...(draft.offer === null ? {} : { offer: draft.offer }),
    fulfillmentMethod: draft.fulfillmentMethod,
    deliveryAddress: draft.deliveryAddress,
    pickupAddressId: draft.pickupAddressId,
    deliveryAddressId: draft.deliveryAddressId,
    requestedDeliveryDate: draft.requestedDeliveryDate,
    // Omise sans tranche convenue, jamais `null` : même règle que la saisie
    // (`placePayloadOf`) — un `null` effacerait la fenêtre du carnet.
    ...(draft.requestedWindow === null ? {} : { requestedWindow: draft.requestedWindow }),
    note: draft.note,
  };
}
