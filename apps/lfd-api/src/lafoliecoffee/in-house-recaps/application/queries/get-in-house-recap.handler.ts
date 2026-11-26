import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { InHouseRecapNotFoundError } from "../../domain/errors/in-house-recap-errors.js";
import { CurrentNoteVersionsReader } from "../../domain/ports/current-note-versions.reader.js";
import { InHouseRecapReader } from "../../domain/ports/in-house-recap.reader.js";
import { GetInHouseRecapQuery } from "./get-in-house-recap.query.js";
import type { InHouseRecapDetailView } from "./in-house-recap.views.js";

/**
 * Le détail d'un récapitulatif, chaque BL marqué révisé quand sa version
 * courante dépasse la figée (D8) — le jugement est celui de l'agrégat.
 *
 * @throws {InHouseRecapNotFoundError} le récapitulatif n'existe pas.
 */
@QueryHandler(GetInHouseRecapQuery)
export class GetInHouseRecapHandler implements IQueryHandler<
  GetInHouseRecapQuery,
  InHouseRecapDetailView
> {
  constructor(
    private readonly recaps: InHouseRecapReader,
    private readonly versions: CurrentNoteVersionsReader,
  ) {}

  async execute({ recapId }: GetInHouseRecapQuery): Promise<InHouseRecapDetailView> {
    const recap = await this.recaps.load(recapId);
    if (recap === null) {
      throw new InHouseRecapNotFoundError(recapId);
    }
    const state = recap.toState();
    const current = await this.versions.versionsOf(state.notes.map((note) => note.deliveryNoteId));
    const revised = new Set(recap.revisedNotes(current).map((note) => note.deliveryNoteId));
    return {
      id: state.id,
      payerId: state.payerId,
      number: state.number,
      month: state.month.key,
      issuedAt: state.issuedAt.toISOString(),
      hasDocument: state.storageKey !== null,
      replacedById: state.replacedById,
      lines: state.lines,
      notes: state.notes.map((note) => ({
        deliveryNoteId: note.deliveryNoteId,
        number: note.number,
        handedOverAt: note.handedOverAt.toISOString(),
        frozenVersion: note.contentVersion,
        revised: revised.has(note.deliveryNoteId),
      })),
    };
  }
}
