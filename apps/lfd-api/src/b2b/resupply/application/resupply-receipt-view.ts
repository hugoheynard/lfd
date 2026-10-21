import type { ResupplyReceptionView, UnorderedReceiptView } from "@lfd/contracts";

import { expectedLinesOf, type ResupplyReceipt } from "../domain/resupply-receipt.js";
import type { PlacedSiteResupplySnapshot } from "../domain/site-resupply.js";

/** Un auteur que l'annuaire ne connaissait pas a été figé sans nom : on ne l'invente pas. */
function nameOf(name: string): string | null {
  return name === "" ? null : name;
}

/**
 * Un réassort envoyé et sa réception. Avant « Réceptionner », ses lignes
 * attendues sont l'emballé au colisage s'il est connu (lot R3b), sinon le
 * demandé ; après, celles du reçu (attendu figé à
 * la réception, reçu corrigé s'il y a eu un écart).
 */
export function receptionView(
  resupply: PlacedSiteResupplySnapshot,
  receipt: ResupplyReceipt | null,
  packed: ReadonlyMap<string, number> | null = null,
): ResupplyReceptionView {
  const received = receipt?.received ?? null;
  return {
    resupplyId: resupply.id,
    target: resupply.target,
    origin: resupply.origin,
    name: resupply.name,
    placedAt: resupply.placed.at.toISOString(),
    placedBy: nameOf(resupply.placed.author.name),
    status: received === null ? "expected" : "received",
    receivedAt: received?.at.toISOString() ?? null,
    receivedBy: received === null ? null : nameOf(received.author.name),
    lines:
      receipt === null
        ? expectedLinesOf(resupply, packed).map((line) => ({
            sku: line.sku,
            label: line.label,
            expectedQuantity: line.quantity,
            receivedQuantity: null,
          }))
        : receipt.lines.map((line) => ({
            sku: line.sku,
            label: line.label,
            expectedQuantity: line.expectedQuantity ?? 0,
            receivedQuantity: line.receivedQuantity,
          })),
  };
}

/** Le réassort sans commande du jour ; vide si personne n'a rien saisi. */
export function unorderedView(receipt: ResupplyReceipt | null): UnorderedReceiptView {
  const change = receipt?.lastChange ?? null;
  return {
    lines: (receipt?.lines ?? []).map((line) => ({
      sku: line.sku,
      label: line.label,
      receivedQuantity: line.receivedQuantity ?? 0,
    })),
    updatedAt: change === null ? null : change.at.toISOString(),
    updatedBy: change === null ? null : nameOf(change.author.name),
  };
}
