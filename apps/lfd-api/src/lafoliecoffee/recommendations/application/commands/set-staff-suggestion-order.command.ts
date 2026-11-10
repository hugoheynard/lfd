/** **Choisir l'ordre** entre suggestions concurrentes : `recent` ou `priority` (Q3). */
export class SetStaffSuggestionOrderCommand {
  constructor(
    readonly order: string,
    readonly writtenBy: string | null,
  ) {}
}
