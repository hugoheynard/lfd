import { FIRST_SHIPMENT_RANK } from "../../production/channels/handover/index.js";

/**
 * La clé de l'envoi de RANG 1 d'une commande, sur les trois tables du retrait
 * (`order_handover`, `order_departure`, `order_handover_proof`, plan E7
 * reliquat, lot L3d).
 *
 * Les lecteurs et dépôts « par commande » du retrait lisent la commande
 * elle-même, c'est-à-dire son rang 1, jusqu'à ce que le retrait par envoi
 * (L4) leur donne un rang à lire. Un filtre écrit une fois : une ligne de
 * rang > 1 ne peut ainsi jamais passer pour l'attestation de la commande.
 */
export function firstShipmentKey(orderId: string): {
  readonly orderId_rank: { readonly orderId: string; readonly rank: number };
} {
  return { orderId_rank: { orderId, rank: FIRST_SHIPMENT_RANK } };
}

/** Le filtre `findMany` des mêmes lignes, pour plusieurs commandes. */
export function firstShipmentsOf(orderIds: readonly string[]): {
  readonly orderId: { readonly in: string[] };
  readonly rank: number;
} {
  return { orderId: { in: [...orderIds] }, rank: FIRST_SHIPMENT_RANK };
}
