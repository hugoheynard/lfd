import type { TransferManifestItemView, TransferManifestSectionView } from "@lfd/contracts";

import type { TransferOrderContentsReader } from "../channels/commerce/index.js";
import type { InternalTransfer } from "../domain/entities/internal-transfer.js";

/** La clientèle de chaque commande portée, par identifiant ; une absente est inconnue. */
export type TransferClienteles = ReadonlyMap<string, "pro" | "public">;

const NONE: TransferClienteles = new Map();

/**
 * **La clientèle des commandes de ces transferts**, lue au commerce en UNE
 * lecture (plan `commandes/plan-tri-depart-et-couleurs.md`, L1a) — à chaque
 * lecture, même pour un manifeste figé : elle ne change pas, et le manifeste
 * ne la recopie pas. Le site, lui, est celui du transfert.
 */
export async function transferClientelesOf(
  reader: TransferOrderContentsReader,
  transfers: readonly InternalTransfer[],
): Promise<TransferClienteles> {
  const orderIds = transfers.flatMap((transfer) => transfer.orderIds);
  if (orderIds.length === 0) {
    return NONE;
  }
  const categories = await reader.categoriesOf(orderIds);
  return new Map(
    [...categories].flatMap(([orderId, category]) =>
      category.clientele === null ? [] : [[orderId, category.clientele] as const],
    ),
  );
}

/** La section des commandes, chaque élément portant sa clientèle quand on la connaît. */
export function withClienteles(
  section: TransferManifestSectionView,
  clienteles: TransferClienteles,
): TransferManifestSectionView {
  return { ...section, items: section.items.map((item) => itemWithClientele(item, clienteles)) };
}

function itemWithClientele(
  item: TransferManifestItemView,
  clienteles: TransferClienteles,
): TransferManifestItemView {
  const clientele = item.kind === "order" ? clienteles.get(item.subjectId) : undefined;
  return clientele === undefined ? item : { ...item, clientele };
}
