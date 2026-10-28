import type { WorkshopShortcutsView, WorkshopShortcutView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { BatchShortcutReader } from "../../domain/ports/batch-shortcut.reader.js";
import { GetWorkshopShortcutsQuery } from "./get-workshop-shortcuts.query.js";

/**
 * Les raccourcis que la fiche d'atelier propose sous « Pièces sorties » (plan
 * `fournil/plan-raccourcis-du-fournil.md`, S2), rangés par SKU dans
 * l'ordre de leur position. Une lecture pour toute la fiche, pas une par
 * ligne. Lecture pure.
 */
@QueryHandler(GetWorkshopShortcutsQuery)
export class GetWorkshopShortcutsHandler implements IQueryHandler<
  GetWorkshopShortcutsQuery,
  WorkshopShortcutsView
> {
  constructor(private readonly shortcuts: BatchShortcutReader) {}

  async execute(): Promise<WorkshopShortcutsView> {
    const bySku: Record<string, WorkshopShortcutView[]> = {};
    for (const shortcut of await this.shortcuts.live()) {
      const entry = { id: shortcut.id, label: shortcut.label, pieces: shortcut.pieces };
      (bySku[shortcut.sku] ??= []).push(entry);
    }
    return { bySku };
  }
}
