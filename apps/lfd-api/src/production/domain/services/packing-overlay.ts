import type { StationDay } from "../../channels/packing/packing-station.js";
import type { ProductionOrderSnapshot } from "../entities/production-day.snapshot.js";

/**
 * **Le poste d'une journée `packing`, lu dans la forme de l'ancien** (plan
 * `colisage/plan-domaine-colisage.md`, K2, §13 B1) — fonctions pures.
 *
 * Le fournil garde le plan arrêté (commandes, lignes, destinations) ; le
 * colisage tient ce qui est au bac, fermé, compté. Les poser l'un sur l'autre
 * rend les mêmes `ProductionOrderSnapshot` que l'ancien poste écrivait : le
 * calcul du poste (`packingBoardOf`) et le contrat restent inchangés.
 *
 * Une commande que le colisage n'a pas encore reçue (liste en route) se lit
 * ouverte et vide — ce qui est vrai : rien n'y est mis.
 */
export function overlayStation(
  orders: readonly ProductionOrderSnapshot[],
  station: StationDay,
): readonly ProductionOrderSnapshot[] {
  const byOrder = new Map(station.orders.map((order) => [order.orderId, order] as const));
  return orders.map((order) => {
    const held = byOrder.get(order.orderId);
    const lines = new Map((held?.lines ?? []).map((line) => [line.sku, line.packed] as const));
    return {
      ...order,
      packed: held?.packed ?? null,
      containers: held?.containers ?? 0,
      lines: order.lines.map((line) => ({ ...line, packed: lines.get(line.sku) ?? null })),
    };
  });
}

/**
 * **Le disponible d'un article au colisage** : reçu − rendu − au bac. Il peut
 * être négatif, comme celui de l'ancien poste — et se lit alors « rien de
 * disponible ». Un article jamais remis vaut zéro.
 */
export function stationAvailable(station: StationDay): (sku: string) => number {
  const free = new Map(
    station.stocks.map(
      (stock) => [stock.sku, stock.received - stock.returned - stock.packed] as const,
    ),
  );
  return (sku) => free.get(sku) ?? 0;
}

/**
 * **Les bacs fermés au colisage, posés sur le plan** (K3a, `PackedOrdersReader`)
 * — seule la fermeture : les lignes, les contenants et la réserve ne sont pas
 * lus. Ses lecteurs (l'état de la journée, le contrôle qualité) ne demandent
 * que « cette commande est-elle colisée ? ».
 */
export function overlaySeals(
  orders: readonly ProductionOrderSnapshot[],
  sealed: ReadonlyMap<string, { readonly at: Date; readonly by: string }>,
): readonly ProductionOrderSnapshot[] {
  return orders.map((order) => ({ ...order, packed: sealed.get(order.orderId) ?? null }));
}
