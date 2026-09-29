import type {
  DeliveryBinDetailView,
  DeliveryBinView,
  DeliveryLoadingBinView,
  DeliveryLoadingDayView,
  DeliveryLoadingRoundView,
  DeliveryLoadingStopView,
  DeliveryOrderBinsView,
} from "@lfd/contracts";

import type { DeliveryOrderFacts } from "../channels/commerce/index.js";
import { loadingStateOf, type StopLoadingState } from "../domain/entities/departure-readiness.js";
import { isSharedBinToRedo, type StopPlace } from "../domain/entities/shared-bin.js";
import type {
  BinDestinationRow,
  BinRow,
  LoadingRoundRow,
  LoadingStopRow,
} from "../domain/ports/delivery-loading.reader.js";

/**
 * Les vues du chargement (plan de tournée, lot 4 ; lot 4 bis, tranche B),
 * calculées par le serveur : le rang « bac 2 / 3 », l'état d'un arrêt
 * (L4-C17) et « à refaire » (v2-4) ne se décident pas à l'écran.
 *
 * Une commande que le commerce ne connaît plus n'a ni numéro ni nom : on n'en
 * invente pas (`""`, comme la composition).
 */

/** Ce qu'on lit d'une commande pour nommer ses bacs. */
export interface OrderNames {
  readonly reference: string;
  readonly customerLabel: string;
}

/** Ce qu'il faut pour dire d'un bac s'il est partagé, et avec qui, et s'il est à refaire. */
export interface BinContext {
  readonly names: ReadonlyMap<string, OrderNames>;
  /** Où est l'arrêt vivant de chaque commande ; absente = dans aucune tournée. */
  readonly places: ReadonlyMap<string, StopPlace>;
}

export function orderNamesOf(order: DeliveryOrderFacts | undefined): OrderNames {
  return { reference: order?.reference ?? "", customerLabel: order?.customerLabel ?? "" };
}

/** Les noms de ces commandes, par identifiant. */
export function namesByOrder(
  orders: readonly DeliveryOrderFacts[],
): ReadonlyMap<string, OrderNames> {
  return new Map(orders.map((order) => [order.orderId, orderNamesOf(order)]));
}

/** Les commandes que ces bacs citent : la leur, et celle de leur moitié partenaire. */
export function ordersCitedBy(bins: readonly BinRow[]): readonly string[] {
  return [
    ...new Set(
      bins.flatMap((bin) => [bin.orderId, ...(bin.partner === null ? [] : [bin.partner.orderId])]),
    ),
  ];
}

/** Le bac partagé est-il à refaire ? Jamais pour un bac non partagé. */
export function binToRedo(bin: BinRow, places: ReadonlyMap<string, StopPlace>): boolean {
  if (bin.partner === null || bin.voidedAt !== null) {
    return false;
  }
  return isSharedBinToRedo(
    places.get(bin.orderId) ?? null,
    places.get(bin.partner.orderId) ?? null,
  );
}

/** Les bacs d'une commande, rangés : rang et total ne comptent que les non annulés. */
export function binViewsOf(
  bins: readonly BinRow[],
  context: BinContext,
): readonly DeliveryBinView[] {
  const live = bins.filter((bin) => bin.voidedAt === null);
  return bins.map((bin) => {
    const index = live.indexOf(bin);
    return binViewOf(bin, context, index < 0 ? null : index + 1, live.length);
  });
}

function binViewOf(
  bin: BinRow,
  context: BinContext,
  index: number | null,
  total: number,
): DeliveryBinView {
  const names = context.names.get(bin.orderId) ?? orderNamesOf(undefined);
  const partnerNames =
    bin.partner === null
      ? null
      : (context.names.get(bin.partner.orderId) ?? orderNamesOf(undefined));
  return {
    binId: bin.id,
    code: bin.code,
    orderId: bin.orderId,
    reference: names.reference,
    customerLabel: names.customerLabel,
    index,
    total,
    voidedAt: bin.voidedAt?.toISOString() ?? null,
    binType: { ...bin.binType },
    half: bin.half,
    physicalBinId: bin.physicalBinId,
    innerBags: bin.innerBags,
    sharedWith:
      bin.partner === null || partnerNames === null
        ? null
        : { binId: bin.partner.binId, orderId: bin.partner.orderId, ...partnerNames },
    toRedo: binToRedo(bin, context.places),
  };
}

export function orderBinsView(
  orderId: string,
  bins: readonly BinRow[],
  context: BinContext,
): DeliveryOrderBinsView {
  const reference = context.names.get(orderId)?.reference ?? "";
  return { orderId, reference, bins: binViewsOf(bins, context) };
}

export function binDetailView(
  bin: BinRow,
  orderBins: readonly BinRow[],
  context: BinContext,
  destination: BinDestinationRow | null,
): DeliveryBinDetailView {
  const view = binViewsOf(orderBins, context).find((candidate) => candidate.binId === bin.id);
  return {
    bin: view ?? binViewOf(bin, context, null, 0),
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
  context: BinContext,
): DeliveryLoadingRoundView {
  return {
    roundId: round.id,
    day: round.serviceDay,
    vehicleName: round.vehicleName,
    passage: round.passage,
    version: round.version,
    departedAt: round.departedAt?.toISOString() ?? null,
    stops: round.stops.map((stop) => loadingStopView(stop, context)),
  };
}

/** Les tournées d'un jour vues du dépôt : combien d'arrêts, combien chargés, combien à refaire. */
export function loadingDayView(
  day: string,
  rounds: readonly LoadingRoundRow[],
  places: ReadonlyMap<string, StopPlace>,
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
      stopsWithBinToRedo: round.stops.filter((stop) =>
        stop.bins.some((bin) => binToRedo(bin, places)),
      ).length,
    })),
  };
}

function stopStateOf(stop: LoadingStopRow): StopLoadingState {
  return loadingStateOf(
    stop.bins.filter((bin) => bin.voidedAt === null).map((bin) => bin.id),
    new Set(stop.loaded.keys()),
  );
}

function loadingStopView(stop: LoadingStopRow, context: BinContext): DeliveryLoadingStopView {
  const names = context.names.get(stop.orderId) ?? orderNamesOf(undefined);
  const live = stop.bins.filter((bin) => bin.voidedAt === null);
  return {
    stopId: stop.stopId,
    orderId: stop.orderId,
    reference: names.reference,
    customerLabel: names.customerLabel,
    position: stop.position,
    state: stopStateOf(stop),
    bins: live.map((bin, index): DeliveryLoadingBinView => ({
      binId: bin.id,
      code: bin.code,
      index: index + 1,
      binTypeName: bin.binType.name,
      half: bin.half,
      innerBags: bin.innerBags,
      sharedWithReference:
        bin.partner === null ? null : (context.names.get(bin.partner.orderId)?.reference ?? ""),
      toRedo: binToRedo(bin, context.places),
      loadedAt: stop.loaded.get(bin.id)?.toISOString() ?? null,
    })),
  };
}
