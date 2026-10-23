import type { PrismaClient } from "../../platform/database/client/client.js";

/**
 * ⚠️ **Retire les retraits qui ne portent pas leur site.** Destructif, base
 * locale seulement (ses appelants refusent toute autre cible).
 *
 * Depuis S2, une commande de retrait fige l'identifiant de son site dans
 * `pickup_address` (`siteId`). Celles d'avant ne l'ont pas : les écrans les
 * colorent en teinte neutre, et le transfert du Village ne peut pas les
 * rattacher. Le poste en gardait vingt le 2026-10-14 (dix-huit particulier,
 * deux sans clientèle), passées à la main entre le 8 septembre et le 12
 * octobre — la coupe des clients les épargnait, leur acheteur étant membre du
 * client gardé.
 *
 * Depuis le 2026-10-23, la migration
 * `20261023200000_les_retraits_d_avant_s2_rattaches` rattache celles qui sont
 * mortes et correspondent à un site unique : ce retrait ne touche plus que
 * les vivantes et les ambiguës (les rattachées portent `siteId` et sont
 * épargnées par construction).
 *
 * Avec elles partent ce qui les désigne dans le commerce : remboursements et
 * demandes de remboursement, issue de facture carte (clés `Restrict`), alertes
 * de compte, clés de passation, demandes client, écritures de points. Leurs
 * lignes suivent en cascade.
 *
 * 🔴 **Une commande déjà prise en comptabilité est GARDÉE** — rattachée à une
 * facture, un relevé ou un prélèvement. La retirer laisserait une pièce
 * comptable sans sa commande ; le compte des gardées est rendu pour qu'on le
 * voie. Aucune ne l'était le 2026-10-14.
 *
 * Le fournil, le colisage et les tournées ne sont pas touchés ici : « Tout
 * recharger » les vide entièrement juste après (`resetProduction`,
 * `resetDeliveryRounds`). La ligne de commande `prisma/reset-to-seed.ts` ne le
 * fait pas — aucune de ces vingt commandes n'y avait de trace (vérifié le
 * 2026-10-14).
 */
export interface SitelessPickupsReport {
  /** Retraits sans site retirés. */
  readonly removed: number;
  /** Retraits sans site gardés parce que la comptabilité les tient. */
  readonly keptInAccounting: number;
}

export async function dropSitelessPickups(prisma: PrismaClient): Promise<SitelessPickupsReport> {
  const pickups = await prisma.order.findMany({
    where: { fulfillmentMethod: "pickup" },
    select: { id: true, pickupAddress: true },
  });
  const siteless = pickups.filter((order) => !carriesSite(order.pickupAddress));
  const candidates = siteless.map((order) => order.id);
  const accounted = await accountedOrders(prisma, candidates);
  const orderIds = candidates.filter((id) => !accounted.has(id));
  if (orderIds.length === 0) {
    return { removed: 0, keptInAccounting: accounted.size };
  }
  const ofOrders = { orderId: { in: orderIds } };
  await prisma.orderRefund.deleteMany({ where: ofOrders });
  await prisma.orderRefundRequest.deleteMany({ where: ofOrders });
  await prisma.cardInvoiceOutcome.deleteMany({ where: ofOrders });
  await prisma.accountAlert.deleteMany({ where: ofOrders });
  await prisma.orderIdempotency.deleteMany({ where: ofOrders });
  await prisma.shopOrderIdempotency.deleteMany({ where: ofOrders });
  await prisma.customerRequest.deleteMany({ where: ofOrders });
  await prisma.loyaltyLedgerEntry.deleteMany({ where: ofOrders });
  const removed = await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  return { removed: removed.count, keptInAccounting: accounted.size };
}

/** Le snapshot du point porte-t-il l'identifiant du site ? (`jsonb` : lu sans le supposer.) */
export function carriesSite(snapshot: unknown): boolean {
  return (
    typeof snapshot === "object" &&
    snapshot !== null &&
    "siteId" in snapshot &&
    typeof snapshot.siteId === "string" &&
    snapshot.siteId !== ""
  );
}

/** Celles qu'une pièce comptable désigne : facture, relevé, prélèvement. */
async function accountedOrders(
  prisma: PrismaClient,
  orderIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const where = { orderId: { in: [...orderIds] } };
  const select = { orderId: true } as const;
  const rows = [
    ...(await prisma.invoiceOrder.findMany({ where, select })),
    ...(await prisma.billingStatementOrder.findMany({ where, select })),
    ...(await prisma.orderCollection.findMany({ where, select })),
  ];
  return new Set(rows.map((row) => row.orderId));
}
