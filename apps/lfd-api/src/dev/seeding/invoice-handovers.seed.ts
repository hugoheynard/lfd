import { ConfirmManualHandoverCommand } from "../../handover/application/commands/confirm-manual-handover.command.js";
import { OrderStatus } from "../../platform/database/client/client.js";
import { asStaff, atHour, SEED_STAFF_SUB, type SeedContext } from "./order-placing.seed.js";

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
 * **Le rattrapage** — les commandes du semis jamais retirées (posées avant que
 * le semis ne les remette), retirées par le même geste. Idempotent : une
 * commande déjà retirée n'est plus lue. Ne touche ni aux factures ni aux lots.
 *
 * @returns le nombre de commandes retirées.
 */
export async function handOverPendingSeeded(
  context: SeedContext,
  companyIds: readonly string[],
  note: string,
): Promise<number> {
  const pending = await context.prisma.order.findMany({
    where: {
      companyId: { in: [...companyIds] },
      note,
      handedOverAt: null,
      status: { not: OrderStatus.cancelled },
    },
    select: { orderNumber: true, requestedDeliveryDate: true },
    orderBy: { createdAt: "asc" },
  });
  for (const order of pending) {
    if (order.requestedDeliveryDate === null) {
      continue;
    }
    // `@db.Date` : minuit UTC du jour demandé, dont la date ISO EST le jour.
    const forDay = order.requestedDeliveryDate.toISOString().slice(0, "YYYY-MM-DD".length);
    await handOverAtCounter(context, order.orderNumber, forDay);
  }
  return pending.length;
}
