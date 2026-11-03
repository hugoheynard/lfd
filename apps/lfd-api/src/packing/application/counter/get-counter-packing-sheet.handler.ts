import type { CounterPackingSheetView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CounterPackingSheetNotFoundError } from "../../domain/errors/packing-counter-errors.js";
import { CounterPackingSheetReader } from "../../domain/ports/counter-packing-sheet.reader.js";
import { counterPackingSheetOf } from "../../domain/services/counter-packing-sheet.js";
import { GetCounterPackingSheetQuery } from "./get-counter-packing-sheet.query.js";

/**
 * **La fiche de colis d'une commande, au comptoir** —
 * `GET admin/counter/orders/:orderId/packing-sheet`.
 *
 * Remplace, pour le rail, la lecture du poste entier (constat du 2026-11-03 :
 * tout le board pour une fiche, et un 403 au vendeur qui n'a que le comptoir).
 * Une lecture ciblée en base, pas le board recalculé puis filtré. Il n'écrit
 * rien.
 *
 * @throws {CounterPackingSheetNotFoundError} aucune fiche pour cette commande.
 */
@QueryHandler(GetCounterPackingSheetQuery)
export class GetCounterPackingSheetHandler implements IQueryHandler<
  GetCounterPackingSheetQuery,
  CounterPackingSheetView
> {
  constructor(private readonly sheets: CounterPackingSheetReader) {}

  async execute(query: GetCounterPackingSheetQuery): Promise<CounterPackingSheetView> {
    const source = await this.sheets.latestOf(query.orderId);
    if (source === null) {
      throw new CounterPackingSheetNotFoundError();
    }
    return counterPackingSheetOf(source);
  }
}
