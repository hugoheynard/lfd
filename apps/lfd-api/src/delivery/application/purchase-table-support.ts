import type {
  BinTypeView,
  PurchaseBinCandidateView,
  PurchaseTableFormatRef,
  PurchaseTableFormatView,
  PurchaseTableVehicleRef,
  PurchaseVehicleCandidateView,
  VehicleCargoView,
  VehicleView,
  VehicleWheelArchesView,
} from "@lfd/contracts";

import {
  PurchaseTableItemArchivedError,
  type PurchaseTableItemKind,
  PurchaseTableItemNotFoundError,
  PurchaseTableVehicleWithoutCargoError,
} from "../domain/errors/delivery-purchase-table-errors.js";
import type {
  PurchaseTableFormat,
  PurchaseTableVehicle,
} from "../domain/services/floor/purchase-table.js";
import { BinFormat } from "../domain/value-objects/bin-format.js";
import { CargoFloor } from "../domain/value-objects/cargo-floor.js";

/** Tout ce que le tableau peut citer, relu une fois par requête. */
export interface PurchaseTableSources {
  readonly vehicleCandidates: readonly PurchaseVehicleCandidateView[];
  readonly fleet: readonly VehicleView[];
  readonly binCandidates: readonly PurchaseBinCandidateView[];
  readonly binTypes: readonly BinTypeView[];
}

/** Un véhicule relu : ce que le domaine calcule, et ce que la ligne rend. */
export interface ResolvedVehicle extends PurchaseTableVehicle {
  readonly ref: PurchaseTableVehicleRef;
  readonly name: string;
}

/** Un format relu : sa colonne, et ce que le domaine calcule. */
export interface ResolvedFormat {
  readonly column: PurchaseTableFormatView;
  readonly format: PurchaseTableFormat;
}

/**
 * Relit un véhicule cité : introuvable → 404, archivé ou retiré → 409, sans
 * plancher → 409. Chaque refus nomme l'élément (B-D4, B-D5).
 */
export function resolveVehicle(
  ref: PurchaseTableVehicleRef,
  sources: PurchaseTableSources,
): ResolvedVehicle {
  if (ref.source === "candidate") {
    const found = find(sources.vehicleCandidates, ref.id, "vehicle_candidate");
    ensureCurrent(found.archivedAt, "vehicle_candidate", found.name);
    return vehicleOf(ref, found.name, found.cargo, found.wheelArches, found.priceCentsExclVat);
  }
  const found = find(sources.fleet, ref.id, "fleet_vehicle");
  ensureCurrent(found.retiredAt, "fleet_vehicle", found.name);
  if (found.cargo === null) {
    throw new PurchaseTableVehicleWithoutCargoError(found.name);
  }
  // Un véhicule de la flotte n'a pas de prix : son coût reste inconnu (B-Q3).
  return vehicleOf(ref, found.name, found.cargo, found.wheelArches, null);
}

/** Relit un format cité : introuvable → 404, archivé → 409. */
export function resolveFormat(
  ref: PurchaseTableFormatRef,
  sources: PurchaseTableSources,
): ResolvedFormat {
  if (ref.source === "candidate") {
    const found = find(sources.binCandidates, ref.id, "bin_candidate");
    ensureCurrent(found.archivedAt, "bin_candidate", found.name);
    return formatOf(ref, found, found.unitPriceCentsExclVat);
  }
  const found = find(sources.binTypes, ref.id, "bin_type");
  ensureCurrent(found.archivedAt, "bin_type", found.name);
  // Un type de bac réel n'a pas de prix : l'équipement reste inconnu.
  return formatOf(ref, found, null);
}

function formatOf(
  ref: PurchaseTableFormatRef,
  found: BinTypeView | PurchaseBinCandidateView,
  unitPriceCents: number | null,
): ResolvedFormat {
  return {
    column: {
      source: ref.source,
      id: found.id,
      name: found.name,
      innerVolumeLiters: found.innerVolumeLiters,
      unitPriceCentsExclVat: unitPriceCents,
    },
    format: { format: BinFormat.of(found), unitPriceCents },
  };
}

function vehicleOf(
  ref: PurchaseTableVehicleRef,
  name: string,
  cargo: VehicleCargoView,
  wheelArches: VehicleWheelArchesView | null,
  priceCents: number | null,
): ResolvedVehicle {
  const floor = CargoFloor.of({
    lengthCm: cargo.lengthCm,
    widthCm: cargo.widthCm,
    heightCm: cargo.heightCm,
    wheelArches,
  });
  return { ref, name, floor, priceCents };
}

function find<T extends { readonly id: string }>(
  items: readonly T[],
  id: string,
  kind: PurchaseTableItemKind,
): T {
  const found = items.find((item) => item.id === id);
  if (found === undefined) {
    throw new PurchaseTableItemNotFoundError(kind, id);
  }
  return found;
}

function ensureCurrent(endedAt: string | null, kind: PurchaseTableItemKind, name: string): void {
  if (endedAt !== null) {
    throw new PurchaseTableItemArchivedError(kind, name);
  }
}
