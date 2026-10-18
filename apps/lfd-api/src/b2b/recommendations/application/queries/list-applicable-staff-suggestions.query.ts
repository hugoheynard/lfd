import type { StaffSuggestionPlacement, StaffSuggestionReader } from "@lfd/contracts";

/**
 * **Les règles qui s'appliquent** à un emplacement, aujourd'hui, pour un
 * lecteur (`null` = inconnu), dans l'ordre réglé — la lecture que l'affichage
 * de RS2 emploiera.
 */
export class ListApplicableStaffSuggestionsQuery {
  constructor(
    readonly placement: StaffSuggestionPlacement,
    readonly reader: StaffSuggestionReader | null,
  ) {}
}
