import type { BinTypeView } from "@lfd/contracts";

import {
  type DeliveryOrderFacts,
  type DeliveryOrderLine,
  DeliveryOrderLinesReader,
} from "../../../channels/commerce/index.js";
import type { StopPlace } from "../../../domain/entities/shared-bin.js";
import {
  type BinDestinationRow,
  type BinRow,
  DeliveryLoadingReader,
  type LoadingRoundRow,
} from "../../../domain/ports/delivery-loading.reader.js";

/** Les lignes des commandes, figées. */
export class FixedOrderLines extends DeliveryOrderLinesReader {
  constructor(private readonly byOrder: ReadonlyMap<string, readonly DeliveryOrderLine[]>) {
    super();
  }

  linesOf(orderId: string): Promise<readonly DeliveryOrderLine[]> {
    return Promise.resolve(this.byOrder.get(orderId) ?? []);
  }
}

/**
 * Le chargement lu, figé : des tournées dont les arrêts portent leurs bacs.
 * La place d'une commande se dérive des tournées, comme en base (le RANG).
 */
export class FixedLoading extends DeliveryLoadingReader {
  constructor(private readonly rounds: readonly LoadingRoundRow[]) {
    super();
  }

  round(roundId: string): Promise<LoadingRoundRow | null> {
    return Promise.resolve(this.rounds.find((round) => round.id === roundId) ?? null);
  }

  roundsOn(serviceDay: string): Promise<readonly LoadingRoundRow[]> {
    return Promise.resolve(this.rounds.filter((round) => round.serviceDay === serviceDay));
  }

  orderBins(orderId: string): Promise<readonly BinRow[]> {
    return Promise.resolve(
      this.rounds
        .flatMap((round) => round.stops.filter((stop) => stop.orderId === orderId))
        .flatMap((stop) => stop.bins),
    );
  }

  bin(binId: string): Promise<BinRow | null> {
    const all = this.rounds.flatMap((round) => round.stops.flatMap((stop) => stop.bins));
    return Promise.resolve(all.find((bin) => bin.id === binId) ?? null);
  }

  placesOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, StopPlace>> {
    const places = new Map<string, StopPlace>();
    for (const round of this.rounds) {
      round.stops.forEach((stop, rank) => {
        if (orderIds.includes(stop.orderId)) {
          places.set(stop.orderId, { roundId: round.id, rank });
        }
      });
    }
    return Promise.resolve(places);
  }

  destinationOf(): Promise<BinDestinationRow | null> {
    return Promise.resolve(null);
  }
}

/** Une commande livrée, active, connue du commerce. */
export function deliveryOrder(orderId: string, reference: string): DeliveryOrderFacts {
  return {
    orderId,
    reference,
    status: "active",
    customerLabel: `Client ${reference}`,
    day: null,
    delivery: true,
    zoneId: null,
  };
}

/** Un type du catalogue, vu par sa lecture. */
export function binTypeView(
  id: string,
  options: {
    readonly isotherm?: boolean;
    readonly archived?: boolean;
    readonly heightCm?: number;
  } = {},
): BinTypeView {
  const heightCm = options.heightCm ?? 20;
  return {
    id,
    name: `Bac ${id}`,
    outer: { lengthMm: 600, widthMm: 400, heightMm: (heightCm + 2) * 10 },
    inner: { lengthMm: 560, widthMm: 360, heightMm: heightCm * 10 },
    innerVolumeLiters: Math.floor((56 * 36 * heightCm) / 1000),
    isotherm: options.isotherm ?? false,
    maxStack: 6,
    divisible: !(options.isotherm ?? false),
    archivedAt: options.archived === true ? "2026-01-01T00:00:00.000Z" : null,
  };
}

/** Un bac déclaré, tel que le chargement le lit. */
export function binRow(id: string, orderId: string, overrides: Partial<BinRow> = {}): BinRow {
  return {
    id,
    orderId,
    code: id.toUpperCase().padEnd(6, "0").slice(0, 6),
    voidedAt: null,
    binType: { id: "bin_m", name: "Bac bin_m", isotherm: false, archived: false },
    half: "left",
    physicalBinId: `phys_${id}`,
    innerBags: 0,
    partner: null,
    ...overrides,
  };
}

/** Une tournée d'arrêts, dans l'ordre donné. */
export function roundRow(
  id: string,
  stops: readonly { readonly orderId: string; readonly bins?: readonly BinRow[] }[],
  departedAt: Date | null = null,
): LoadingRoundRow {
  return {
    id,
    serviceDay: "2026-10-01",
    vehicleName: "Camionnette 1",
    passage: 1,
    version: 1,
    departedAt,
    stops: stops.map((stop, index) => ({
      stopId: `stop_${stop.orderId}`,
      orderId: stop.orderId,
      position: index + 1,
      bins: stop.bins ?? [],
      loaded: new Map(),
    })),
  };
}
