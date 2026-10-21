import { ConfirmManualHandoverCommand } from "../../handover/application/commands/confirm-manual-handover.command.js";
import { OrderStatus } from "../../platform/database/client/client.js";
import { asStaff, atHour, isoDay, SEED_STAFF_SUB, type SeedContext } from "./order-placing.seed.js";

/**
 * **Les commandes du semis des factures, retirées** — une commande facturée
 * a vécu sa vie jusqu'au bout : le bon du jeudi est retiré au comptoir du Labo
 * le vendredi, dans son créneau pro.
 *
 * Le chemin le plus court que le domaine accepte : `ConfirmManualHandoverCommand`
 * au `Clock` du jour de retrait. La règle du retrait est permissive sur
 * l'avancement (`handoverBlocker` : tout sauf `draft` et `cancelled`, lu le
 * 2026-10-21) — une commande au compte, au Labo, sans transfert ni retenue, se
 * remet sans journée arrêtée ni colisage. Le fait `handover.handed_over` mène
 * ensuite le commerce à `fulfilled`, comme au comptoir.
 *
 * Les commandes passées de `seed:sub-accounts` suivent le même geste, en
 * livraison comprise : le mode ne bloque pas le retrait (`handoverBlocker`).
 *
 * `manual` et non `scan`, pour la raison de `counter-day.seed.ts` : le semis
 * n'a pas de jeton en main.
 */

/** L'heure du retrait : dans le créneau pro du Labo (05:30–06:30). */
const HANDOVER_HOUR = 6;

/** L'instant du retrait d'une commande pour le jour `YYYY-MM-DD` (heure locale). */
export function handoverInstantOf(forDay: string): Date {
  const [year, month, day] = forDay.split("-").map(Number);
  return atHour(new Date(year ?? 0, (month ?? 1) - 1, day ?? 1), HANDOVER_HOUR);
}

/** Retire une commande au comptoir, à l'heure de son jour. */
export async function handOverAtCounter(
  context: SeedContext,
  reference: string,
  forDay: string,
): Promise<void> {
  await asStaff(handoverInstantOf(forDay), () =>
    context.commands.execute(new ConfirmManualHandoverCommand(reference, SEED_STAFF_SUB)),
  );
  await context.settle();
}

/**
 * Une commande pour `forDay` est-elle à retirer au regard de `now` ? Seulement
 * si son jour est PASSÉ : aujourd'hui et demain restent au comptoir.
 */
export function isPastServiceDay(forDay: string, now: Date): boolean {
  return forDay < isoDay(now);
}

/**
 * **Le rattrapage** — les commandes de démonstration des sociétés semées,
 * jamais retirées alors que leur jour est passé (les bons du semis des
 * factures posés avant le 2026-10-21, ceux de `seed:sub-accounts` posés avant
 * qu'il ne retire les siens), retirées par le même geste. Idempotent : une
 * commande déjà retirée n'est plus lue. Ne touche ni aux factures ni aux lots,
 * et jamais à une commande du jour ou à venir.
 *
 * @returns le nombre de commandes retirées.
 */
export async function handOverPastOrders(
  context: SeedContext,
  companyIds: readonly string[],
): Promise<number> {
  const pending = await context.prisma.order.findMany({
    where: {
      companyId: { in: [...companyIds] },
      handedOverAt: null,
      status: { notIn: [OrderStatus.cancelled, OrderStatus.draft] },
    },
    select: { orderNumber: true, requestedDeliveryDate: true },
    orderBy: { createdAt: "asc" },
  });
  let handedOver = 0;
  for (const order of pending) {
    if (order.requestedDeliveryDate === null) {
      continue;
    }
    // `@db.Date` : minuit UTC du jour demandé, dont la date ISO EST le jour.
    const forDay = order.requestedDeliveryDate.toISOString().slice(0, "YYYY-MM-DD".length);
    if (isPastServiceDay(forDay, context.now)) {
      await handOverAtCounter(context, order.orderNumber, forDay);
      handedOver += 1;
    }
  }
  return handedOver;
}
