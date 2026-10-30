import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "../src/platform/database/client/client.js";

/**
 * **Les remises de panier dans les fixtures** — plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.2, lot M3.
 *
 * Depuis `20261031180000_le_controle_des_remises`, un déclencheur différé
 * refuse au COMMIT une commande dont `discount_cents` n'est pas la somme de
 * ses remises actives (`order_discounts`). Une fixture qui écrit une commande
 * remisée à la main, hors agrégat, écrit donc aussi sa remise — par
 * {@link frozenDiscountsCreate}, dans la même instruction.
 */

/**
 * La remise d'une commande écrite à la main : UNE ligne `frozen` de rang 1,
 * sa part entière au taux donné (`line_ht` : pas de TTC). À imbriquer :
 * `order.create({ data: { …, discounts: frozenDiscountsCreate(500, 5.5) } })`.
 * `0` : aucune ligne — une remise nulle n'en a pas.
 */
export function frozenDiscountsCreate(
  amountCents: number,
  rate: number,
): Prisma.OrderDiscountCreateNestedManyWithoutOrderInput {
  if (amountCents === 0) {
    return {};
  }
  return {
    create: [
      {
        id: randomUUID(),
        origin: "frozen",
        rank: 1,
        baseCents: amountCents,
        amountCents,
        vatShares: [{ rate, htCents: amountCents }],
      },
    ],
  };
}

/**
 * **Écrire sans le contrôle des remises**, le temps d'une transaction — pour
 * fabriquer ce que le contrôle interdit désormais mais que la base a connu :
 * une commande d'avant M3 sans ligne `order_discounts`, ou révisée par
 * l'ancien code (la reprise, § 18.3, existe pour ces commandes-là).
 *
 * `ALTER TABLE … DISABLE TRIGGER` est transactionnel en Postgres : rétabli au
 * COMMIT comme au ROLLBACK, il ne fuit pas dans la suite suivante. Aucune
 * écriture de la transaction n'est jugée, même après le rétablissement — le
 * déclencheur désactivé n'a rien mis en file.
 */
export async function withoutDiscountControl(
  prisma: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'ALTER TABLE "public"."orders" DISABLE TRIGGER order_discounts_match_order_on_orders',
    );
    await tx.$executeRawUnsafe(
      'ALTER TABLE "public"."order_discounts" DISABLE TRIGGER order_discounts_match_order_on_discounts',
    );
    await work(tx);
    await tx.$executeRawUnsafe(
      'ALTER TABLE "public"."order_discounts" ENABLE TRIGGER order_discounts_match_order_on_discounts',
    );
    await tx.$executeRawUnsafe(
      'ALTER TABLE "public"."orders" ENABLE TRIGGER order_discounts_match_order_on_orders',
    );
  });
}

/**
 * Ramène une commande passée par le vrai chemin à ce qu'une commande d'avant
 * M3 portait : AUCUNE remise active. Ses remises sont archivées (jamais
 * supprimées), ce que la reprise lit comme « sans ligne ».
 */
export async function asPlacedBeforeM3(prisma: PrismaClient, orderId: string): Promise<void> {
  await withoutDiscountControl(prisma, async (tx) => {
    await tx.orderDiscount.updateMany({
      where: { orderId, archivedAt: null },
      data: { archivedAt: new Date(0) },
    });
  });
}
