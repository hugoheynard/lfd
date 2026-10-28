import type { SaleUnit } from "@lfd/money";

import type { ProductionBatchSnapshot } from "../entities/production-day.js";
import { activeBatchesOf } from "./production-output.js";
import type { WorksheetDrift, WorksheetSources } from "./production-worksheet.js";
import { byWeightThenName } from "./worksheet-order.js";

/**
 * **Ce que le retirage absorberait**, ligne par ligne.
 *
 * Il nomme les lignes au lieu de rendre un compteur, et dit lesquelles sont
 * **déjà commencées** : c'est le seul cas réellement dangereux du lot — quelqu'un a
 * déclaré avoir sorti 30 pièces d'un article qui en demande 42, et personne ne
 * s'en apercevra avant le colisage.
 *
 * `null` quand rien n'est arrivé : un bandeau qui s'affiche pour dire « rien »
 * apprend à ne plus le lire.
 */
export function driftOf(
  sources: WorksheetSources,
  batches: readonly ProductionBatchSnapshot[],
): WorksheetDrift | null {
  if (sources.arrivals.length === 0) {
    return null;
  }
  const known = new Map(sources.counts.map((item) => [item.sku, item] as const));
  const added = new Map<
    string,
    { productName: string; quantity: number; saleUnit: SaleUnit; lines: number }
  >();
  for (const order of sources.arrivals) {
    for (const item of order.lines) {
      const seen = added.get(item.sku);
      added.set(item.sku, {
        productName: seen?.productName ?? item.productName,
        quantity: (seen?.quantity ?? 0) + item.quantity,
        saleUnit: item.saleUnit,
        lines: (seen?.lines ?? 0) + 1,
      });
    }
  }
  const lines = [...added.entries()].map(([sku, item]) => {
    const current = known.get(sku);
    return {
      sku,
      // Le nom de la fiche l'emporte sur celui de la commande qui arrive : c'est
      // celui que le fournil lit depuis 4 h. `0` en `from` dit un article
      // entièrement neuf, et c'est une information à part entière.
      productName: current?.productName ?? item.productName,
      saleUnit: item.saleUnit,
      // Ce que l'écart pèse dans `addedUnits` : des pièces, une par ligne au
      // poids (P6) — jamais des grammes ajoutés à des croissants.
      addedPieces: item.saleUnit === "weight" ? item.lines : item.quantity,
      from: current?.quantity ?? 0,
      to: (current?.quantity ?? 0) + item.quantity,
      // « Déjà commencée » (D2 des fournées) : au moins une pièce sortie. Le cas
      // dangereux qu'il nommait est celui-là, que la ligne soit complète ou non.
      done: activeBatchesOf(batches, sku).length > 0,
    };
  });
  return {
    orders: sources.arrivals.length,
    addedUnits: lines.reduce((total, entry) => total + entry.addedPieces, 0),
    lines: lines.sort(byWeightThenName).map(({ addedPieces: _pieces, ...entry }) => entry),
  };
}
