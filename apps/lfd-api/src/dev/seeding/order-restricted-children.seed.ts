import type { Prisma, PrismaClient } from "../../platform/database/client/client.js";

/**
 * **Ce qui tient une commande en `RESTRICT`, et qu'un semis doit retirer
 * avant elle** : les bons de livraison (plan E1) et leurs lignes, et les
 * remises de panier (M2) — la remise d'un BL et la part d'une ligne tiennent
 * la remise de la commande, qui tient la commande. Même ordre que la purge du
 * scénario (`purgeCommerce`).
 *
 * Une seule liste pour les quatre semis qui retirent des commandes (reset,
 * retraits sans site, sous-comptes, factures, relus le 2026-11-01) : chacun
 * recopiait les deux lignes des BL, et aucun n'a suivi quand les remises de
 * panier sont arrivées. Le rechargement mourait en 409 « Une ressource liée
 * est introuvable » (`order_discounts_order_id_fkey`) dès qu'une commande hors
 * des journées du scénario portait une remise de point — ce qui dépend du jour
 * où l'on recharge.
 */
export async function dropOrderRestrictedChildren(
  prisma: PrismaClient,
  orders: Prisma.OrderWhereInput,
): Promise<void> {
  await prisma.deliveryNoteDiscount.deleteMany({ where: { note: { order: orders } } });
  await prisma.orderLineDiscount.deleteMany({ where: { orderDiscount: { order: orders } } });
  await prisma.orderDiscount.deleteMany({ where: { order: orders } });
  await prisma.deliveryNoteLine.deleteMany({ where: { note: { order: orders } } });
  await prisma.deliveryNote.deleteMany({ where: { order: orders } });
}
