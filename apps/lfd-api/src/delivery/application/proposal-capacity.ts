import type { BinTypeView, VehicleView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DeliveryOrderLinesReader, DeliveryProductsReader } from "../channels/commerce/index.js";
import { BinCatalogReader } from "../domain/ports/bin-catalog.reader.js";
import { type DeclaredBinRow, DeclaredBinsReader } from "../domain/ports/declared-bins.reader.js";
import { FleetReader } from "../domain/ports/fleet.reader.js";
import type { CompositionCapacity } from "../domain/services/capacity-guard.js";
import type { PlanBin, PlanBinType } from "../domain/services/loading-plan.js";
import type { PlanVehicle } from "../domain/services/loading-volume.js";
import { proposePacking } from "../domain/services/propose-packing.js";
import { type DefaultStopBins, stopDemandOf } from "../domain/services/stop-demand.js";
import type { DefaultContainer } from "../domain/value-objects/routing-settings.js";
import { CargoFloor } from "../domain/value-objects/cargo-floor.js";
import { packingTypeOf } from "./delivery-packing-view.js";
import { packingLinesOf } from "./packing-lines.js";

/** La place et la demande, et les commandes dont la demande est inconnue. */
export interface ProposalCapacityReading {
  readonly capacity: CompositionCapacity;
  /** Ni bac déclaré, ni estimation possible : placées sans contrôle, leur tournée dite « place non vérifiée ». */
  readonly unknown: ReadonlySet<string>;
  /** Comptées au contenant par défaut des réglages (2026-10-06) : l'écran le dit « par défaut ». */
  readonly defaulted: ReadonlyMap<string, DefaultedDemand>;
}

/** Ce qu'une commande comptée au défaut occupe, pour l'écran. */
export interface DefaultedDemand {
  readonly binTypeId: string;
  readonly binTypeName: string;
  readonly count: number;
  /** Une part estimée par les contenances s'y ajoute. */
  readonly withEstimate: boolean;
}

/**
 * **Ce que « Proposer » sait de la place** (CA4) : la charge de chaque
 * véhicule de la flotte, et la demande en bacs de chaque commande — les bacs
 * déclarés, sinon l'estimation du colisage (la MÊME `proposePacking` que le
 * poste, types en service et contenances), sinon le contenant par défaut des
 * réglages (2026-10-06), sinon inconnue.
 *
 * Les lignes ne sont lues que pour les commandes sans bac déclaré, par le
 * port du commerce, une commande à la fois (le port n'a pas de lecture
 * groupée, vérifié le 2026-10-06 ; `StopSheets` fait de même).
 */
@Injectable()
export class ProposalCapacity {
  constructor(
    private readonly fleet: FleetReader,
    private readonly catalog: BinCatalogReader,
    private readonly declared: DeclaredBinsReader,
    private readonly lines: DeliveryOrderLinesReader,
    private readonly products: DeliveryProductsReader,
  ) {}

  async of(
    orderIds: readonly string[],
    defaultContainer: DefaultContainer | null,
  ): Promise<ProposalCapacityReading> {
    const unique = [...new Set(orderIds)];
    const [vehicles, types, capacities, declared] = await Promise.all([
      this.fleet.list(),
      this.catalog.listTypes(),
      this.catalog.activeCapacities(),
      this.declared.liveAmong(unique),
    ]);
    const byOrder = groupByOrder(declared);
    const toEstimate = unique.filter((orderId) => !byOrder.has(orderId));
    const [sold, perOrder] = await Promise.all([
      toEstimate.length === 0 ? Promise.resolve([]) : this.products.sold(),
      Promise.all(toEstimate.map((orderId) => this.lines.linesOf(orderId))),
    ]);
    const linesOf = new Map(
      toEstimate.map((orderId, index) => [orderId, packingLinesOf(perOrder[index] ?? [], sold)]),
    );
    const inService = types.filter((type) => type.archivedAt === null).map(packingTypeOf);
    const binTypes = new Map(types.map((type) => [type.id, planBinTypeOf(type)]));
    const defaultBins = defaultBinsOf(defaultContainer, binTypes);
    const bins = new Map<string, readonly PlanBin[]>();
    const unknown = new Set<string>();
    const defaulted = new Map<string, DefaultedDemand>();
    for (const orderId of unique) {
      const lines = linesOf.get(orderId) ?? [];
      const demand = stopDemandOf({
        orderId,
        declared: byOrder.get(orderId) ?? [],
        estimate: lines.length === 0 ? null : proposePacking(lines, inService, capacities),
        binTypes,
        defaultBins,
      });
      if (demand.kind === "unknown") {
        unknown.add(orderId);
        continue;
      }
      bins.set(orderId, demand.bins);
      if (demand.kind === "defaulted" && defaultBins !== null) {
        defaulted.set(orderId, {
          binTypeId: defaultBins.binType.id,
          binTypeName: defaultBins.binType.name,
          count: defaultBins.count,
          withEstimate: demand.withEstimate,
        });
      }
    }
    return { capacity: { vehicles: vehiclesOf(vehicles), bins }, unknown, defaulted };
  }
}

/**
 * Le contenant par défaut, son type résolu au catalogue. Un type absent du
 * catalogue (la clé étrangère l'interdit) vaut « pas de réglage » plutôt
 * qu'un bac inventé.
 */
function defaultBinsOf(
  container: DefaultContainer | null,
  binTypes: ReadonlyMap<string, PlanBinType>,
): DefaultStopBins | null {
  const binType = container === null ? undefined : binTypes.get(container.binTypeId);
  return container === null || binType === undefined ? null : { binType, count: container.count };
}

function groupByOrder(rows: readonly DeclaredBinRow[]): ReadonlyMap<string, DeclaredBinRow[]> {
  const grouped = new Map<string, DeclaredBinRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.orderId) ?? [];
    list.push(row);
    grouped.set(row.orderId, list);
  }
  return grouped;
}

/** La forme EXTÉRIEURE d'un type, en mm — celle que le plan de chargement pose. */
function planBinTypeOf(type: BinTypeView): PlanBinType {
  return {
    id: type.id,
    name: type.name,
    isotherm: type.isotherm,
    outerLengthMm: type.outer.lengthMm,
    outerWidthMm: type.outer.widthMm,
    outerHeightMm: type.outer.heightMm,
    maxStack: type.maxStack,
  };
}

/**
 * La charge de chaque véhicule, comme le plan de chargement la dérive : le
 * plancher (cm) par `CargoFloor`, une seule formule pour le volume.
 */
function vehiclesOf(vehicles: readonly VehicleView[]): ReadonlyMap<string, PlanVehicle> {
  return new Map(
    vehicles.map((vehicle) => {
      const cargo = vehicle.cargo;
      const floor =
        cargo === null
          ? null
          : CargoFloor.of({
              lengthCm: cargo.lengthCm,
              widthCm: cargo.widthCm,
              heightCm: cargo.heightCm,
              wheelArches: vehicle.wheelArches,
            });
      return [
        vehicle.id,
        {
          name: vehicle.name,
          cargoLiters: floor?.volumeLiters ?? null,
          refrigeratedLiters: vehicle.refrigeration?.volumeLiters ?? null,
          floor,
        },
      ];
    }),
  );
}
