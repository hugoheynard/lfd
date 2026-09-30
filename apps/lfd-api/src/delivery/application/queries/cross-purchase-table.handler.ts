import type { PurchaseTableRowView, PurchaseTableView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BinCatalogReader } from "../../domain/ports/bin-catalog.reader.js";
import { FleetReader } from "../../domain/ports/fleet.reader.js";
import { PurchaseBinCandidatesReader } from "../../domain/ports/purchase-bin-candidates.reader.js";
import { PurchaseVehicleCandidatesReader } from "../../domain/ports/purchase-vehicle-candidates.reader.js";
import { crossPurchaseTable } from "../../domain/services/floor/purchase-table.js";
import { binGapCm } from "../../domain/value-objects/bin-gap.js";
import {
  type PurchaseTableSources,
  resolveFormat,
  resolveVehicle,
} from "../purchase-table-support.js";
import { CrossPurchaseTableQuery } from "./cross-purchase-table.query.js";

/**
 * **Le tableau croisé** (B-D4) : relit chaque véhicule et chaque format cités
 * — candidats ou réels — par leurs ports de LECTURE, puis délègue le calcul
 * au domaine (`crossPurchaseTable`). Les quatre listes se lisent en entier,
 * archivés compris, pour qu'un élément archivé se refuse en le NOMMANT
 * plutôt qu'en « introuvable » ; ce sont des bibliothèques de quelques
 * dizaines de fiches.
 *
 * @throws {PurchaseTableItemNotFoundError} un identifiant cité n'existe pas (404).
 * @throws {PurchaseTableItemArchivedError} un élément archivé ou retiré (409).
 * @throws {PurchaseTableVehicleWithoutCargoError} un véhicule de la flotte sans plancher (409).
 * @throws {InvalidBinGapError} un jeu hors bornes (400).
 */
@QueryHandler(CrossPurchaseTableQuery)
export class CrossPurchaseTableHandler implements IQueryHandler<
  CrossPurchaseTableQuery,
  PurchaseTableView
> {
  constructor(
    private readonly vehicleCandidates: PurchaseVehicleCandidatesReader,
    private readonly binCandidates: PurchaseBinCandidatesReader,
    private readonly fleet: FleetReader,
    private readonly binCatalog: BinCatalogReader,
  ) {}

  async execute({ selection }: CrossPurchaseTableQuery): Promise<PurchaseTableView> {
    const gapCm = binGapCm(selection.gapCm);
    const sources = await this.sources();
    const vehicles = selection.vehicles.map((ref) => resolveVehicle(ref, sources));
    const formats = selection.formats.map((ref) => resolveFormat(ref, sources));
    const table = crossPurchaseTable(
      vehicles,
      formats.map(({ format }) => format),
      gapCm,
    );
    return {
      gapCm,
      formats: formats.map(({ column }) => column),
      rows: table.rows.map(({ vehicle, cells, best }): PurchaseTableRowView => ({
        source: vehicle.ref.source,
        id: vehicle.ref.id,
        name: vehicle.name,
        vehicleVolumeLiters: vehicle.floor.volumeLiters,
        priceCentsExclVat: vehicle.priceCents,
        cells,
        best,
      })),
      bestRowByCostPerLiter: table.bestRowByCostPerLiter,
    };
  }

  private async sources(): Promise<PurchaseTableSources> {
    const [vehicleCandidates, binCandidates, fleet, binTypes] = await Promise.all([
      this.vehicleCandidates.list(true),
      this.binCandidates.list(true),
      this.fleet.list(),
      this.binCatalog.listTypes(),
    ]);
    return { vehicleCandidates, binCandidates, fleet, binTypes };
  }
}
