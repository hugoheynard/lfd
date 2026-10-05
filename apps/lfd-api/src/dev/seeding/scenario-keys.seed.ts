import { createHash } from "node:crypto";

import type { PrismaClient } from "../../platform/database/client/client.js";
import type { PlacedOrder } from "./order-placing.seed.js";

/**
 * **Retrouver, d'une requête à l'autre, les commandes du jour que le scénario a
 * posées** (2026-10-05, `documentation/order/plan-jeu-de-donnees-par-etapes.md`).
 *
 * Tant que la journée se jouait d'une traite, les commandes passaient d'une
 * fonction à l'autre en mémoire. Découpée en étapes, chaque étape est une
 * requête : elle doit savoir quelle commande est « le client qui n'est pas
 * venu », laquelle part en bacs à l'arrêt 2 — sans rien mémoriser à côté de la
 * base, sans quoi une base retouchée à la main mentirait à l'étape suivante.
 *
 * La clé d'idempotence de la passation sert de marque : le semis la DÉRIVE de
 * la journée et du rang de la ligne de semis au lieu de la tirer au hasard, et
 * la passation l'enregistre avec la commande qui en sort
 * (`order_idempotency.order_id`, écrit dans la même transaction). Aucune
 * écriture à la main : c'est le vrai geste de passation qui pose la marque.
 */

/** Les deux files du jour : le comptoir, et la journée de livraison. */
export type ScenarioRole = "counter" | "delivery";

/**
 * La clé d'une ligne de semis du jour — un UUID, puisque le contrat l'exige,
 * dérivé d'un condensat plutôt que tiré : `forDay`, la file et le rang le
 * déterminent entièrement. Version 5 et variante RFC 4122 posées à la main,
 * pour qu'un validateur strict l'accepte comme n'importe quel UUID.
 */
export function scenarioOrderKey(forDay: string, role: ScenarioRole, rank: number): string {
  const hex = createHash("sha256")
    .update(`lfd-dev-scenario:${forDay}:${role}:${String(rank)}`)
    .digest("hex");
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Les commandes posées sous ces clés, par clé. Une clé absente de la carte n'a
 * produit aucune commande — ou sa commande a disparu depuis.
 */
export async function placedByKeys(
  prisma: PrismaClient,
  keys: readonly string[],
): Promise<ReadonlyMap<string, PlacedOrder>> {
  const claims = await prisma.orderIdempotency.findMany({
    where: { key: { in: [...keys] }, orderId: { not: null } },
    select: { key: true, orderId: true },
  });
  const orderIds = claims.flatMap((claim) => (claim.orderId === null ? [] : [claim.orderId]));
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, orderNumber: true },
  });
  const numbers = new Map(orders.map((order) => [order.id, order.orderNumber]));
  const placed = new Map<string, PlacedOrder>();
  for (const claim of claims) {
    const reference = claim.orderId === null ? undefined : numbers.get(claim.orderId);
    if (claim.orderId !== null && reference !== undefined) {
      placed.set(claim.key, { id: claim.orderId, reference });
    }
  }
  return placed;
}
