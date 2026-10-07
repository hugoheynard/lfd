import type { OrderLists } from './delivery-rounds';
import {
  type Board,
  type BoardOrder,
  type BoardStop,
  POOL_KEY,
  withClashes,
} from './rounds-board-model';

/**
 * Le tableau vu comme des LISTES de commandes — chaque tournée par sa clé, et
 * « À répartir » —, et les gestes qui les font passer d'un état à l'autre.
 * Sorti de `rounds-board-model.ts`, qui garde la forme du tableau et sa
 * lecture depuis la composition enregistrée.
 */

/** Les listes du tableau : chaque tournée par sa clé, et « À répartir ». */
export function listsOf(board: Board): OrderLists {
  return {
    ...Object.fromEntries(
      board.rounds.map((round) => [round.key, round.stops.map((stop) => stop.orderId)]),
    ),
    [POOL_KEY]: board.pool.map((order) => order.orderId),
  };
}

function stopOfOrder(order: BoardOrder): BoardStop {
  return {
    orderId: order.orderId,
    stopId: null,
    reference: order.reference,
    sheet: order.sheet,
    window: order.sheet?.window ?? null,
    windowClash: null,
    signals: [],
    broughtBackAt: order.broughtBackAt,
    proposed: false,
    windowMissed: false,
    placementLate: false,
    defaultDemand: null,
    outOfZone: false,
  };
}

/** Une ligne de tournée revenue dans « À répartir » : ce qu'elle en garde. */
export function orderOfStop(stop: BoardStop): BoardOrder {
  return {
    orderId: stop.orderId,
    reference: stop.reference,
    sheet: stop.sheet,
    broughtBackAt: stop.broughtBackAt,
    reason: null,
  };
}

/**
 * Le tableau après un geste, avant que le serveur ne l'ait confirmé : les
 * listes nommées dans `lists` prennent ces commandes, dans cet ordre. Une
 * commande inconnue du tableau est ignorée — l'écran ne l'invente pas.
 */
export function relaidBoard(board: Board, lists: OrderLists): Board {
  const stops = new Map<string, BoardStop>();
  const orders = new Map<string, BoardOrder>();
  for (const round of board.rounds) {
    for (const stop of round.stops) {
      stops.set(stop.orderId, stop);
      orders.set(stop.orderId, orderOfStop(stop));
    }
  }
  for (const order of board.pool) {
    orders.set(order.orderId, order);
    stops.set(order.orderId, stopOfOrder(order));
  }
  const rounds = board.rounds.map((round) => {
    const ids = lists[round.key];
    if (ids === undefined) {
      return round;
    }
    const placed = ids.flatMap((id) => {
      const stop = stops.get(id);
      return stop === undefined ? [] : [stop];
    });
    // La place a changé : l'alerte rouge attend le prochain chronométrage (CA5).
    const untimed = placed.map((stop) => ({ ...stop, placementLate: false }));
    return { ...round, stops: withClashes(untimed) };
  });
  const poolIds = lists[POOL_KEY];
  const pool =
    poolIds === undefined
      ? board.pool
      : poolIds.flatMap((id) => {
          const order = orders.get(id);
          return order === undefined ? [] : [order];
        });
  return { rounds, pool };
}

/**
 * Les opérations qui mènent les tournées de `current` à `desired` — une
 * affectation, un déplacement ou un retrait par commande qui change de liste.
 * L'ordre DANS une tournée n'y est pas : il s'envoie ensuite, en permutation
 * entière (I2), une fois les arrêts créés.
 */
export type LayoutOp =
  | { readonly kind: 'assign'; readonly orderId: string; readonly to: string }
  | { readonly kind: 'move'; readonly orderId: string; readonly from: string; readonly to: string }
  | { readonly kind: 'remove'; readonly orderId: string; readonly from: string };

export function layoutOps(current: OrderLists, desired: OrderLists): readonly LayoutOp[] {
  const where = new Map<string, string>();
  for (const [key, ids] of Object.entries(current)) {
    for (const id of ids) {
      where.set(id, key);
    }
  }
  const wanted = new Map<string, string>();
  for (const [key, ids] of Object.entries(desired)) {
    for (const id of ids) {
      wanted.set(id, key);
    }
  }
  const ops: LayoutOp[] = [];
  for (const [orderId, to] of wanted) {
    const from = where.get(orderId);
    if (from === undefined || from === to) {
      continue;
    }
    if (to === POOL_KEY) {
      ops.push({ kind: 'remove', orderId, from });
    } else if (from === POOL_KEY) {
      ops.push({ kind: 'assign', orderId, to });
    } else {
      ops.push({ kind: 'move', orderId, from, to });
    }
  }
  return ops;
}
