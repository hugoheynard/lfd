import type {
  DeliveryBagDetailView,
  DeliveryBagView,
  DeliveryLoadingDayView,
  DeliveryLoadingRoundView,
  DeliveryLoadingStopView,
  DeliveryOrderBagsView,
} from "@lfd/contracts";

import type { DeliveryOrderFacts } from "../channels/commerce/index.js";
import { loadingStateOf, type StopLoadingState } from "../domain/entities/departure-readiness.js";
import type {
  BagDestinationRow,
  BagRow,
  LoadingRoundRow,
  LoadingStopRow,
} from "../domain/ports/delivery-loading.reader.js";

/**
 * Les vues du chargement (plan de tournée, lot 4), calculées par le serveur :
 * le rang « sac 2 / 3 » et l'état d'un arrêt (L4-C17) ne se décident pas à
 * l'écran.
 *
 * Une commande que le commerce ne connaît plus n'a ni numéro ni nom : on n'en
 * invente pas (`""`, comme la composition).
 */

/** Ce qu'on lit d'une commande pour nommer ses sacs. */
interface OrderNames {
  readonly reference: string;
  readonly customerLabel: string;
}

export function orderNamesOf(order: DeliveryOrderFacts | undefined): OrderNames {
  return { reference: order?.reference ?? "", customerLabel: order?.customerLabel ?? "" };
}

/** Les sacs d'une commande, rangés : rang et total ne comptent que les non annulés. */
export function bagViewsOf(bags: readonly BagRow[], names: OrderNames): readonly DeliveryBagView[] {
  const live = bags.filter((bag) => bag.voidedAt === null);
  return bags.map((bag) => {
    const index = live.indexOf(bag);
    return {
      bagId: bag.id,
      code: bag.code,
      orderId: bag.orderId,
      reference: names.reference,
      customerLabel: names.customerLabel,
      index: index < 0 ? null : index + 1,
      total: live.length,
      voidedAt: bag.voidedAt?.toISOString() ?? null,
    };
  });
}

export function orderBagsView(
  orderId: string,
  bags: readonly BagRow[],
  names: OrderNames,
): DeliveryOrderBagsView {
  return { orderId, reference: names.reference, bags: bagViewsOf(bags, names) };
}

export function bagDetailView(
  bag: BagRow,
  orderBags: readonly BagRow[],
  names: OrderNames,
  destination: BagDestinationRow | null,
): DeliveryBagDetailView {
  const view = bagViewsOf(orderBags, names).find((candidate) => candidate.bagId === bag.id);
  return {
    bag: view ?? missingView(bag, names),
    round:
      destination === null
        ? null
        : {
            roundId: destination.roundId,
            day: destination.serviceDay,
            vehicleName: destination.vehicleName,
            passage: destination.passage,
            departedAt: destination.departedAt?.toISOString() ?? null,
          },
    loadedAt: destination?.loadedAt?.toISOString() ?? null,
  };
}

export function loadingRoundView(
  round: LoadingRoundRow,
  orders: ReadonlyMap<string, DeliveryOrderFacts>,
): DeliveryLoadingRoundView {
  return {
    roundId: round.id,
    day: round.serviceDay,
    vehicleName: round.vehicleName,
    passage: round.passage,
    version: round.version,
    departedAt: round.departedAt?.toISOString() ?? null,
    stops: round.stops.map((stop) => loadingStopView(stop, orderNamesOf(orders.get(stop.orderId)))),
  };
}

/** Les tournées d'un jour vues du dépôt : combien d'arrêts, combien chargés. */
export function loadingDayView(
  day: string,
  rounds: readonly LoadingRoundRow[],
): DeliveryLoadingDayView {
  return {
    day,
    rounds: rounds.map((round) => ({
      roundId: round.id,
      vehicleName: round.vehicleName,
      passage: round.passage,
      departedAt: round.departedAt?.toISOString() ?? null,
      stops: round.stops.length,
      loadedStops: round.stops.filter((stop) => stopStateOf(stop) === "loaded").length,
    })),
  };
}

function stopStateOf(stop: LoadingStopRow): StopLoadingState {
  return loadingStateOf(
    stop.bags.filter((bag) => bag.voidedAt === null).map((bag) => bag.id),
    new Set(stop.loaded.keys()),
  );
}

function loadingStopView(stop: LoadingStopRow, names: OrderNames): DeliveryLoadingStopView {
  const live = stop.bags.filter((bag) => bag.voidedAt === null);
  return {
    stopId: stop.stopId,
    orderId: stop.orderId,
    reference: names.reference,
    customerLabel: names.customerLabel,
    position: stop.position,
    state: stopStateOf(stop),
    bags: live.map((bag, index) => ({
      bagId: bag.id,
      code: bag.code,
      index: index + 1,
      loadedAt: stop.loaded.get(bag.id)?.toISOString() ?? null,
    })),
  };
}

/** Le sac seul, quand la liste de sa commande ne le contient pas (lue à un autre instant). */
function missingView(bag: BagRow, names: OrderNames): DeliveryBagView {
  return {
    bagId: bag.id,
    code: bag.code,
    orderId: bag.orderId,
    reference: names.reference,
    customerLabel: names.customerLabel,
    index: null,
    total: 0,
    voidedAt: bag.voidedAt?.toISOString() ?? null,
  };
}
