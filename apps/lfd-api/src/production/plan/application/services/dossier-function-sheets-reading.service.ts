import { Injectable, Logger } from "@nestjs/common";

import {
  type EventFunctionSheets,
  EventFunctionSheetsReader,
} from "../../../channels/events/index.js";
import {
  type PreparedEventSheets,
  preparedFunctionSheetsOf,
} from "../../domain/services/day-dossier-function-sheets-pdf.js";

/**
 * **Les fiches de fonction des événements du jour, lues pour le dossier**
 * (`documentation/evenements/plan-evenements.md`) — celles **en vigueur** à
 * chaque tirage : une fiche remplacée sort dans sa version la plus récente.
 *
 * Si les événements ne répondent pas, la panne est journalisée et le service
 * rend `null` : le dossier part sans les fiches, le pied le dit, et il n'est
 * pas archivé — le tirage suivant le refera, comme pour les BL.
 */
@Injectable()
export class DossierFunctionSheetsReading {
  private readonly logger = new Logger(DossierFunctionSheetsReading.name);

  constructor(private readonly sheets: EventFunctionSheetsReader) {}

  async read(serviceDay: string): Promise<readonly PreparedEventSheets[] | null> {
    const events = await this.eventsOrNull(serviceDay);
    return events === null ? null : preparedFunctionSheetsOf(events);
  }

  private async eventsOrNull(serviceDay: string): Promise<readonly EventFunctionSheets[] | null> {
    try {
      return await this.sheets.sheetsFor(serviceDay);
    } catch (error) {
      this.logger.error(
        `Dossier du ${serviceDay} : fiches de fonction illisibles, tiré sans elles et non archivé.`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
