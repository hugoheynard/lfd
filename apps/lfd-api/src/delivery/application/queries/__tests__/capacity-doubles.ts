import type { VehicleView } from "@lfd/contracts";

import {
  type DeliveryOrderLine,
  DeliveryOrderLinesReader,
} from "../../../channels/commerce/index.js";
import {
  type DeclaredBinRow,
  DeclaredBinsReader,
} from "../../../domain/ports/declared-bins.reader.js";
import type { FleetReader } from "../../../domain/ports/fleet.reader.js";
import { ProposalCapacity } from "../../proposal-capacity.js";
import { FixedBinCatalog, FixedDeliveryProducts } from "../../commands/__tests__/bin-doubles.js";
import { vehicleView } from "../../commands/__tests__/routing-doubles.js";
import { binTypeView } from "./packing-doubles.js";

/** Le produit de toutes les commandes des scènes de « Proposer » : dix par Bac M. */
export const BREAD_SKU = "PAIN-E2E";
export const BIN_M = "bin_m";

/** Les bacs déclarés, figés. */
export class FixedDeclaredBins extends DeclaredBinsReader {
  constructor(private readonly rows: readonly DeclaredBinRow[] = []) {
    super();
  }

  liveAmong(orderIds: readonly string[]): Promise<readonly DeclaredBinRow[]> {
    const wanted = new Set(orderIds);
    return Promise.resolve(this.rows.filter((row) => wanted.has(row.orderId)));
  }
}

/** Chaque commande porte `quantity` pains, sauf celles dont on ne connaît pas les lignes. */
export class BreadForEveryOrder extends DeliveryOrderLinesReader {
  constructor(
    private readonly quantities: ReadonlyMap<string, number> = new Map(),
    private readonly withoutLines: ReadonlySet<string> = new Set(),
  ) {
    super();
  }

  linesOf(orderId: string): Promise<readonly DeliveryOrderLine[]> {
    if (this.withoutLines.has(orderId)) {
      return Promise.resolve([]);
    }
    const quantity = this.quantities.get(orderId) ?? 1;
    return Promise.resolve([{ sku: BREAD_SKU, name: "Pain", quantity }]);
  }
}

/** Un véhicule de la flotte, mesuré (250 × 160 × 140 cm sauf mention). */
export function measuredVehicleView(
  id: string,
  name: string,
  cargo: { readonly lengthCm: number; readonly widthCm: number; readonly heightCm: number } = {
    lengthCm: 250,
    widthCm: 160,
    heightCm: 140,
  },
): VehicleView {
  return {
    ...vehicleView(id, name),
    cargo: {
      ...cargo,
      volumeLiters: Math.floor((cargo.lengthCm * cargo.widthCm * cargo.heightCm) / 1000),
    },
  };
}

/** La place de « Proposer » sur une flotte donnée : un Bac M en service, dix pains par bac. */
export function proposalCapacity(
  fleet: FleetReader,
  options: {
    readonly lines?: DeliveryOrderLinesReader;
    readonly declared?: readonly DeclaredBinRow[];
  } = {},
): ProposalCapacity {
  return new ProposalCapacity(
    fleet,
    new FixedBinCatalog([binTypeView(BIN_M)], [{ binTypeId: BIN_M, sku: BREAD_SKU, units: 10 }]),
    new FixedDeclaredBins(options.declared ?? []),
    options.lines ?? new BreadForEveryOrder(),
    new FixedDeliveryProducts([]),
  );
}
