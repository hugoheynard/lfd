import type { PackingContainerView, PackingSheet } from "@lfd/contracts";

import type { StationDay, StationOrder } from "../../channels/packing/packing-station.js";

/**
 * **La colonne Contenants, posée sur le poste** (K2b,
 * `colisage/plan-les-bacs-au-colisage.md` §5–§5.1) — fonction pure.
 *
 * Le calcul du poste (`packingBoardOf`) reste inchangé ; ces champs AJOUTÉS
 * s'y greffent, calculés au serveur : l'écran n'additionne rien. Une journée
 * `legacy` (`station = null`) et une commande `counted` se lisent sans
 * contenants, chaque ligne « répartie » à sa quantité si elle est cochée.
 */
export function withContainerList(
  sheets: readonly PackingSheet[],
  station: StationDay | null,
): readonly PackingSheet[] {
  const byOrder = new Map((station?.orders ?? []).map((order) => [order.orderId, order] as const));
  return sheets.map((sheet) => {
    const held = byOrder.get(sheet.orderId);
    return held?.containerMode === "listed" ? listedSheet(sheet, held) : countedSheet(sheet);
  });
}

function countedSheet(sheet: PackingSheet): PackingSheet {
  return {
    ...sheet,
    containerMode: "counted",
    containerList: [],
    lines: sheet.lines.map((line) => {
      const allocated = line.packed ? line.quantity : 0;
      return { ...line, allocated, unallocated: line.quantity - allocated };
    }),
  };
}

function listedSheet(sheet: PackingSheet, held: StationOrder): PackingSheet {
  const containers = held.containerList ?? [];
  const names = new Map(sheet.lines.map((line) => [line.sku, line.productName] as const));
  const allocatedOf = (sku: string): number =>
    containers.reduce(
      (sum, container) => sum + (container.lines.find((line) => line.sku === sku)?.quantity ?? 0),
      0,
    );
  return {
    ...sheet,
    containerMode: "listed",
    containerList: containers.map((container): PackingContainerView => ({
      id: container.id,
      nature: container.nature,
      label: container.label,
      binId: container.bin?.binId ?? null,
      binCode: container.bin?.code ?? null,
      binHalf: container.bin?.half ?? null,
      lines: container.lines.map((line) => ({
        sku: line.sku,
        productName: names.get(line.sku) ?? line.sku,
        quantity: line.quantity,
      })),
      pieces: container.lines.reduce((sum, line) => sum + line.quantity, 0),
    })),
    lines: sheet.lines.map((line) => {
      const allocated = allocatedOf(line.sku);
      return { ...line, allocated, unallocated: Math.max(0, line.quantity - allocated) };
    }),
  };
}
