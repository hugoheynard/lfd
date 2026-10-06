import type {
  PurchaseAssistantFormatView,
  PurchaseAssistantRowView,
  PurchaseAssistantView,
} from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { geometryOfFormat } from "../../domain/services/floor/format-geometry.js";
import { type FloorRow, maximizeFormat } from "../../domain/services/floor/maximize-format.js";
import { BinFormat } from "../../domain/value-objects/bin-format.js";
import { binGapCm } from "../../domain/value-objects/bin-gap.js";
import { MM_PER_CM } from "../../domain/value-objects/bin-type-dimensions.js";
import { CargoFloor } from "../../domain/value-objects/cargo-floor.js";
import { AssistBinPurchaseQuery } from "./assist-bin-purchase.query.js";

/**
 * **L'assistant d'achat** (G-D3) : la stratégie « maximiser un format », un
 * format à la fois (G-Q5), sur un plancher SAISI — aucun véhicule n'est lu,
 * c'est l'écran qui pré-remplit. Tout passe par les value objects et en subit
 * les refus : le contrôleur n'a validé que la forme.
 *
 * @throws {InvalidCargoDimensionsError} @throws {InvalidWheelArchesError}
 * @throws {InvalidBinGapError} @throws {InvalidBinDimensionsError}
 * @throws {BinInnerExceedsOuterError} @throws {InvalidBinMaxStackError}
 */
@QueryHandler(AssistBinPurchaseQuery)
export class AssistBinPurchaseHandler implements IQueryHandler<
  AssistBinPurchaseQuery,
  PurchaseAssistantView
> {
  execute({ scenario }: AssistBinPurchaseQuery): Promise<PurchaseAssistantView> {
    const floor = CargoFloor.of(scenario.floor);
    const gap = binGapCm(scenario.gapCm);
    const formats = scenario.formats.map((entry) => ({
      name: entry.name,
      format: BinFormat.of(entry),
    }));
    return Promise.resolve({
      vehicleVolumeLiters: floor.volumeLiters,
      formats: formats.map(({ name, format }): PurchaseAssistantFormatView => {
        const { rows, ...layout } = maximizeFormat(floor, geometryOfFormat(format), gap);
        return { name, ...layout, rows: rows.map(rowInCm) };
      }),
    });
  }
}

/**
 * Le calcul rend des millimètres ; la vue garde ses rangées en centimètres,
 * comme le plan de chargement — à une décimale près depuis que les formats se
 * mesurent au millimètre (une manne à pain : 66,5 cm).
 */
function rowInCm({ fromMm, depthMm, ...row }: FloorRow): PurchaseAssistantRowView {
  return { ...row, fromCm: fromMm / MM_PER_CM, depthCm: depthMm / MM_PER_CM };
}
