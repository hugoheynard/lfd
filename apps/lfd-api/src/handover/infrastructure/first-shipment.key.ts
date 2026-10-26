import { FIRST_SHIPMENT_RANK, type ShipmentRef } from "../../production/channels/handover/index.js";

/**
 * La clé d'UN envoi `(commande, rang)` sur les trois tables du retrait
 * (`order_handover`, `order_departure`, `order_handover_proof`, plan E7
 * reliquat, lots L3d et L4b).
 */
export function shipmentKey(shipment: ShipmentRef): {
  readonly orderId_rank: { readonly orderId: string; readonly rank: number };
} {
  return { orderId_rank: { orderId: shipment.orderId, rank: shipment.rank } };
}

/** Le filtre `findMany` de plusieurs envois, quel que soit leur rang. */
export function shipmentsOf(shipments: readonly ShipmentRef[]): {
  readonly OR: { readonly orderId: string; readonly rank: number }[];
} {
  return { OR: shipments.map(({ orderId, rank }) => ({ orderId, rank })) };
}

/**
 * Le filtre des envois de RANG 1 de plusieurs commandes — la commande
 * elle-même.
 *
 * Ce qui le lit encore, depuis L4b, répond à une question **sur la
 * commande** et non sur un envoi (vérifié le 2026-10-26, relu en L4c) : la
 * file du comptoir et la feuille de route (une ligne par commande ; les
 * envois prêts se listent dans la fiche depuis L4c, le « reste relivré » est
 * L8), le dossier de facturation et le jour de réception
 * (`OrderHandoverHistoryReader` — la commande se solde en L5 ; l'annulation
 * ne le lit plus depuis L4c, elle lit `ShipmentHandoverReader`, tous rangs),
 * la garde au contrôle qualité (le fournil retient une
 * commande), le retard du commerce sur la clôture (comparé aux numéros de
 * commande). Un reliquat n'y passe pas pour la commande.
 */
export function firstShipmentsOf(orderIds: readonly string[]): {
  readonly orderId: { readonly in: string[] };
  readonly rank: number;
} {
  return { orderId: { in: [...orderIds] }, rank: FIRST_SHIPMENT_RANK };
}
