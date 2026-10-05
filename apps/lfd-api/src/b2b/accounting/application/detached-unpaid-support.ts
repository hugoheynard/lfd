import type { DetachedUnpaidOrdersView } from "@lfd/contracts";

import type { DetachedUnpaidReader } from "../domain/ports/detached-unpaid.reader.js";
import { detachedUnpaidOf } from "../domain/services/detached-unpaid.js";

/**
 * La lecture partagée par l'admin et le client (`plan-sous-comptes.md`
 * §2.1 quater) : les commandes écartées `payer_detached` que `companyId` a
 * commandées en site, ou réglait en principal. Ce n'est pas un handler (§4 de
 * `CLAUDE.md`) : c'est le geste commun de deux lectures.
 */
export async function readDetachedUnpaid(
  reader: DetachedUnpaidReader,
  companyId: string,
): Promise<DetachedUnpaidOrdersView> {
  const rows = await reader.rows();
  const follows = await reader.followsOf([...new Set(rows.map((row) => row.site.id))]);
  const entries = detachedUnpaidOf(companyId, rows, follows);
  const payers = await reader.companies([...new Set(entries.map((entry) => entry.payerId))]);
  return {
    orders: entries.map(({ row, payerId }) => ({
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      placedAt: row.placedAt.toISOString(),
      totalCents: row.totalCents,
      site: { id: row.site.id, enseigne: row.site.name },
      // L'identifiant, jamais un nom inventé, si le payeur a disparu.
      payer: { id: payerId, enseigne: payers.get(payerId)?.name ?? payerId },
      excludedAt: row.excludedAt.toISOString(),
    })),
  };
}
