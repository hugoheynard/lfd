import type { OperationCalendarInput } from "../../domain/entities/operation.js";

/**
 * **Régler le calendrier** d'une opération : les cinq dates, ensemble — leur
 * ordre ne se juge qu'à cinq —, et l'affichage de l'heure de clôture.
 */
export class RescheduleOperationCommand {
  constructor(
    readonly key: string,
    readonly calendar: OperationCalendarInput,
    readonly writtenBy: string | null,
  ) {}
}
