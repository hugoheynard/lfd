import { createHash } from "node:crypto";

import type { OrderSheetDetails } from "../../../channels/commerce/day-orders.reader.js";
import type { ProductionOrderSnapshot } from "../../../day/index.js";

/**
 * **L'empreinte d'une commande, telle que sa fiche l'imprime** (plan
 * `documentation/fournil/plan-impression-provisoire.md`, § 2) : un condensat
 * de tout ce que la fiche de commande et son en-tête portent — référence,
 * client, acheminement, échéance, lignes (article, nom, quantité, unité, sur
 * mesure) et le bloc du bon (adresse, fenêtre, contact, note…).
 *
 * « Modifiée depuis #N » = empreinte différente de celle gardée au tirage #N.
 * La commande servie au fournil ne porte aucun horodatage : l'empreinte évite
 * d'en ajouter un, et de dépendre d'une horloge. Les champs sont posés dans un
 * ordre fixe, jamais par l'ordre des clés d'un objet : deux tirages des mêmes
 * commandes donnent les mêmes empreintes.
 */
export function printedOrderFingerprint(order: ProductionOrderSnapshot): string {
  const printed = [
    order.reference,
    order.customerLabel,
    order.fulfillmentMethod,
    order.destination,
    order.dueAt,
    order.clientele,
    order.siteId,
    order.lines.map((line) => [
      line.sku,
      line.productName,
      line.quantity,
      line.saleUnit,
      line.madeToOrder ?? null,
    ]),
    sheetOf(order.sheetDetails),
  ];
  return createHash("sha256").update(JSON.stringify(printed)).digest("hex");
}

function sheetOf(details: OrderSheetDetails | null): unknown {
  if (details === null) {
    return null;
  }
  const { address, window, contact } = details;
  return [
    details.tradeName,
    details.legalName,
    details.pickupLabel,
    address === null ? null : [address.line1, address.line2, address.postalCode, address.city],
    window === null ? null : [window.start, window.end],
    contact === null ? null : [contact.source, contact.name, contact.phone],
    details.signatureRequired,
    details.note,
    details.recurring,
  ];
}

/** L'empreinte de chaque commande, par `orderId`. */
export function printedFingerprintsOf(
  orders: readonly ProductionOrderSnapshot[],
): ReadonlyMap<string, string> {
  return new Map(orders.map((order) => [order.orderId, printedOrderFingerprint(order)]));
}

/**
 * Les commandes **nouvelles ou modifiées** depuis un tirage : absentes de ses
 * empreintes, ou dont l'empreinte a changé. Une commande qu'il avait et qui
 * n'est plus au jour (annulée, retirée) n'a pas de fiche à réimprimer.
 */
export function changedSince(
  orders: readonly ProductionOrderSnapshot[],
  printed: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  return new Set(
    orders
      .filter((order) => printed.get(order.orderId) !== printedOrderFingerprint(order))
      .map((order) => order.orderId),
  );
}
